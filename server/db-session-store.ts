import { db } from "./db";
import { sessions } from "@shared/schema";
import { eq, lt, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

// Session configuration
const SESSION_DURATION_HOURS = 48; // Increased for production stability
const SSO_SESSION_DURATION_HOURS = 72; // Longer duration for SSO sessions

// Get a session from the database
export async function getDbSession(sessionId: string): Promise<any> {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    
    if (!session) {
      return null;
    }
    
    // Check if session has expired
    // For SSO sessions, be more lenient with expiry to allow token refresh
    const isExpired = new Date() > new Date(session.expiresAt);
    const isSsoSession = !!session.ssoProvider;
    
    if (isExpired && !isSsoSession) {
      // Regular sessions: delete if expired
      await deleteDbSession(sessionId);
      console.log("[DB-SESSION] Session expired and removed:", sessionId.substring(0, 4) + '...');
      return null;
    } else if (isExpired && isSsoSession) {
      // SSO sessions: check if we're within grace period (1 hour) for token refresh
      const gracePeriod = 60 * 60 * 1000; // 1 hour grace period
      const timeSinceExpiry = Date.now() - new Date(session.expiresAt).getTime();
      
      if (timeSinceExpiry > gracePeriod) {
        // Beyond grace period, session is truly expired
        await deleteDbSession(sessionId);
        console.log("[DB-SESSION] SSO session expired beyond grace period:", sessionId.substring(0, 4) + '...');
        return null;
      }
      // Within grace period, allow session to continue for token refresh attempt
      console.log("[DB-SESSION] SSO session expired but within grace period, allowing refresh attempt");
    }
    
    // Return session data in expected format
    return {
      id: session.userId,
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      ssoProvider: session.ssoProvider,
      ssoToken: session.ssoToken,
      ssoRefreshToken: session.ssoRefreshToken,
      ssoTokenExpiry: session.ssoTokenExpiry,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt
    };
  } catch (error) {
    console.error("[DB-SESSION] Error getting session:", error);
    return null;
  }
}

// Create a new session in the database
export async function createDbSession(sessionId: string, userData: any, ssoData?: any): Promise<void> {
  try {
    const durationHours = ssoData ? SSO_SESSION_DURATION_HOURS : SESSION_DURATION_HOURS;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);
    
    const sessionData = {
      id: sessionId,
      userId: userData.id || userData.userId,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      ssoProvider: ssoData?.provider || null,
      ssoToken: ssoData?.accessToken || null,
      ssoRefreshToken: ssoData?.refreshToken || null,
      ssoTokenExpiry: ssoData?.tokenExpiry || null,
      expiresAt,
      ipAddress: userData.ipAddress || null,
      userAgent: userData.userAgent || null,
    };
    
    await db.insert(sessions).values(sessionData);
    console.log("[DB-SESSION] Created new session:", sessionId.substring(0, 4) + '...', 'for user:', userData.email);
  } catch (error) {
    console.error("[DB-SESSION] Error creating session:", error);
    throw error;
  }
}

// Update session activity and extend expiration
export async function touchDbSession(sessionId: string): Promise<void> {
  try {
    const [existingSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    
    if (!existingSession) {
      return;
    }
    
    // Calculate new expiration based on whether it's SSO or regular session
    const durationHours = existingSession.ssoProvider ? SSO_SESSION_DURATION_HOURS : SESSION_DURATION_HOURS;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);
    
    await db
      .update(sessions)
      .set({
        lastActivity: new Date(),
        expiresAt
      })
      .where(eq(sessions.id, sessionId));
  } catch (error) {
    console.error("[DB-SESSION] Error touching session:", error);
  }
}

// Delete a session from the database
export async function deleteDbSession(sessionId: string): Promise<void> {
  try {
    const result = await db
      .delete(sessions)
      .where(eq(sessions.id, sessionId));
    
    console.log("[DB-SESSION] Deleted session:", sessionId.substring(0, 4) + '...');
  } catch (error) {
    console.error("[DB-SESSION] Error deleting session:", error);
  }
}

// Clean up expired sessions from the database
export async function cleanupExpiredDbSessions(): Promise<void> {
  try {
    const now = new Date();
    const result = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now));
    
    console.log(`[DB-SESSION] Cleaned up expired sessions`);
  } catch (error) {
    console.error("[DB-SESSION] Error cleaning up sessions:", error);
  }
}

// Get all sessions for a user (for debugging and session management)
export async function getUserSessions(userId: string): Promise<any[]> {
  try {
    const userSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    
    return userSessions;
  } catch (error) {
    console.error("[DB-SESSION] Error getting user sessions:", error);
    return [];
  }
}

// Invalidate all sessions for a user (useful for security events)
export async function invalidateUserSessions(userId: string): Promise<void> {
  try {
    await db
      .delete(sessions)
      .where(eq(sessions.userId, userId));
    
    console.log("[DB-SESSION] Invalidated all sessions for user:", userId);
  } catch (error) {
    console.error("[DB-SESSION] Error invalidating user sessions:", error);
  }
}

// Update SSO tokens for a session
export async function updateSsoTokens(sessionId: string, ssoData: any): Promise<void> {
  try {
    // Also extend session expiry when tokens are refreshed successfully
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + SSO_SESSION_DURATION_HOURS);
    
    await db
      .update(sessions)
      .set({
        ssoToken: ssoData.accessToken,
        ssoRefreshToken: ssoData.refreshToken,
        ssoTokenExpiry: ssoData.tokenExpiry,
        lastActivity: new Date(),
        expiresAt: newExpiresAt
      })
      .where(eq(sessions.id, sessionId));
    
    console.log("[DB-SESSION] Updated SSO tokens and extended session for:", sessionId.substring(0, 4) + '...');
  } catch (error) {
    console.error("[DB-SESSION] Error updating SSO tokens:", error);
  }
}

// Check if SSO token needs refresh (within 5 minutes of expiry)
export async function needsSsoRefresh(sessionId: string): Promise<boolean> {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    
    if (!session || !session.ssoTokenExpiry) {
      return false;
    }
    
    const expiryTime = new Date(session.ssoTokenExpiry).getTime();
    const currentTime = new Date().getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (expiryTime - currentTime) <= fiveMinutes;
  } catch (error) {
    console.error("[DB-SESSION] Error checking SSO refresh:", error);
    return false;
  }
}

// Extend session when SSO token expires but can't be refreshed
export async function extendSessionOnTokenExpiry(sessionId: string): Promise<void> {
  try {
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + 24); // Extend by 24 hours when token refresh fails
    
    await db
      .update(sessions)
      .set({
        expiresAt: newExpiresAt,
        lastActivity: new Date()
      })
      .where(eq(sessions.id, sessionId));
    
    console.log("[DB-SESSION] Extended session due to token expiry for:", sessionId.substring(0, 4) + '...');
  } catch (error) {
    console.error("[DB-SESSION] Error extending session:", error);
  }
}

console.log("[DB-SESSION] Database session store initialized");