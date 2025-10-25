/**
 * SharePoint Embedded Container Type Registration Service
 * 
 * IMPORTANT: SharePoint Embedded uses Microsoft Graph API, not SharePoint REST API
 * Container types are pre-registered in Partner Center, not via API
 * This service verifies that your app can access the container type via Graph API
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
  private readonly containerTypeId = '358aba7d-bb55-4ce0-a08d-e51f03d5edf1';
  private graphClient: GraphClient;
  
  constructor() {
    this.graphClient = new GraphClient();
  }

  /**
   * Verify access to container type via Microsoft Graph API
   * This confirms that your app has the necessary permissions
   */
  async registerContainerType(): Promise<ContainerTypeRegistrationResult> {
    console.log('[ContainerRegistration] Verifying container type access via Graph API...');
    
    try {
      // Try to get the container type via Graph API
      // This verifies that:
      // 1. The container type exists
      // 2. Your app has Container.Selected permissions
      // 3. Graph API authentication is working
      const containerType = await this.graphClient.getContainerType(this.containerTypeId);
      
      console.log('[ContainerRegistration] Container type accessible:', {
        id: containerType.id,
        displayName: containerType.displayName
      });
      
      return {
        success: true,
        message: 'Container type is accessible via Graph API',
        details: {
          id: containerType.id,
          displayName: containerType.displayName,
          description: containerType.description,
          isBuiltIn: containerType.isBuiltIn
        }
      };
      
    } catch (error) {
      console.error('[ContainerRegistration] Container type access verification failed:', error);
      
      // Provide helpful error messages
      let message = 'Failed to access container type via Graph API';
      let details: any = { error: error instanceof Error ? error.message : String(error) };
      
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          message = 'Container type not found. Please ensure the container type ID is correct.';
          details.help = 'Container types must be registered in Microsoft Partner Center first.';
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access denied to container type. Please check API permissions.';
          details.help = 'Ensure your Azure AD app has FileStorageContainer.Selected permission from Microsoft Graph.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          message = 'Authentication failed. Please check Azure AD configuration.';
          details.help = 'Verify AZURE_CLIENT_ID, AZURE_TENANT_ID, and authentication credentials.';
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
   * Check if container type is accessible via Graph API
   * This verifies that your app has the necessary permissions
   */
  async checkRegistrationStatus(): Promise<{
    isRegistered: boolean;
    message: string;
    details?: any;
  }> {
    console.log('[ContainerRegistration] Checking container type accessibility via Graph API...');
    
    try {
      // Try to get the container type via Graph API
      const containerType = await this.graphClient.getContainerType(this.containerTypeId);
      
      console.log('[ContainerRegistration] Container type is accessible:', containerType.displayName);
      
      return {
        isRegistered: true,
        message: 'Container type is accessible. Your app has the necessary permissions.',
        details: {
          id: containerType.id,
          displayName: containerType.displayName,
          description: containerType.description,
          isBuiltIn: containerType.isBuiltIn,
          note: 'SharePoint Embedded uses Graph API, not SharePoint REST API'
        }
      };
      
    } catch (error) {
      console.error('[ContainerRegistration] Container type not accessible:', error);
      
      let message = 'Container type is not accessible';
      let details: any = { 
        error: error instanceof Error ? error.message : String(error),
        containerTypeId: this.containerTypeId
      };
      
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          message = 'Container type not found via Graph API';
          details.help = [
            'Ensure container type ID is correct: ' + this.containerTypeId,
            'Container types must be registered in Microsoft Partner Center',
            'Verify you have FileStorageContainer.Selected permission in Azure AD'
          ];
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          message = 'Access denied - missing API permissions';
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
        }
      }
      
      return {
        isRegistered: false,
        message,
        details
      };
    }
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
