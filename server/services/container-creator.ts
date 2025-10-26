/**
 * SharePoint Embedded Container Creator
 * Creates new SharePoint Embedded containers for the application
 */

import { msalInstance, clientCredentialsRequest } from '../auth/entra-config.js';

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
    description?: string
  ): Promise<ContainerCreationResult> {
    console.log('[ContainerCreator] Creating SharePoint Embedded container:', containerName);
    
    try {
      // Get access token for Microsoft Graph
      const accessToken = await this.getGraphAccessToken();
      
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
          success: false,
          message: `Container created but failed to grant permissions: ${permissionResult.message}`,
          containerId: container.id,
          details: { container, permissionError: permissionResult.message }
        };
      }
      
      console.log('[ContainerCreator] Permissions granted successfully');
      
      return {
        success: true,
        message: 'SharePoint Embedded container created and permissions granted successfully',
        containerId: container.id,
        details: container
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
   * Get access token for Microsoft Graph API
   */
  private async getGraphAccessToken(): Promise<string> {
    if (!msalInstance) {
      throw new Error('MSAL instance not configured. Please check Azure AD environment variables.');
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
}

export const containerCreator = new ContainerCreator();
