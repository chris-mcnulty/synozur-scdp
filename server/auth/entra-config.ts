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
// Determine the base URL - always use HTTPS in production
const getBaseUrl = () => {
  // If explicit redirect URI is set, extract base URL from it
  if (process.env.AZURE_REDIRECT_URI) {
    const url = new URL(process.env.AZURE_REDIRECT_URI);
    return `${url.protocol}//${url.host}`;
  }
  
  // For Replit deployments
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // For production domains (always use HTTPS)
  if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DOMAINS) {
    return 'https://scdp.synozur.com';
  }
  
  // Only use HTTP for local development
  return 'http://localhost:5000';
};

const baseUrl = getBaseUrl();

export const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || `${baseUrl}/api/auth/callback`;
export const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || baseUrl;

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