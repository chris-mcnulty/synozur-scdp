import { msalInstance, tokenRequest } from "./entra-config";
import { updateSsoTokens, needsSsoRefresh, extendSessionOnTokenExpiry } from "../db-session-store";
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
    // Get current session
    const session = req.user as any;
    
    // Skip if not an SSO session
    if (!session?.ssoProvider) {
      return next();
    }
    
    // Check if token is expired or needs refresh
    const needsRefresh = await needsSsoRefresh(sessionId);
    const tokenExpiry = session.ssoTokenExpiry ? new Date(session.ssoTokenExpiry) : null;
    const isExpired = tokenExpiry && tokenExpiry < new Date();
    
    if (needsRefresh || isExpired) {
      console.log(`[SSO] Token ${isExpired ? 'expired' : 'near expiry'} for session:`, sessionId.substring(0, 4) + '...');
      
      // If no refresh token, extend session to prevent immediate lockout
      if (!session.ssoRefreshToken) {
        console.log("[SSO] No refresh token available - extending session temporarily");
        await extendSessionOnTokenExpiry(sessionId);
        // Don't block the request - allow user to continue working
      } else {
        // Attempt to refresh the token
        try {
          await refreshSsoToken(sessionId, session.ssoRefreshToken);
          console.log("[SSO] Token refreshed successfully");
        } catch (error: any) {
          console.error("[SSO] Token refresh failed:", error?.message || error);
          
          if (error?.message === 'REAUTHENTICATION_REQUIRED') {
            // Refresh token is also invalid - extend session to prevent lockout
            console.log("[SSO] Refresh token invalid - extending session temporarily");
            await extendSessionOnTokenExpiry(sessionId);
            // Don't block the request - allow user to continue working
            // They'll be prompted to re-authenticate when convenient
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