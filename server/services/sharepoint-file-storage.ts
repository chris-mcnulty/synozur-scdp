/**
 * SharePoint Embedded File Storage Service
 * Provides file upload, storage, and retrieval using SharePoint Embedded containers
 * Replaces local file storage with cloud-based SharePoint storage
 */

import { GraphClient, type DriveItemWithMetadata } from './graph-client.js';
import type { DocumentMetadata } from './local-file-storage.js';
import { db } from '../db.js';
import { tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface StoredFile {
  id: string;
  fileName: string;
  originalName: string;
  filePath: string;
  size: number;
  contentType: string;
  metadata: DocumentMetadata;
  uploadedAt: Date;
  uploadedBy: string;
}

export class SharePointFileStorage {
  private graphClient: GraphClient;
  private containerId: string;
  private isProduction: boolean;
  private tenantGraphClients = new Map<string, GraphClient>();

  constructor() {
    this.graphClient = new GraphClient();
    
    this.isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
    
    if (this.isProduction) {
      this.containerId = process.env.SHAREPOINT_CONTAINER_ID_PROD || '';
      console.log('[SharePointStorage] Using PRODUCTION container');
    } else {
      this.containerId = process.env.SHAREPOINT_CONTAINER_ID_DEV || '';
      console.log('[SharePointStorage] Using DEVELOPMENT container');
    }
    
    if (!this.containerId) {
      console.warn('[SharePointStorage] SharePoint container ID not set. Please configure SHAREPOINT_CONTAINER_ID_DEV and SHAREPOINT_CONTAINER_ID_PROD environment variables.');
    } else {
      console.log(`[SharePointStorage] Container ID: ${this.containerId.substring(0, 20)}...`);
    }
  }

  private getGraphClientForAzureTenant(azureTenantId: string): GraphClient {
    let client = this.tenantGraphClients.get(azureTenantId);
    if (!client) {
      client = new GraphClient(azureTenantId);
      this.tenantGraphClients.set(azureTenantId, client);
    }
    return client;
  }

  public async getContainerForTenant(tenantId?: string): Promise<{ containerId: string; azureTenantId?: string }> {
    const lookupTenant = async (id: string) => {
      const [tenant] = await db.select({
        speContainerIdDev: tenants.speContainerIdDev,
        speContainerIdProd: tenants.speContainerIdProd,
        speStorageEnabled: tenants.speStorageEnabled,
        azureTenantId: tenants.azureTenantId,
      }).from(tenants).where(eq(tenants.id, id));
      if (tenant && tenant.speStorageEnabled) {
        const tenantContainer = this.isProduction
          ? tenant.speContainerIdProd
          : tenant.speContainerIdDev;
        if (tenantContainer) {
          return { containerId: tenantContainer, azureTenantId: tenant.azureTenantId || undefined };
        }
      }
      return null;
    };

    if (tenantId) {
      try {
        const result = await lookupTenant(tenantId);
        if (result) {
          console.log(`[SharePointStorage] Using tenant-specific container for tenant ${tenantId}: ${result.containerId.substring(0, 20)}...`);
          return result;
        }
      } catch (error) {
        console.warn(`[SharePointStorage] Failed to look up tenant container for ${tenantId}, falling back to global:`, error instanceof Error ? error.message : error);
      }
      return { containerId: this.containerId };
    }

    try {
      const speEnabledTenants = await db.select({
        id: tenants.id,
        speContainerIdDev: tenants.speContainerIdDev,
        speContainerIdProd: tenants.speContainerIdProd,
        speStorageEnabled: tenants.speStorageEnabled,
        azureTenantId: tenants.azureTenantId,
      }).from(tenants).where(eq(tenants.speStorageEnabled, true));

      if (speEnabledTenants.length === 1) {
        const t = speEnabledTenants[0];
        const container = this.isProduction ? t.speContainerIdProd : t.speContainerIdDev;
        if (container) {
          console.log(`[SharePointStorage] No tenantId provided, using sole SPE-enabled tenant ${t.id}: ${container.substring(0, 20)}...`);
          return { containerId: container, azureTenantId: t.azureTenantId || undefined };
        }
      }
    } catch (error) {
      console.warn(`[SharePointStorage] Failed to look up SPE-enabled tenants:`, error instanceof Error ? error.message : error);
    }

    return { containerId: this.containerId };
  }

  public resolveGraphClient(azureTenantId?: string): GraphClient {
    if (azureTenantId) {
      return this.getGraphClientForAzureTenant(azureTenantId);
    }
    return this.graphClient;
  }

  /**
   * Store a file in SharePoint Embedded container
   */
  async storeFile(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    metadata: DocumentMetadata,
    uploadedBy: string,
    fileId?: string,
    tenantId?: string
  ): Promise<StoredFile> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }
    const client = this.resolveGraphClient(azureTenantId);

    console.log('[SharePointStorage] Starting file upload:', {
      fileName: originalName,
      size: buffer.length,
      contentType,
      documentType: metadata.documentType,
      containerId: resolvedContainerId.substring(0, 20) + '...',
      tenantId: tenantId || 'global',
      azureTenantId: azureTenantId ? azureTenantId.substring(0, 8) + '...' : 'default'
    });

    try {
      const folderPath = this.getFolderPath(metadata.documentType);
      const sanitizedName = this.sanitizeFileName(originalName);
      const fileName = fileId ? `${fileId}_${sanitizedName}` : `${Date.now()}_${sanitizedName}`;
      
      console.log('[SharePointStorage] Upload details:', {
        folderPath,
        fileName,
        fileSize: buffer.length
      });
      
      const sharePointMetadata: Record<string, string | number | boolean | null> = {
        DocumentType: metadata.documentType,
        CreatedByUserId: metadata.createdByUserId,
        MetadataVersion: metadata.metadataVersion
      };
      
      if (metadata.clientId) sharePointMetadata.ClientId = metadata.clientId;
      if (metadata.clientName) sharePointMetadata.ClientName = metadata.clientName;
      if (metadata.projectId) sharePointMetadata.ProjectId = metadata.projectId;
      if (metadata.projectCode) sharePointMetadata.ProjectCode = metadata.projectCode;
      if (metadata.amount !== undefined) sharePointMetadata.Amount = metadata.amount;
      if (metadata.tags) sharePointMetadata.Tags = metadata.tags;
      if (metadata.effectiveDate) sharePointMetadata.EffectiveDate = metadata.effectiveDate.toISOString();
      if (metadata.estimateId) sharePointMetadata.EstimateId = metadata.estimateId;
      if (metadata.changeOrderId) sharePointMetadata.ChangeOrderId = metadata.changeOrderId;

      const driveItem = await client.uploadFile(
        resolvedContainerId,
        resolvedContainerId,
        folderPath,
        fileName,
        buffer,
        metadata.projectCode,
        metadata.estimateId,
        sharePointMetadata
      );

      console.log('[SharePointStorage] Upload successful:', {
        driveItemId: driveItem.id,
        webUrl: driveItem.webUrl
      });

      return {
        id: driveItem.id,
        fileName,
        originalName,
        filePath: driveItem.webUrl || driveItem.id,
        size: buffer.length,
        contentType,
        metadata,
        uploadedAt: new Date(driveItem.createdDateTime || new Date()),
        uploadedBy
      };
    } catch (error) {
      console.error('[SharePointStorage] Upload failed:', error);
      
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('not supported for AAD accounts')) {
        errorMessage = `SharePoint Embedded API error: The container may not be properly configured as a SharePoint Embedded container. Container ID: ${resolvedContainerId.substring(0, 20)}... Please verify the container is a SharePoint Embedded container, not a regular SharePoint site.`;
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        errorMessage = `SharePoint authentication error: The application may not have permission to access this container. Please check the app registration and container permissions.`;
      } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        errorMessage = `SharePoint container not found: Container ID ${resolvedContainerId.substring(0, 20)}... may be invalid or inaccessible.`;
      }
      
      throw new Error(`Failed to upload file to SharePoint: ${errorMessage}`);
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(fileId: string, tenantId?: string): Promise<StoredFile | null> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }
    const client = this.resolveGraphClient(azureTenantId);

    try {
      const driveItem = await client.getItem(resolvedContainerId, fileId) as DriveItemWithMetadata;
      
      // Extract metadata from SharePoint columns
      const listItem = driveItem.listItem;
      const fields = listItem?.fields || {};

      const metadata: DocumentMetadata = {
        documentType: (fields.DocumentType as any) || 'receipt',
        clientId: fields.ClientId as string,
        clientName: fields.ClientName as string,
        projectId: fields.ProjectId as string,
        projectCode: fields.ProjectCode as string,
        amount: fields.Amount ? parseFloat(fields.Amount as string) : undefined,
        tags: fields.Tags as string,
        createdByUserId: fields.CreatedByUserId as string,
        metadataVersion: parseInt(fields.MetadataVersion as string) || 1,
        effectiveDate: fields.EffectiveDate ? new Date(fields.EffectiveDate as string) : undefined,
        estimateId: fields.EstimateId as string,
        changeOrderId: fields.ChangeOrderId as string
      };

      return {
        id: driveItem.id,
        fileName: driveItem.name,
        originalName: driveItem.name,
        filePath: driveItem.webUrl || driveItem.id,
        size: driveItem.size || 0,
        contentType: driveItem.file?.mimeType || 'application/octet-stream',
        metadata,
        uploadedAt: new Date(driveItem.createdDateTime || new Date()),
        uploadedBy: fields.CreatedByUserId as string || 'unknown'
      };
    } catch (error) {
      console.error('[SharePointStorage] Failed to get file metadata:', error);
      return null;
    }
  }

  /**
   * Get file content and metadata
   */
  async getFileContent(fileId: string, tenantId?: string): Promise<{ buffer: Buffer; metadata: StoredFile } | null> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }
    const client = this.resolveGraphClient(azureTenantId);

    try {
      const fileMetadata = await this.getFileMetadata(fileId, tenantId);
      if (!fileMetadata) {
        return null;
      }

      const downloadResult = await client.downloadFile(resolvedContainerId, fileId);
      
      return {
        buffer: downloadResult.buffer,
        metadata: fileMetadata
      };
    } catch (error) {
      console.error('[SharePointStorage] Failed to get file content:', error);
      return null;
    }
  }

  /**
   * List files with optional filtering
   */
  async listFiles(filter?: { documentType?: string; clientId?: string; projectId?: string }, tenantId?: string): Promise<StoredFile[]> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      console.log('[SharePointStorage] listFiles - Called with filter:', filter, 'tenantId:', tenantId || 'global');
      const filters: string[] = [];
      if (filter?.documentType) {
        filters.push(`fields/DocumentType eq '${filter.documentType}'`);
      }
      if (filter?.clientId) {
        filters.push(`fields/ClientId eq '${filter.clientId}'`);
      }
      if (filter?.projectId) {
        filters.push(`fields/ProjectId eq '${filter.projectId}'`);
      }

      const allItems = await this.listAllFiles(resolvedContainerId, azureTenantId);
      console.log(`[SharePointStorage] listFiles - Retrieved ${allItems.length} total items`);

      // Filter based on criteria — include items even without listItem.fields
      const filteredItems = allItems.filter((item: any) => {
        const fields = item.listItem?.fields || {};
        const docType = fields.DocumentType || item._inferredDocType || 'receipt';
        
        if (filter?.documentType && docType !== filter.documentType) return false;
        if (filter?.clientId && fields.ClientId && fields.ClientId !== filter.clientId) return false;
        if (filter?.projectId && fields.ProjectId && fields.ProjectId !== filter.projectId) return false;
        
        return true;
      });

      console.log(`[SharePointStorage] listFiles - After filtering: ${filteredItems.length} items match criteria`);

      return filteredItems.map((item: any) => {
        const fields = item.listItem?.fields || {};
        
        const metadata: DocumentMetadata = {
          documentType: (fields.DocumentType as any) || item._inferredDocType || 'receipt',
          clientId: fields.ClientId as string,
          clientName: fields.ClientName as string,
          projectId: fields.ProjectId as string,
          projectCode: fields.ProjectCode as string,
          amount: fields.Amount ? parseFloat(fields.Amount as string) : undefined,
          tags: fields.Tags as string,
          createdByUserId: fields.CreatedByUserId as string,
          metadataVersion: parseInt(fields.MetadataVersion as string) || 1,
          effectiveDate: fields.EffectiveDate ? new Date(fields.EffectiveDate as string) : undefined,
          estimateId: fields.EstimateId as string,
          changeOrderId: fields.ChangeOrderId as string
        };

        return {
          id: item.id,
          fileName: item.name,
          originalName: item.name,
          filePath: item._folderPath || item.webUrl || item.id,
          size: item.size || 0,
          contentType: item.file?.mimeType || 'application/octet-stream',
          metadata,
          uploadedAt: new Date(item.createdDateTime || new Date()),
          uploadedBy: fields.CreatedByUserId as string || 'unknown'
        };
      });
    } catch (error) {
      console.error('[SharePointStorage] Failed to list files:', error);
      return [];
    }
  }

  /**
   * Delete file from SharePoint
   */
  async deleteFile(fileId: string, tenantId?: string): Promise<boolean> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }
    const client = this.resolveGraphClient(azureTenantId);

    try {
      await client.deleteFile(resolvedContainerId, fileId);
      return true;
    } catch (error) {
      console.error('[SharePointStorage] Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Update file metadata
   */
  async updateMetadata(fileId: string, metadata: Partial<DocumentMetadata>, tenantId?: string): Promise<boolean> {
    const { containerId: resolvedContainerId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      const sharePointMetadata: Record<string, string> = {};
      
      if (metadata.documentType) sharePointMetadata.DocumentType = metadata.documentType;
      if (metadata.clientId) sharePointMetadata.ClientId = metadata.clientId;
      if (metadata.clientName) sharePointMetadata.ClientName = metadata.clientName;
      if (metadata.projectId) sharePointMetadata.ProjectId = metadata.projectId;
      if (metadata.projectCode) sharePointMetadata.ProjectCode = metadata.projectCode;
      if (metadata.amount) sharePointMetadata.Amount = metadata.amount.toString();
      if (metadata.tags) sharePointMetadata.Tags = metadata.tags;
      if (metadata.effectiveDate) sharePointMetadata.EffectiveDate = metadata.effectiveDate.toISOString();
      if (metadata.estimateId) sharePointMetadata.EstimateId = metadata.estimateId;
      if (metadata.changeOrderId) sharePointMetadata.ChangeOrderId = metadata.changeOrderId;

      // Note: Metadata updates not yet implemented in GraphClient
      // This would require using the Graph API's PATCH endpoint for list items
      console.warn('[SharePointStorage] Metadata updates not yet fully implemented');
      // TODO: Implement metadata update via Graph API list items endpoint
      return true;
    } catch (error) {
      console.error('[SharePointStorage] Failed to update metadata:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(tenantId?: string): Promise<any> {
    const { containerId: resolvedContainerId, azureTenantId } = await this.getContainerForTenant(tenantId);
    if (!resolvedContainerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }
    const client = this.resolveGraphClient(azureTenantId);

    try {
      const container = await client.getFileStorageContainer(resolvedContainerId);
      const allFiles = await this.listFiles(undefined, tenantId);

      const stats = {
        totalFiles: allFiles.length,
        totalSize: allFiles.reduce((sum, file) => sum + file.size, 0),
        containerInfo: {
          id: container.id,
          displayName: container.displayName,
          status: container.status
        },
        byDocumentType: {} as Record<string, { count: number; size: number }>
      };

      // Group by document type
      allFiles.forEach(file => {
        const type = file.metadata.documentType;
        if (!stats.byDocumentType[type]) {
          stats.byDocumentType[type] = { count: 0, size: 0 };
        }
        stats.byDocumentType[type].count++;
        stats.byDocumentType[type].size += file.size;
      });

      return stats;
    } catch (error) {
      console.error('[SharePointStorage] Failed to get stats:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        containerInfo: null,
        byDocumentType: {}
      };
    }
  }

  /**
   * Get folder path for document type
   */
  private getFolderPath(documentType: string): string {
    const folderMap: Record<string, string> = {
      receipt: '/receipts',
      invoice: '/invoices',
      contract: '/contracts',
      statementOfWork: '/statements',
      estimate: '/estimates',
      changeOrder: '/change_orders',
      report: '/reports'
    };
    return folderMap[documentType] || '/receipts';
  }

  /**
   * Sanitize filename for SharePoint
   */
  private sanitizeFileName(filename: string): string {
    // Remove dangerous characters and limit length
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\./, '_')
      .slice(0, 128);
  }

  /**
   * List all files recursively from all folder types
   */
  private async listAllFiles(containerId: string, azureTenantId?: string): Promise<any[]> {
    console.log('[SharePointStorage] listAllFiles - Starting to list files from all folders');
    const client = this.resolveGraphClient(azureTenantId);
    const allFiles: any[] = [];
    const folderTypes = ['receipts', 'invoices', 'contracts', 'statements', 'estimates', 'change_orders', 'reports'];
    
    const folderToDocType: Record<string, string> = {
      receipts: 'receipt',
      invoices: 'invoice',
      contracts: 'contract',
      statements: 'statementOfWork',
      estimates: 'estimate',
      change_orders: 'changeOrder',
      reports: 'report',
    };

    const listRecursive = async (folderPath: string, inferredDocType: string, depth: number = 0): Promise<void> => {
      if (depth > 3) return;
      try {
        const items = await client.listFiles(containerId, folderPath);
        for (const item of items) {
          if ((item as any).folder) {
            await listRecursive(`${folderPath}/${item.name}`, inferredDocType, depth + 1);
          } else {
            (item as any)._inferredDocType = inferredDocType;
            (item as any)._folderPath = folderPath;
            allFiles.push(item);
          }
        }
      } catch (error) {
        if (depth === 0) {
          console.log(`[SharePointStorage] Could not list ${folderPath}:`, error instanceof Error ? error.message : error);
        }
      }
    };

    for (const folder of folderTypes) {
      await listRecursive(`/${folder}`, folderToDocType[folder] || 'receipt', 0);
    }
    
    console.log(`[SharePointStorage] listAllFiles - Total files found: ${allFiles.length}`);
    return allFiles;
  }
}
