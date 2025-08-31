import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

// Check if Azure AD is configured
const isConfigured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_SECRET);

// Microsoft Entra ID (Azure AD) configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || 'placeholder',
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET || 'placeholder',
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel: any, message: string) {
        if (isConfigured) {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    }
  }
};

// Scopes for Microsoft Graph API
// For Replit deployments, use the Replit app URL
const replitUrl = process.env.REPL_SLUG && process.env.REPL_OWNER 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  : 'http://localhost:5000';

export const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || `${replitUrl}/api/auth/callback`;
export const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || replitUrl;

// Create MSAL application instance only if configured
export const msalInstance = isConfigured 
  ? new ConfidentialClientApplication(msalConfig)
  : null;

// Authentication request parameters
export const authCodeRequest = {
  scopes: ["user.read", "profile", "email", "openid"],
  redirectUri: REDIRECT_URI,
};

export const tokenRequest = {
  scopes: ["user.read", "profile", "email", "openid"],
  redirectUri: REDIRECT_URI,
};