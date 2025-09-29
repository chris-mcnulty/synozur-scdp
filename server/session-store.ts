import { Request, Response, NextFunction } from "express";

// Shared session storage for the entire application
const sessions: Map<string, any> = new Map();

// Session configuration
const SESSION_DURATION_HOURS = 24;

// Get all sessions (for debugging)
export function getAllSessions(): Map<string, any> {
  return sessions;
}

// Get a specific session
export function getSession(sessionId: string): any {
  const session = sessions.get(sessionId);
  
  // Check if session exists and hasn't expired
  if (session && session.expiresAt) {
    if (new Date() > new Date(session.expiresAt)) {
      sessions.delete(sessionId);
      console.log("[SESSION] Session expired and removed:", sessionId.substring(0, 4) + '...');
      return null;
    }
  }
  
  return session;
}

// Create a new session
export function createSession(sessionId: string, userData: any): void {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);
  
  const sessionData = {
    ...userData,
    createdAt: new Date(),
    expiresAt,
    lastActivity: new Date()
  };
  
  sessions.set(sessionId, sessionData);
  console.log("[SESSION] Created new session:", sessionId.substring(0, 4) + '...', 'for user:', userData.email);
}

// Delete a session
export function deleteSession(sessionId: string): void {
  const existed = sessions.has(sessionId);
  sessions.delete(sessionId);
  if (existed) {
    console.log("[SESSION] Deleted session:", sessionId.substring(0, 4) + '...');
  }
}

// Update session activity (keep session alive)
export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = new Date();
    // Optionally extend expiration on activity
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);
    session.expiresAt = expiresAt;
  }
}

// Clean up expired sessions
export function cleanupExpiredSessions(): void {
  const now = new Date();
  let cleaned = 0;
  
  sessions.forEach((session, sessionId) => {
    if (session.expiresAt && new Date(session.expiresAt) < now) {
      sessions.delete(sessionId);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`[SESSION] Cleaned up ${cleaned} expired sessions`);
  }
}

// Shared authentication middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.headers['x-session-id'] as string;
  
  console.log("[AUTH] Session check - SessionId:", sessionId ? sessionId.substring(0, 4) + '...' : 'none');
  
  if (!sessionId) {
    console.log("[AUTH] No session ID provided");
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  const session = getSession(sessionId);
  if (!session) {
    console.log("[AUTH] Session not found or expired");
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  // Update session activity
  touchSession(sessionId);
  
  // Attach user to request
  req.user = {
    id: session.id || session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    isActive: true
  };
  
  console.log("[AUTH] Session valid - User:", req.user?.email, "Role:", req.user?.role);
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
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

console.log("[SESSION] Session store initialized");

export default sessions;