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
   * 
   * NOTE: The list containers endpoint has a known bug in preview where it fails with
   * "failed to parse filter parameter" - so we check the specific container directly
   */
  async registerContainerType(): Promise<ContainerTypeRegistrationResult> {
    console.log('[ContainerAccess] Verifying SharePoint Embedded container access via Graph API...');
    
    const configuredContainerId = this.getConfiguredContainerId();
    
    console.log('[ContainerAccess] Container ID from environment:', {
      containerId: configuredContainerId,
      length: configuredContainerId?.length,
      firstChars: configuredContainerId?.substring(0, 10),
      lastChars: configuredContainerId?.substring(configuredContainerId.length - 10)
    });
    
    try {
      // If we have a configured container, check it directly
      // This avoids the buggy list containers endpoint
      if (configuredContainerId) {
        try {
          const container = await this.graphClient.getFileStorageContainer(configuredContainerId);
          
          console.log('[ContainerAccess] Successfully accessed configured container:', {
            id: container.id,
            displayName: container.displayName,
            status: container.status
          });
          
          return {
            success: true,
            message: 'SharePoint Embedded container is accessible. Your app has the necessary permissions.',
            details: {
              configuredContainer: {
                id: container.id,
                displayName: container.displayName,
                status: container.status,
                containerTypeId: container.containerTypeId
              },
              note: 'Successfully verified access to configured SharePoint Embedded container'
            }
          };
        } catch (containerError) {
          console.error('[ContainerAccess] Cannot access configured container:', containerError);
          
          return {
            success: false,
            message: 'Cannot access the configured SharePoint Embedded container',
            details: {
              configuredContainerId,
              error: containerError instanceof Error ? containerError.message : String(containerError),
              help: [
                'Ensure the container ID is correct and is a SharePoint Embedded container',
                'Verify your app has FileStorageContainer.Selected permission in Azure AD',
                'Check that the container exists and your app has been granted access to it',
                'Container IDs should look like: b!xxx... (not regular SharePoint site IDs)'
              ]
            }
          };
        }
      }
      
      // No container configured - try to list containers
      // NOTE: This endpoint has a known bug in preview and might fail
      try {
        console.log('[ContainerAccess] No container configured, attempting to list available containers...');
        const containers = await this.graphClient.listFileStorageContainers();
        
        console.log('[ContainerAccess] Successfully listed containers:', {
          count: containers.length,
          containerIds: containers.map(c => c.id)
        });
        
        return {
          success: true,
          message: 'Graph API access verified. Container ID not configured yet.',
          details: {
            totalContainers: containers.length,
            allContainers: containers.map(c => ({
              id: c.id,
              displayName: c.displayName,
              status: c.status
            })),
            note: 'Set SHAREPOINT_CONTAINER_ID_DEV and SHAREPOINT_CONTAINER_ID_PROD environment variables to use one of these containers'
          }
        };
      } catch (listError) {
        // List containers endpoint is broken in preview
        console.warn('[ContainerAccess] List containers endpoint failed (known preview limitation):', listError);
        
        return {
          success: false,
          message: 'Container ID not configured and cannot list containers (SharePoint Embedded preview limitation)',
          details: {
            error: listError instanceof Error ? listError.message : String(listError),
            help: [
              'The list containers endpoint has a known bug in SharePoint Embedded preview',
              'Please configure SHAREPOINT_CONTAINER_ID_DEV and SHAREPOINT_CONTAINER_ID_PROD with your container IDs',
              'Container IDs can be obtained from Microsoft Partner Center or created via Graph API',
              'Once configured, this verification will check your specific container directly'
            ]
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
