import { msalInstance, tokenRequest } from "./entra-config";
import { updateSsoTokens, needsSsoRefresh } from "../db-session-store";
import { Request, Response } from "express";

// Refresh SSO token using refresh token
export async function refreshSsoToken(sessionId: string, refreshToken: string): Promise<any> {
  if (!msalInstance) {
    console.log("[SSO] MSAL not configured, skipping token refresh");
    return null;
  }
  
  try {
    // Use the refresh token to get new access token
    const refreshRequest = {
      ...tokenRequest,
      refreshToken: refreshToken,
      forceRefresh: true
    };
    
    const result = await msalInstance.acquireTokenByRefreshToken(refreshRequest);
    
    if (result) {
      const tokenExpiry = result.expiresOn || new Date(Date.now() + 3600 * 1000);
      
      // Update session with new tokens
      await updateSsoTokens(sessionId, {
        accessToken: result.accessToken,
        refreshToken: refreshToken, // Keep using the same refresh token
        tokenExpiry: tokenExpiry
      });
      
      console.log("[SSO] Token refreshed successfully for session:", sessionId.substring(0, 4) + '...');
      return result;
    }
  } catch (error: any) {
    console.error("[SSO] Token refresh failed:", error?.message || error);
    
    // If refresh token is invalid/expired, user needs to re-authenticate
    if (error?.errorCode === 'invalid_grant' || error?.errorCode === 'interaction_required') {
      console.log("[SSO] Refresh token invalid, user needs to re-authenticate");
      throw new Error("REAUTHENTICATION_REQUIRED");
    }
    
    throw error;
  }
  
  return null;
}

// Middleware to check and refresh SSO tokens automatically
export async function checkAndRefreshToken(req: Request, res: Response, next: () => void): Promise<void> {
  const sessionId = req.headers['x-session-id'] as string;
  const requestPath = req.path;
  
  // Skip middleware for auth endpoints
  if (!sessionId || requestPath.includes('/auth/')) {
    return next();
  }
  
  try {
    // Check if token needs refresh
    const needsRefresh = await needsSsoRefresh(sessionId);
    
    if (needsRefresh) {
      // Get current session to retrieve refresh token
      const session = req.user as any;
      
      if (session?.ssoRefreshToken) {
        console.log("[SSO-REFRESH] Token near expiry, attempting refresh:", {
          sessionId: sessionId.substring(0, 8) + '...',
          userEmail: session.email,
          currentExpiry: session.ssoTokenExpiry
        });
        
        try {
          const result = await refreshSsoToken(sessionId, session.ssoRefreshToken);
          if (result) {
            console.log("[SSO-REFRESH] Token refreshed successfully:", {
              sessionId: sessionId.substring(0, 8) + '...',
              newExpiry: result.expiresOn
            });
          }
        } catch (error: any) {
          if (error?.message === 'REAUTHENTICATION_REQUIRED') {
            console.warn("[SSO-REFRESH] Refresh token expired, user needs to re-authenticate:", {
              sessionId: sessionId.substring(0, 8) + '...',
              userEmail: session.email
            });
          } else {
            console.error("[SSO-REFRESH] Token refresh failed:", {
              sessionId: sessionId.substring(0, 8) + '...',
              error: error.message
            });
          }
        }
      } else {
        console.log("[SSO-REFRESH] No refresh token available for session:", sessionId.substring(0, 8) + '...');
      }
    }
  } catch (error: any) {
    console.error("[SSO-REFRESH] Error checking token refresh status:", {
      sessionId: sessionId.substring(0, 8) + '...',
      error: error.message,
      stack: error.stack
    });
  }
  
  next();
}

// API endpoint to manually trigger token refresh
export async function handleTokenRefresh(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers['x-session-id'] as string;
  
  if (!sessionId) {
    res.status(401).json({ message: "No session ID provided" });
    return;
  }
  
  const session = req.user as any;
  
  if (!session?.ssoRefreshToken) {
    res.status(400).json({ message: "No refresh token available" });
    return;
  }
  
  try {
    const result = await refreshSsoToken(sessionId, session.ssoRefreshToken);
    
    if (result) {
      res.json({
        success: true,
        expiresIn: result.expiresOn ? Math.floor((result.expiresOn.getTime() - Date.now()) / 1000) : 3600
      });
    } else {
      res.status(500).json({ message: "Failed to refresh token" });
    }
  } catch (error: any) {
    if (error?.message === 'REAUTHENTICATION_REQUIRED') {
      res.status(401).json({ 
        message: "Re-authentication required",
        reauthRequired: true 
      });
    } else {
      console.error("[SSO] Token refresh error:", error);
      res.status(500).json({ message: "Token refresh failed" });
    }
  }
}

// Track scheduler state
let schedulerRunning = false;
let lastSchedulerRun: Date | null = null;
let tokensRefreshedCount = 0;
let schedulerInterval: NodeJS.Timeout | null = null;

// Export scheduler status for monitoring
export function getTokenRefreshStatus() {
  return {
    running: schedulerRunning,
    lastRun: lastSchedulerRun?.toISOString() || null,
    tokensRefreshed: tokensRefreshedCount
  };
}

// Core token refresh logic for scheduler
async function runTokenRefreshCycle(): Promise<void> {
  lastSchedulerRun = new Date();
  
  try {
    // Import db module dynamically to avoid circular dependency
    const { db } = await import("../db");
    const { sessions } = await import("@shared/schema");
    const { gt, isNotNull, and, lt } = await import("drizzle-orm");
    
    // Find SSO sessions with tokens expiring within next 10 minutes
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    
    const expiringSessions = await db
      .select()
      .from(sessions)
      .where(and(
        isNotNull(sessions.ssoRefreshToken),
        isNotNull(sessions.ssoTokenExpiry),
        lt(sessions.ssoTokenExpiry, tenMinutesFromNow),
        gt(sessions.expiresAt, now) // Only active sessions
      ))
      .limit(50); // Process in batches to avoid overwhelming the system
    
    if (expiringSessions.length === 0) {
      return; // No sessions need refresh
    }
    
    console.log(`[SSO-SCHEDULER] Found ${expiringSessions.length} sessions with expiring tokens`);
    
    let refreshed = 0;
    let failed = 0;
    
    for (const session of expiringSessions) {
      if (!session.ssoRefreshToken) continue;
      
      try {
        await refreshSsoToken(session.id, session.ssoRefreshToken);
        refreshed++;
        tokensRefreshedCount++;
      } catch (error: any) {
        failed++;
        // Don't log every failure - just track count
        if (error?.message === 'REAUTHENTICATION_REQUIRED') {
          // User needs to re-login, this is expected for expired refresh tokens
        }
      }
      
      // Small delay between refreshes to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (refreshed > 0 || failed > 0) {
      console.log(`[SSO-SCHEDULER] Token refresh complete: ${refreshed} refreshed, ${failed} failed`);
    }
    
  } catch (error: any) {
    console.error("[SSO-SCHEDULER] Error in token refresh cycle:", error?.message || error);
  }
}

// Periodic token refresh for active SSO sessions
export function startTokenRefreshScheduler(): void {
  if (schedulerRunning) {
    console.log("[SSO] Token refresh scheduler already running");
    return;
  }
  
  schedulerRunning = true;
  console.log("[SSO] Starting token refresh scheduler (runs immediately and then every 5 minutes)");
  
  // Run immediately on startup to handle any already-expiring tokens
  runTokenRefreshCycle().catch(error => {
    console.error("[SSO-SCHEDULER] Error in initial token refresh cycle:", error?.message || error);
  });
  
  // Then check for tokens that need refresh every 5 minutes
  schedulerInterval = setInterval(async () => {
    await runTokenRefreshCycle();
  }, 5 * 60 * 1000); // Every 5 minutes
}

// Stop the token refresh scheduler
export function stopTokenRefreshScheduler(): void {
  if (!schedulerRunning) {
    console.log("[SSO] Token refresh scheduler not running");
    return;
  }
  
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  
  schedulerRunning = false;
  console.log("[SSO] Token refresh scheduler stopped");
}

console.log("[SSO] Token refresh module initialized");