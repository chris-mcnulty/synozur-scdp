import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';

// Default to SharePoint Embedded owning app
const defaultClientId = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6"; // SCDP-Content owning app
const defaultTenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee";   // Synozur tenant

// Determine if certificate-based authentication is configured
const hasCertificateAuth = !!(
  process.env.AZURE_CERTIFICATE_PRIVATE_KEY && 
  process.env.AZURE_CERTIFICATE_THUMBPRINT
);

// Check if Azure AD is configured (certificate auth preferred, fallback to client secret)
const isConfigured = !!(process.env.AZURE_CLIENT_ID || defaultClientId) && 
                    !!(process.env.AZURE_TENANT_ID || defaultTenantId) && 
                    (hasCertificateAuth || !!process.env.AZURE_CLIENT_SECRET);

// Microsoft Entra ID (Azure AD) configuration
let msalConfig: Configuration;

if (hasCertificateAuth) {
  // Certificate-based authentication (recommended for SharePoint Embedded)
  console.log('[ENTRA-CONFIG] Using certificate-based authentication');
  
  // Decode the base64-encoded private key
  const privateKeyBase64 = process.env.AZURE_CERTIFICATE_PRIVATE_KEY!;
  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf-8');
  
  msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID || defaultClientId,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || defaultTenantId}`,
      clientCertificate: {
        thumbprint: process.env.AZURE_CERTIFICATE_THUMBPRINT!.replace(/:/g, ''), // Remove colons
        privateKey: privateKey,
      },
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
} else {
  // Fallback to client secret authentication
  console.log('[ENTRA-CONFIG] Using client secret authentication (certificate auth preferred)');
  
  msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID || defaultClientId,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || defaultTenantId}`,
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
}

export { msalConfig };

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

// Log configuration for debugging
console.log("[ENTRA-CONFIG] Azure AD Configuration:", {
  configured: isConfigured,
  clientId: process.env.AZURE_CLIENT_ID || defaultClientId,
  tenantId: process.env.AZURE_TENANT_ID || defaultTenantId,
  authMethod: hasCertificateAuth ? 'certificate' : 'client-secret',
  hasCertificate: hasCertificateAuth,
  hasSecret: !!process.env.AZURE_CLIENT_SECRET,
  baseUrl,
  redirectUri: REDIRECT_URI,
  environment: process.env.NODE_ENV || 'development',
  replitDomains: process.env.REPLIT_DOMAINS || 'none'
});

// Create MSAL application instance only if configured
export const msalInstance = isConfigured 
  ? new ConfidentialClientApplication(msalConfig)
  : null;

// Authentication request parameters
export const authCodeRequest = {
  scopes: ["user.read", "profile", "email", "openid", "offline_access"], // Added offline_access for refresh token
  redirectUri: REDIRECT_URI,
};

export const tokenRequest = {
  scopes: ["user.read", "profile", "email", "openid", "offline_access"], // Added offline_access for refresh token
  redirectUri: REDIRECT_URI,
};

// SharePoint Embedded Container Configuration
export const getSharePointContainerConfig = () => {
  // Container Type ID - same for both environments
  const containerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1";
  
  // Environment-specific container IDs
  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  
  // Check environment variables first, then fall back to hardcoded values
  const containerIds = {
    development: process.env.SHAREPOINT_CONTAINER_ID_DEV || "b!4-B8POhyAEuzqyfSZCOTAWPs9wy5VwdHhzpPKzPNOZpnsrftuTb_TqkUQRRk8U_L",
    production: process.env.SHAREPOINT_CONTAINER_ID_PROD || "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
  };
  
  const currentContainerId = isDevelopment ? containerIds.development : containerIds.production;
  
  console.log('[ENTRA-CONFIG] SharePoint Container Config:', {
    isDevelopment,
    containerTypeId,
    containerId: currentContainerId,
    fromEnvVar: isDevelopment ? !!process.env.SHAREPOINT_CONTAINER_ID_DEV : !!process.env.SHAREPOINT_CONTAINER_ID_PROD
  });
  
  return {
    containerTypeId,
    containerId: currentContainerId,
    environment: isDevelopment ? 'development' : 'production',
    containerName: isDevelopment ? 'SCDP Content Storage Dev' : 'SCDP Content Storage'
  };
};