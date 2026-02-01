import { Request, Response, NextFunction } from "express";

// Tenant context interface
interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

// Extend Express Request to include user with SSO data and tenant context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        isActive: boolean;
        ssoProvider?: string | null;
        ssoToken?: string | null;
        ssoRefreshToken?: string | null;
        ssoTokenExpiry?: Date | null;
        // Multi-tenancy fields
        tenantId?: string;
        primaryTenantId?: string | null;
        platformRole?: string | null;
      };
      // Resolved tenant context for the current request
      tenantContext?: TenantContext;
    }
  }
}
import { 
  getDbSession, 
  createDbSession, 
  deleteDbSession, 
  touchDbSession, 
  cleanupExpiredDbSessions,
  getUserSessions
} from "./db-session-store";

// Shared session storage for backward compatibility and caching
const sessionCache: Map<string, any> = new Map();
const CACHE_TTL_MS = 60 * 1000; // Cache for 1 minute to reduce DB calls

// Session configuration 
const SESSION_DURATION_HOURS = 48; // Increased for better stability

// Get all sessions (for debugging) - now returns cached sessions
export function getAllSessions(): Map<string, any> {
  return sessionCache;
}

// Get a specific session - now uses database with caching
export async function getSession(sessionId: string): Promise<any> {
  // Check cache first
  const cached = sessionCache.get(sessionId);
  if (cached && cached.cacheExpiry > Date.now()) {
    return cached.session;
  }
  
  // Fetch from database
  const session = await getDbSession(sessionId);
  
  // Cache the complete session with SSO data
  if (session) {
    sessionCache.set(sessionId, {
      session: {
        ...session,
        // Ensure SSO data is included in cache
        ssoProvider: session.ssoProvider,
        ssoToken: session.ssoToken,
        ssoRefreshToken: session.ssoRefreshToken,
        ssoTokenExpiry: session.ssoTokenExpiry
      },
      cacheExpiry: Date.now() + CACHE_TTL_MS
    });
  } else {
    // Clear from cache if not in DB
    sessionCache.delete(sessionId);
  }
  
  return session;
}

// Create a new session - now uses database
export async function createSession(sessionId: string, userData: any, ssoData?: any): Promise<void> {
  await createDbSession(sessionId, userData, ssoData);
  
  // Add to cache
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);
  
  const sessionData = {
    ...userData,
    createdAt: new Date(),
    expiresAt,
    lastActivity: new Date()
  };
  
  sessionCache.set(sessionId, {
    session: sessionData,
    cacheExpiry: Date.now() + CACHE_TTL_MS
  });
}

// Delete a session - now uses database
export async function deleteSession(sessionId: string): Promise<void> {
  await deleteDbSession(sessionId);
  sessionCache.delete(sessionId);
}

// Update session activity (keep session alive) - now uses database
export async function touchSession(sessionId: string): Promise<void> {
  await touchDbSession(sessionId);
  
  // Update cache if present
  const cached = sessionCache.get(sessionId);
  if (cached) {
    cached.session.lastActivity = new Date();
    cached.cacheExpiry = Date.now() + CACHE_TTL_MS;
  }
}

// Clean up expired sessions - now uses database
export async function cleanupExpiredSessions(): Promise<void> {
  await cleanupExpiredDbSessions();
  
  // Clear expired entries from cache
  const now = Date.now();
  const entries = Array.from(sessionCache.entries());
  for (const [sessionId, cached] of entries) {
    if (cached.cacheExpiry < now) {
      sessionCache.delete(sessionId);
    }
  }
}

// Lazy-load tenant context to avoid circular dependencies
let tenantContextModule: typeof import("./tenant-context") | null = null;
async function getTenantContextModule() {
  if (!tenantContextModule) {
    tenantContextModule = await import("./tenant-context");
  }
  return tenantContextModule;
}

// Shared authentication middleware - now async with tenant context
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.headers['x-session-id'] as string;
  const requestPath = req.path;
  
  console.log("[AUTH] Session check:", {
    sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
    path: requestPath,
    method: req.method
  });
  
  if (!sessionId) {
    console.log("[AUTH] Request rejected - No session ID provided");
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  const session = await getSession(sessionId);
  if (!session) {
    console.log("[AUTH] Request rejected - Session not found or expired:", {
      sessionId: sessionId.substring(0, 8) + '...',
      path: requestPath
    });
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  // Update session activity
  await touchSession(sessionId);
  
  // Attach user and SSO data to request
  req.user = {
    id: session.id || session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    isActive: true,
    // Include SSO token data for refresh logic
    ssoProvider: session.ssoProvider,
    ssoToken: session.ssoToken,
    ssoRefreshToken: session.ssoRefreshToken,
    ssoTokenExpiry: session.ssoTokenExpiry,
    // Multi-tenancy fields (will be populated below)
    primaryTenantId: session.primaryTenantId || null,
    platformRole: session.platformRole || null
  };
  
  // Resolve tenant context for the user
  try {
    const { resolveTenantForUser, getDefaultTenant } = await getTenantContextModule();
    const tenantContext = await resolveTenantForUser(req.user.id);
    
    if (tenantContext) {
      req.tenantContext = tenantContext;
      req.user.tenantId = tenantContext.tenantId;
    } else {
      // Fall back to default tenant for development/transition
      const defaultTenant = await getDefaultTenant();
      if (defaultTenant) {
        req.tenantContext = defaultTenant;
        req.user.tenantId = defaultTenant.tenantId;
      }
    }
  } catch (error) {
    console.error("[AUTH] Error resolving tenant context:", error);
    // Continue without tenant context - reads will still work
  }
  
  console.log("[AUTH] Session valid:", {
    sessionId: sessionId.substring(0, 8) + '...',
    user: req.user?.email,
    role: req.user?.role,
    tenantId: req.user?.tenantId?.substring(0, 8) || 'none',
    ssoProvider: req.user?.ssoProvider || 'none',
    hasRefreshToken: !!req.user?.ssoRefreshToken
  });
  next();
};

// Role-based access control middleware
// Platform admins (global_admin, constellation_admin) have access to all admin features
export const requireRole = (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    console.log("[AUTH] Insufficient permissions - No user");
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  
  // Platform admins have access to all admin-level features
  const platformRole = user.platformRole;
  const isPlatformAdmin = platformRole === 'global_admin' || platformRole === 'constellation_admin';
  
  // Check if user has required role OR is a platform admin (for admin-level access)
  const hasRequiredRole = roles.includes(user.role);
  const adminRoles = ['admin', 'billing-admin', 'pm', 'executive'];
  const isAdminLevelAccess = roles.some(r => adminRoles.includes(r));
  
  if (!hasRequiredRole && !(isPlatformAdmin && isAdminLevelAccess)) {
    console.log("[AUTH] Insufficient permissions - User role:", user.role, "Platform role:", platformRole, "Required:", roles);
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  next();
};

// Run cleanup every hour
setInterval(() => {
  cleanupExpiredSessions().catch(console.error);
}, 60 * 60 * 1000);

console.log("[SESSION] Session store initialized with database backing");

export default sessionCache;