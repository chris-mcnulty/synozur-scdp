/**
 * SharePoint Embedded Container Creator
 * Creates new SharePoint Embedded containers for the application
 */

import { clientCredentialsMsalInstance, clientCredentialsRequest, getClientCredentialsMsalForTenant } from '../auth/entra-config.js';

export interface ContainerCreationResult {
  success: boolean;
  message: string;
  containerId?: string;
  details?: any;
}

export class ContainerCreator {
  private readonly containerTypeId = '358aba7d-bb55-4ce0-a08d-e51f03d5edf1';
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  /**
   * Create a new SharePoint Embedded container
   */
  async createContainer(
    containerName: string,
    description?: string,
    azureTenantId?: string
  ): Promise<ContainerCreationResult> {
    console.log('[ContainerCreator] Creating SharePoint Embedded container:', containerName, azureTenantId ? `(tenant: ${azureTenantId})` : '(default tenant)');
    
    try {
      const accessToken = await this.getGraphAccessToken(azureTenantId);
      
      // Prepare container creation payload
      const payload = {
        displayName: containerName,
        description: description || `SharePoint Embedded container for ${containerName}`,
        containerTypeId: this.containerTypeId
      };
      
      console.log('[ContainerCreator] Sending container creation request...');
      
      // Create container using Graph API
      const response = await fetch(
        `${this.graphBaseUrl}/storage/fileStorage/containers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ContainerCreator] Container creation failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
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
          message: `Container creation failed: ${errorMessage}`,
          details: { status: response.status, error: errorText }
        };
      }
      
      const container = await response.json();
      console.log('[ContainerCreator] Container created successfully:', {
        id: container.id,
        displayName: container.displayName
      });
      
      // CRITICAL: Grant permissions to the application for the container
      console.log('[ContainerCreator] Granting application permissions to container...');
      const permissionResult = await this.grantApplicationPermissions(
        accessToken,
        container.id
      );
      
      if (!permissionResult.success) {
        console.warn('[ContainerCreator] Failed to grant permissions:', permissionResult.message);
        return {
          success: true,
          message: `Container created but permissions need to be granted manually: ${permissionResult.message}`,
          containerId: container.id,
          details: { container, permissionWarning: permissionResult.message }
        };
      }
      
      console.log('[ContainerCreator] Permissions granted successfully');
      
      // CRITICAL: Register container type in the consuming tenant's SharePoint
      // Without this, file operations (upload/download/delete) will fail with
      // "not supported for AAD accounts (no addressUrl for Microsoft.FileServices)"
      console.log('[ContainerCreator] Registering container type in tenant SharePoint...');
      const registrationResult = await this.registerContainerTypeInTenant(azureTenantId);
      if (!registrationResult.success) {
        console.warn('[ContainerCreator] Container type registration warning:', registrationResult.message);
      } else {
        console.log('[ContainerCreator] Container type registered in tenant SharePoint');
      }
      
      return {
        success: true,
        message: 'SharePoint Embedded container created and permissions granted successfully',
        containerId: container.id,
        details: { ...container, containerTypeRegistration: registrationResult }
      };
      
    } catch (error) {
      console.error('[ContainerCreator] Error creating container:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error during container creation',
        details: { error }
      };
    }
  }

  /**
   * Grant application permissions to a container
   */
  private async grantApplicationPermissions(
    accessToken: string,
    containerId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the application's client ID from environment
      const clientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
      
      // Grant the application "owner" role on the container
      const permissionPayload = {
        roles: ["owner"],
        grantedToIdentitiesV2: [
          {
            application: {
              id: clientId,
              displayName: "SCDP Application"
            }
          }
        ]
      };
      
      console.log('[ContainerCreator] Granting owner permissions to app:', clientId);
      
      const response = await fetch(
        `${this.graphBaseUrl}/storage/fileStorage/containers/${containerId}/permissions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(permissionPayload)
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ContainerCreator] Permission grant failed:', {
          status: response.status,
          error: errorText
        });
        
        return {
          success: false,
          message: `Failed to grant permissions: HTTP ${response.status}`
        };
      }
      
      const permission = await response.json();
      console.log('[ContainerCreator] Permission granted:', permission.id);
      
      return {
        success: true,
        message: 'Application permissions granted successfully'
      };
      
    } catch (error) {
      console.error('[ContainerCreator] Error granting permissions:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete a SharePoint Embedded container via the Graph API.
   * This permanently removes the container and all its contents.
   */
  async deleteContainer(
    containerId: string,
    azureTenantId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const accessToken = await this.getGraphAccessToken(azureTenantId);

      console.log(`[ContainerCreator] Deleting container ${containerId}...`);
      const response = await fetch(
        `${this.graphBaseUrl}/storage/fileStorage/containers/${containerId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 204 || response.status === 200) {
        console.log(`[ContainerCreator] Container ${containerId} deleted successfully`);
        return {
          success: true,
          message: `Container ${containerId} has been permanently deleted`,
        };
      }

      if (response.status === 404) {
        return {
          success: true,
          message: `Container ${containerId} was already deleted or does not exist`,
        };
      }

      const errorText = await response.text();
      console.error(`[ContainerCreator] Delete failed: ${response.status}`, errorText);
      return {
        success: false,
        message: `Failed to delete container: ${response.status} — ${errorText}`,
      };
    } catch (error) {
      console.error('[ContainerCreator] Delete container error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get container details (name, file count, size) from the Graph API.
   */
  async getContainerInfo(
    containerId: string,
    azureTenantId?: string
  ): Promise<{ success: boolean; displayName?: string; error?: string }> {
    try {
      const accessToken = await this.getGraphAccessToken(azureTenantId);
      const response = await fetch(
        `${this.graphBaseUrl}/storage/fileStorage/containers/${containerId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        return { success: false, error: `Container not found or inaccessible (${response.status})` };
      }

      const data = await response.json();
      return {
        success: true,
        displayName: data.displayName,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Public method to register the container type in a specific tenant's SharePoint.
   * Can be called separately for tenants that already have containers but need
   * the container type registered (e.g., containers created before this step was added).
   */
  async registerContainerTypeForTenant(
    azureTenantId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.registerContainerTypeInTenant(azureTenantId);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Register the container type in the consuming tenant's SharePoint.
   * This is required before file operations (upload/download/delete) can work.
   * 
   * Two-step process with two different tokens:
   * 1. Graph API token to discover the tenant's SharePoint hostname
   * 2. SharePoint-scoped token to call the SharePoint REST API for registration
   */
  private async registerContainerTypeInTenant(
    azureTenantId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Step 1: Discover the tenant's SharePoint root URL via Graph API
      const graphToken = await this.getGraphAccessToken(azureTenantId);
      const rootSiteResponse = await fetch(
        `${this.graphBaseUrl}/sites/root`,
        {
          headers: { 'Authorization': `Bearer ${graphToken}` }
        }
      );

      if (!rootSiteResponse.ok) {
        const errorText = await rootSiteResponse.text();
        return {
          success: false,
          message: `Failed to discover SharePoint root site: HTTP ${rootSiteResponse.status} — ${errorText}`
        };
      }

      const rootSite = await rootSiteResponse.json();
      const siteHostname = rootSite.siteCollection?.hostname;
      if (!siteHostname) {
        return {
          success: false,
          message: 'Could not determine SharePoint hostname from root site response'
        };
      }

      const sharePointUrl = `https://${siteHostname}`;
      console.log('[ContainerCreator] Discovered SharePoint URL:', sharePointUrl);

      // Step 2: Acquire a SharePoint-scoped token (different from Graph token)
      const spToken = await this.getSharePointAccessToken(sharePointUrl, azureTenantId);

      // Step 3: Register the container type via SharePoint REST API
      const clientId = process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
      const registrationUrl = `${sharePointUrl}/_api/v2.1/storageContainerTypes/${this.containerTypeId}/applicationPermissions`;

      const payload = {
        value: [
          {
            appId: clientId,
            delegated: ["full"],
            appOnly: ["full"]
          }
        ]
      };

      console.log('[ContainerCreator] Registering container type at:', registrationUrl);

      const registrationResponse = await fetch(registrationUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${spToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!registrationResponse.ok) {
        const errorText = await registrationResponse.text();
        let errorMessage = `HTTP ${registrationResponse.status}`;
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error.message || errorMessage;
          }
        } catch {
          errorMessage += `: ${errorText}`;
        }
        return {
          success: false,
          message: `Container type registration failed: ${errorMessage}`
        };
      }

      return {
        success: true,
        message: `Container type registered in ${siteHostname}`
      };
    } catch (error) {
      console.error('[ContainerCreator] Error registering container type in tenant:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get access token for Microsoft Graph API
   */
  private async getGraphAccessToken(azureTenantId?: string): Promise<string> {
    const msalInstance = azureTenantId
      ? getClientCredentialsMsalForTenant(azureTenantId)
      : clientCredentialsMsalInstance;

    if (!msalInstance) {
      throw new Error('MSAL client credentials instance not configured. Please check Azure AD environment variables.');
    }

    try {
      const response = await msalInstance.acquireTokenByClientCredential(clientCredentialsRequest);
      
      if (!response) {
        throw new Error('Failed to acquire access token - no response received');
      }
      
      console.log('[ContainerCreator] Successfully acquired Graph access token');
      return response.accessToken;
    } catch (error) {
      console.error('[ContainerCreator] Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get access token scoped to a specific SharePoint host.
   * SharePoint REST APIs (/_api/v2.1/...) require a token with audience
   * set to the SharePoint URL, NOT the Graph API audience.
   */
  private async getSharePointAccessToken(sharePointUrl: string, azureTenantId?: string): Promise<string> {
    const msalInstance = azureTenantId
      ? getClientCredentialsMsalForTenant(azureTenantId)
      : clientCredentialsMsalInstance;

    if (!msalInstance) {
      throw new Error('MSAL client credentials instance not configured.');
    }

    try {
      const response = await msalInstance.acquireTokenByClientCredential({
        scopes: [`${sharePointUrl}/.default`],
      });

      if (!response) {
        throw new Error('Failed to acquire SharePoint access token - no response received');
      }

      console.log(`[ContainerCreator] Successfully acquired SharePoint token for ${sharePointUrl}`);
      return response.accessToken;
    } catch (error) {
      console.error(`[ContainerCreator] SharePoint token acquisition failed for ${sharePointUrl}:`, error);
      throw new Error(`SharePoint authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const containerCreator = new ContainerCreator();
