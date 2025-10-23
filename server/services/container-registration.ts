/**
 * SharePoint Embedded Container Type Registration Service
 * Handles one-time registration of container types with the tenant
 * 
 * IMPORTANT: This requires SharePoint Online Container.Selected permissions
 * See AZURE_APP_PERMISSIONS_SETUP.md for configuration details
 */

import { msalInstance, clientCredentialsRequest } from '../auth/entra-config.js';

export interface ContainerTypeRegistrationResult {
  success: boolean;
  message: string;
  details?: any;
}

export class ContainerRegistrationService {
  private readonly containerTypeId = '358aba7d-bb55-4ce0-a08d-e51f03d5edf1';
  private readonly appId = process.env.AZURE_CLIENT_ID || '198aa0a6-d2ed-4f35-b41b-b6f6778a30d6';
  private readonly tenantId = process.env.AZURE_TENANT_ID || 'b4fbeaf7-1c91-43bb-8031-49eb8d4175ee';
  
  /**
   * Get SharePoint admin site URL for the tenant
   */
  private getSharePointAdminUrl(): string {
    // Extract tenant name from tenant ID or use environment variable
    const tenantName = process.env.SHAREPOINT_TENANT_NAME || 'synozur';
    return `https://${tenantName}-admin.sharepoint.com`;
  }

  /**
   * Get access token for SharePoint Online Admin API
   * CRITICAL: Must use SharePoint resource scope, not Microsoft Graph scope
   */
  private async getSharePointAccessToken(): Promise<string> {
    if (!msalInstance) {
      throw new Error('MSAL instance not configured. Please check Azure AD environment variables.');
    }

    try {
      // Get tenant name for SharePoint admin URL
      const tenantName = process.env.SHAREPOINT_TENANT_NAME || 'synozur';
      
      // CRITICAL: Request token with SharePoint Admin scope, NOT Graph scope
      // SharePoint admin APIs require tokens for the SharePoint resource
      const sharePointAdminScope = `https://${tenantName}-admin.sharepoint.com/.default`;
      
      console.log('[ContainerRegistration] Requesting token for SharePoint resource:', sharePointAdminScope);
      
      // CRITICAL: Merge SharePoint scope with base clientCredentialsRequest
      // MSAL requires the full request configuration, not just scopes
      const response = await msalInstance.acquireTokenByClientCredential({
        ...clientCredentialsRequest,
        scopes: [sharePointAdminScope],
      });
      
      if (!response) {
        throw new Error('Failed to acquire access token - no response received');
      }
      
      console.log('[ContainerRegistration] Successfully acquired SharePoint access token');
      return response.accessToken;
    } catch (error) {
      console.error('[ContainerRegistration] Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Register container type with the tenant
   * This must be called before accessing SharePoint Embedded containers
   * 
   * API Documentation: https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation
   */
  async registerContainerType(): Promise<ContainerTypeRegistrationResult> {
    console.log('[ContainerRegistration] Starting container type registration...');
    
    try {
      // Get access token
      const accessToken = await this.getSharePointAccessToken();
      
      // Construct registration API endpoint
      const adminUrl = this.getSharePointAdminUrl();
      const registrationUrl = `${adminUrl}/_api/v2.1/storageContainerTypes/${this.containerTypeId}/applicationPermissions`;
      
      console.log('[ContainerRegistration] Registration URL:', registrationUrl.replace(this.containerTypeId, '***'));
      
      // Prepare registration payload
      const payload = {
        value: [
          {
            appId: this.appId,
            delegated: ['full'], // Full control for delegated permissions
            appOnly: ['full']    // Full control for app-only permissions
          }
        ]
      };
      
      console.log('[ContainerRegistration] Sending registration request...');
      
      // Make registration API call
      const response = await fetch(registrationUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ContainerRegistration] Registration failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        // Parse error message
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage;
          }
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        
        return {
          success: false,
          message: `Container type registration failed: ${errorMessage}`,
          details: {
            status: response.status,
            error: errorText
          }
        };
      }
      
      const result = await response.json();
      console.log('[ContainerRegistration] Registration successful:', result);
      
      return {
        success: true,
        message: 'Container type registered successfully',
        details: result
      };
      
    } catch (error) {
      console.error('[ContainerRegistration] Registration error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during registration',
        details: { error }
      };
    }
  }

  /**
   * Check if container type is already registered
   * This can be used to avoid unnecessary registration calls
   */
  async checkRegistrationStatus(): Promise<{
    isRegistered: boolean;
    message: string;
    details?: any;
  }> {
    console.log('[ContainerRegistration] Checking registration status...');
    
    try {
      const accessToken = await this.getSharePointAccessToken();
      const adminUrl = this.getSharePointAdminUrl();
      const checkUrl = `${adminUrl}/_api/v2.1/storageContainerTypes/${this.containerTypeId}/applicationPermissions`;
      
      const response = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        const hasPermissions = result.value && result.value.length > 0;
        
        return {
          isRegistered: hasPermissions,
          message: hasPermissions 
            ? 'Container type is registered' 
            : 'Container type exists but has no permissions',
          details: result
        };
      } else if (response.status === 404) {
        return {
          isRegistered: false,
          message: 'Container type not found - registration required'
        };
      } else {
        const errorText = await response.text();
        return {
          isRegistered: false,
          message: `Failed to check registration status: HTTP ${response.status}`,
          details: { error: errorText }
        };
      }
      
    } catch (error) {
      console.error('[ContainerRegistration] Status check error:', error);
      return {
        isRegistered: false,
        message: error instanceof Error ? error.message : 'Unknown error checking status',
        details: { error }
      };
    }
  }

  /**
   * Initialize container type on app startup
   * This checks registration status and registers if needed
   */
  async initializeOnStartup(): Promise<void> {
    console.log('[ContainerRegistration] Initializing container type on startup...');
    
    // Check if running in production environment
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      console.log('[ContainerRegistration] Skipping auto-registration in development environment');
      console.log('[ContainerRegistration] Use POST /api/admin/register-container-type to manually register');
      return;
    }
    
    try {
      // Check current status
      const status = await this.checkRegistrationStatus();
      
      if (status.isRegistered) {
        console.log('[ContainerRegistration] Container type already registered ✓');
        return;
      }
      
      console.log('[ContainerRegistration] Container type not registered, attempting registration...');
      
      // Attempt registration
      const result = await this.registerContainerType();
      
      if (result.success) {
        console.log('[ContainerRegistration] Container type registration completed successfully ✓');
      } else {
        console.error('[ContainerRegistration] Container type registration failed:', result.message);
        console.error('[ContainerRegistration] SharePoint Embedded functionality may not work correctly');
        console.error('[ContainerRegistration] Please ensure Azure AD permissions are configured correctly');
        console.error('[ContainerRegistration] See AZURE_APP_PERMISSIONS_SETUP.md for details');
      }
      
    } catch (error) {
      console.error('[ContainerRegistration] Startup initialization failed:', error);
      console.error('[ContainerRegistration] This may prevent SharePoint Embedded functionality');
    }
  }
}

// Export singleton instance
export const containerRegistration = new ContainerRegistrationService();
