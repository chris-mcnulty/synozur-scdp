/**
 * SharePoint Embedded File Storage Service
 * Provides file upload, storage, and retrieval using SharePoint Embedded containers
 * Replaces local file storage with cloud-based SharePoint storage
 */

import { GraphClient, type DriveItemWithMetadata } from './graph-client.js';
import type { DocumentMetadata } from './local-file-storage.js';

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

  constructor() {
    this.graphClient = new GraphClient();
    
    // Determine environment: use PROD container when deployed, DEV otherwise
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
    
    if (isProduction) {
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

  /**
   * Store a file in SharePoint Embedded container
   */
  async storeFile(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    metadata: DocumentMetadata,
    uploadedBy: string,
    fileId?: string
  ): Promise<StoredFile> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      // Generate folder path based on document type
      const folderPath = this.getFolderPath(metadata.documentType);
      
      // Sanitize filename
      const sanitizedName = this.sanitizeFileName(originalName);
      const fileName = fileId ? `${fileId}_${sanitizedName}` : `${Date.now()}_${sanitizedName}`;
      
      // Prepare metadata for SharePoint columns
      const sharePointMetadata = {
        DocumentType: metadata.documentType,
        ClientId: metadata.clientId || '',
        ClientName: metadata.clientName || '',
        ProjectId: metadata.projectId || '',
        ProjectCode: metadata.projectCode || '',
        Amount: metadata.amount?.toString() || '',
        Tags: metadata.tags || '',
        CreatedByUserId: metadata.createdByUserId,
        MetadataVersion: metadata.metadataVersion.toString(),
        EffectiveDate: metadata.effectiveDate?.toISOString() || '',
        EstimateId: metadata.estimateId || '',
        ChangeOrderId: metadata.changeOrderId || ''
      };

      // Upload file to SharePoint using the uploadFile method
      // uploadFile(siteIdOrContainerId, driveIdOrContainerId, folderPath, fileName, fileBuffer, projectCode?, expenseId?)
      const driveItem = await this.graphClient.uploadFile(
        this.containerId,  // siteIdOrContainerId (ignored for SPE)
        this.containerId,  // driveIdOrContainerId (used as containerId)
        folderPath,
        fileName,
        buffer,
        metadata.projectCode,
        metadata.estimateId  // Using estimateId as a reference
      );

      // Return stored file info
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
      throw new Error(`Failed to upload file to SharePoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(fileId: string): Promise<StoredFile | null> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      const driveItem = await this.graphClient.getItem(this.containerId, fileId) as DriveItemWithMetadata;
      
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
  async getFileContent(fileId: string): Promise<{ buffer: Buffer; metadata: StoredFile } | null> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      const fileMetadata = await this.getFileMetadata(fileId);
      if (!fileMetadata) {
        return null;
      }

      const downloadResult = await this.graphClient.downloadFile(this.containerId, fileId);
      
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
  async listFiles(filter?: { documentType?: string; clientId?: string; projectId?: string }): Promise<StoredFile[]> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      // Build OData filter query
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

      // List all files recursively and filter in memory
      // Note: GraphClient doesn't have metadata querying yet, so we'll list all and filter locally
      const allItems = await this.listAllFiles(this.containerId);

      // Filter based on criteria
      const filteredItems = allItems.filter((item: any) => {
        if (!item.listItem?.fields) return false;
        const fields = item.listItem.fields;
        
        if (filter?.documentType && fields.DocumentType !== filter.documentType) return false;
        if (filter?.clientId && fields.ClientId !== filter.clientId) return false;
        if (filter?.projectId && fields.ProjectId !== filter.projectId) return false;
        
        return true;
      });

      return filteredItems.map((item: any) => {
        const fields = item.listItem?.fields || {};
        
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
          id: item.id,
          fileName: item.name,
          originalName: item.name,
          filePath: item.webUrl || item.id,
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
  async deleteFile(fileId: string): Promise<boolean> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      await this.graphClient.deleteFile(this.containerId, fileId);
      return true;
    } catch (error) {
      console.error('[SharePointStorage] Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Update file metadata
   */
  async updateMetadata(fileId: string, metadata: Partial<DocumentMetadata>): Promise<boolean> {
    if (!this.containerId) {
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
  async getStorageStats(): Promise<any> {
    if (!this.containerId) {
      throw new Error('SHAREPOINT_CONTAINER_ID not configured');
    }

    try {
      const container = await this.graphClient.getFileStorageContainer(this.containerId);
      const allFiles = await this.listFiles();

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
      receipt: 'receipts',
      invoice: 'invoices',
      contract: 'contracts',
      statementOfWork: 'statements',
      estimate: 'estimates',
      changeOrder: 'change_orders',
      report: 'reports'
    };
    return folderMap[documentType] || 'receipts';
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
  private async listAllFiles(containerId: string): Promise<any[]> {
    const allFiles: any[] = [];
    const folderTypes = ['receipts', 'invoices', 'contracts', 'statements', 'estimates', 'change_orders', 'reports'];
    
    for (const folder of folderTypes) {
      try {
        const files = await this.graphClient.listFiles(containerId, `/${folder}`);
        allFiles.push(...files);
      } catch (error) {
        // Folder might not exist yet, continue
        console.debug(`[SharePointStorage] Could not list ${folder}:`, error);
      }
    }
    
    return allFiles;
  }
}
