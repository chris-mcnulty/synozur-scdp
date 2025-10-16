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
  
  if (!sessionId) {
    return next();
  }
  
  try {
    // Check if token needs refresh
    const needsRefresh = await needsSsoRefresh(sessionId);
    
    if (needsRefresh) {
      // Get current session to retrieve refresh token
      const session = req.user as any;
      
      if (session?.ssoRefreshToken) {
        console.log("[SSO] Token near expiry, attempting refresh for session:", sessionId.substring(0, 4) + '...');
        
        try {
          await refreshSsoToken(sessionId, session.ssoRefreshToken);
        } catch (error: any) {
          if (error?.message === 'REAUTHENTICATION_REQUIRED') {
            // Don't block the request, but log that re-auth is needed
            console.log("[SSO] User will need to re-authenticate soon");
          }
        }
      }
    }
  } catch (error) {
    console.error("[SSO] Error in token refresh check:", error);
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

// Periodic token refresh for active SSO sessions
export function startTokenRefreshScheduler(): void {
  // Check for tokens that need refresh every 10 minutes
  setInterval(async () => {
    try {
      // This would ideally check all active SSO sessions
      // For now, it's a placeholder for the refresh logic
      console.log("[SSO] Token refresh scheduler running");
    } catch (error) {
      console.error("[SSO] Token refresh scheduler error:", error);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
}

console.log("[SSO] Token refresh module initialized");