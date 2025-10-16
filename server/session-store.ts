import { Request, Response, NextFunction } from "express";

// Extend Express Request to include user with SSO data
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
      };
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

// Shared authentication middleware - now async
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
    ssoTokenExpiry: session.ssoTokenExpiry
  };
  
  console.log("[AUTH] Session valid:", {
    sessionId: sessionId.substring(0, 8) + '...',
    user: req.user?.email,
    role: req.user?.role,
    ssoProvider: req.user?.ssoProvider || 'none',
    hasRefreshToken: !!req.user?.ssoRefreshToken
  });
  next();
};

// Role-based access control middleware
export const requireRole = (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) {
    console.log("[AUTH] Insufficient permissions - User role:", req.user?.role, "Required:", roles);
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