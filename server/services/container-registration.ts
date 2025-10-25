/**
 * SharePoint Embedded Container Access Verification Service
 * 
 * IMPORTANT: SharePoint Embedded uses Microsoft Graph API
 * This service verifies that your app can access SharePoint Embedded containers
 * 
 * See AZURE_APP_PERMISSIONS_SETUP.md for configuration details
 */

import { GraphClient } from './graph-client.js';

export interface ContainerTypeRegistrationResult {
  success: boolean;
  message: string;
  details?: any;
}

export class ContainerRegistrationService {
  private graphClient: GraphClient;
  
  constructor() {
    this.graphClient = new GraphClient();
  }

  /**
   * Get configured container ID from environment
   */
  private getConfiguredContainerId(): string {
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
    const containerId = isProduction 
      ? process.env.SHAREPOINT_CONTAINER_ID_PROD || ''
      : process.env.SHAREPOINT_CONTAINER_ID_DEV || '';
    
    return containerId;
  }

  /**
   * Verify access to SharePoint Embedded containers via Microsoft Graph API
   * This confirms that your app has the necessary permissions
   */
  async registerContainerType(): Promise<ContainerTypeRegistrationResult> {
    console.log('[ContainerAccess] Verifying SharePoint Embedded container access via Graph API...');
    
    try {
      // First, try to list containers to verify basic Graph API access
      const containers = await this.graphClient.listFileStorageContainers();
      
      console.log('[ContainerAccess] Successfully listed containers:', {
        count: containers.length,
        containerIds: containers.map(c => c.id)
      });
      
      // Check if we can access the specific configured container
      const configuredContainerId = this.getConfiguredContainerId();
      
      if (configuredContainerId) {
        try {
          const container = await this.graphClient.getFileStorageContainer(configuredContainerId);
          
          console.log('[ContainerAccess] Successfully accessed configured container:', {
            id: container.id,
            displayName: container.displayName
          });
          
          return {
            success: true,
            message: 'SharePoint Embedded containers are accessible. Your app has the necessary permissions.',
            details: {
              totalContainers: containers.length,
              configuredContainer: {
                id: container.id,
                displayName: container.displayName,
                status: container.status
              },
              allContainers: containers.map(c => ({
                id: c.id,
                displayName: c.displayName
              }))
            }
          };
        } catch (containerError) {
          // Can list containers but not access the specific one
          console.warn('[ContainerAccess] Cannot access configured container:', containerError);
          
          return {
            success: false,
            message: 'Can list containers but cannot access the configured container',
            details: {
              totalContainers: containers.length,
              configuredContainerId,
              error: containerError instanceof Error ? containerError.message : String(containerError),
              help: [
                'The configured container ID might be incorrect',
                'Ensure the container ID is a SharePoint Embedded container, not a regular SharePoint site',
                'Verify your app has permission to access this specific container',
                `Available containers: ${containers.map(c => c.displayName).join(', ')}`
              ]
            }
          };
        }
      } else {
        // No container configured, but Graph API works
        return {
          success: true,
          message: 'Graph API access verified. Container ID not configured yet.',
          details: {
            totalContainers: containers.length,
            allContainers: containers.map(c => ({
              id: c.id,
              displayName: c.displayName
            })),
            note: 'Set SHAREPOINT_CONTAINER_ID_DEV and SHAREPOINT_CONTAINER_ID_PROD environment variables'
          }
        };
      }
      
    } catch (error) {
      console.error('[ContainerAccess] Container access verification failed:', error);
      
      // Provide helpful error messages
      let message = 'Failed to access SharePoint Embedded containers via Graph API';
      let details: any = { error: error instanceof Error ? error.message : String(error) };
      
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          message = 'SharePoint Embedded containers not found';
          details.help = [
            'SharePoint Embedded might not be enabled in your tenant',
            'Verify you have FileStorageContainer.Selected permission in Azure AD',
            'Ensure containers exist in your tenant'
          ];
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access denied to SharePoint Embedded containers';
          details.help = [
            'Add FileStorageContainer.Selected permission from Microsoft Graph in Azure Portal',
            'Grant admin consent for the permission',
            'Wait a few minutes for permissions to propagate'
          ];
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          message = 'Authentication failed';
          details.help = [
            'Verify AZURE_CLIENT_ID, AZURE_TENANT_ID are correct',
            'Check that certificate or client secret is configured',
            'Ensure Azure AD app is properly set up'
          ];
        } else if (error.message.includes('BadRequest') || error.message.includes('containerTypes')) {
          message = 'SharePoint Embedded API not available in your tenant';
          details.help = [
            'SharePoint Embedded is currently in preview and may not be available in all tenants',
            'Contact Microsoft support to enable SharePoint Embedded for your tenant',
            'Verify your tenant has the necessary licenses'
          ];
        }
      }
      
      return {
        success: false,
        message,
        details
      };
    }
  }

  /**
   * Check if SharePoint Embedded containers are accessible via Graph API
   * This verifies that your app has the necessary permissions
   */
  async checkRegistrationStatus(): Promise<{
    isRegistered: boolean;
    message: string;
    details?: any;
  }> {
    console.log('[ContainerAccess] Checking SharePoint Embedded container accessibility via Graph API...');
    
    // Use the same logic as registerContainerType
    const result = await this.registerContainerType();
    
    return {
      isRegistered: result.success,
      message: result.message,
      details: result.details
    };
  }

  /**
   * Initialize container type check on app startup
   * This verifies access in production environment
   */
  async initializeOnStartup(): Promise<void> {
    console.log('[ContainerRegistration] Checking container type access on startup...');
    
    // Check if running in production environment
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      console.log('[ContainerRegistration] Skipping automatic check in development environment');
      console.log('[ContainerRegistration] Visit /admin/sharepoint to manually verify access');
      return;
    }
    
    try {
      const status = await this.checkRegistrationStatus();
      
      if (status.isRegistered) {
        console.log('[ContainerRegistration] ✓ Container type is accessible via Graph API');
      } else {
        console.error('[ContainerRegistration] ✗ Container type is not accessible');
        console.error('[ContainerRegistration] Message:', status.message);
        console.error('[ContainerRegistration] SharePoint Embedded functionality may not work');
        console.error('[ContainerRegistration] See /admin/sharepoint for troubleshooting');
      }
      
    } catch (error) {
      console.error('[ContainerRegistration] Startup check failed:', error);
      console.error('[ContainerRegistration] Visit /admin/sharepoint to diagnose the issue');
    }
  }
}

// Export singleton instance
export const containerRegistration = new ContainerRegistrationService();
