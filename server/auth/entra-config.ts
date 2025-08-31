import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

// Microsoft Entra ID (Azure AD) configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel: any, message: string) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    }
  }
};

// Scopes for Microsoft Graph API
export const REDIRECT_URI = process.env.AZURE_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
export const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || 'http://localhost:5000';

// Create MSAL application instance
export const msalInstance = new ConfidentialClientApplication(msalConfig);

// Authentication request parameters
export const authCodeRequest = {
  scopes: ["user.read", "profile", "email", "openid"],
  redirectUri: REDIRECT_URI,
};

export const tokenRequest = {
  scopes: ["user.read", "profile", "email", "openid"],
  redirectUri: REDIRECT_URI,
};