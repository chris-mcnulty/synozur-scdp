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

// Scopes for Microsoft Graph API - User delegated
export const graphScopes = ["https://graph.microsoft.com/user.read"];

// App-only scopes for Microsoft Graph (client credentials flow)
export const appOnlyGraphScopes = ["https://graph.microsoft.com/.default"];

// SharePoint Embedded container-specific scopes for file operations
export const sharePointEmbeddedScopes = [
  "https://graph.microsoft.com/FileStorageContainer.Selected"
];

// Client credentials request for app-only authentication
export const clientCredentialsRequest = {
  scopes: appOnlyGraphScopes,
};

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

// SharePoint Embedded Container Configuration
export const getSharePointContainerConfig = () => {
  // Container Type ID - same for both environments
  const containerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1";
  
  // Environment-specific container IDs
  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  
  const containerIds = {
    development: "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr",
    production: "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
  };
  
  const currentContainerId = isDevelopment ? containerIds.development : containerIds.production;
  
  return {
    containerTypeId,
    containerId: currentContainerId,
    environment: isDevelopment ? 'development' : 'production',
    containerName: isDevelopment ? 'SCDP Content Storage Dev' : 'SCDP Content Storage'
  };
};