/**
 * Local File Storage Service
 * Provides file upload, storage, and retrieval functionality using local filesystem
 * Maintains the same metadata structure as SharePoint Embedded design
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage directory configuration
const STORAGE_ROOT = path.join(__dirname, '../../uploads');

// Document type directories
const DOCUMENT_DIRS = {
  receipt: path.join(STORAGE_ROOT, 'receipts'),
  invoice: path.join(STORAGE_ROOT, 'invoices'),
  contract: path.join(STORAGE_ROOT, 'contracts'),
  statementOfWork: path.join(STORAGE_ROOT, 'statements'),
  estimate: path.join(STORAGE_ROOT, 'estimates'),
  changeOrder: path.join(STORAGE_ROOT, 'change_orders'),
  report: path.join(STORAGE_ROOT, 'reports')
};

// Get directory for document type with safety
function getDocumentDirectory(documentType: string): string {
  const dir = DOCUMENT_DIRS[documentType as keyof typeof DOCUMENT_DIRS] || DOCUMENT_DIRS.receipt;
  return dir;
}

// Document metadata interface matching SharePoint design
export interface DocumentMetadata {
  // Core document classification
  documentType: 'receipt' | 'invoice' | 'statementOfWork' | 'contract' | 'report' | 'estimate' | 'changeOrder';
  
  // Client and project linkage
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectCode?: string;
  
  // Effective date for contracts, SOWs, estimates, change orders
  effectiveDate?: Date;
  
  // Monetary amount for financial documents
  amount?: number;
  
  // Additional document references
  estimateId?: string;
  changeOrderId?: string;
  
  // Free-form categorization
  tags?: string;
  
  // Audit trail
  createdByUserId: string;
  
  // Schema version for future evolution
  metadataVersion: number;
}

// File storage result interface
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

export class LocalFileStorage {
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private sanitizeFileName(fileName: string): string {
    // Remove or replace dangerous characters
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  private generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBase = this.sanitizeFileName(baseName);
    const uniqueId = randomUUID().substring(0, 8);
    return `${sanitizedBase}_${uniqueId}${ext}`;
  }

  /**
   * Store a file with metadata
   */
  async storeFile(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    metadata: DocumentMetadata,
    uploadedBy: string,
    fileId?: string  // Optional file ID to use instead of generating UUID
  ): Promise<StoredFile> {
    // Ensure storage directories exist
    this.ensureDirectoryExists(STORAGE_ROOT);
    
    // Get appropriate directory for document type
    const documentDir = getDocumentDirectory(metadata.documentType);
    this.ensureDirectoryExists(documentDir);

    // Generate unique file name
    const fileName = this.generateUniqueFileName(originalName);
    const filePath = path.join(documentDir, fileName);

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    // Create stored file record
    const storedFile: StoredFile = {
      id: fileId || randomUUID(),
      fileName,
      originalName,
      filePath,
      size: buffer.length,
      contentType,
      metadata: {
        ...metadata,
        metadataVersion: metadata.metadataVersion || 1
      },
      uploadedAt: new Date(),
      uploadedBy
    };

    // Write metadata file alongside the main file
    const metadataPath = filePath + '.metadata.json';
    
    // Serialize with proper date handling
    const serializedFile = {
      ...storedFile,
      uploadedAt: storedFile.uploadedAt.toISOString(),
      metadata: {
        ...storedFile.metadata,
        effectiveDate: storedFile.metadata.effectiveDate?.toISOString()
      }
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(serializedFile, null, 2));

    return storedFile;
  }

  /**
   * Retrieve file metadata by ID
   */
  async getFileMetadata(fileId: string): Promise<StoredFile | null> {
    // Search across all document type directories for metadata files
    for (const documentType of Object.keys(DOCUMENT_DIRS)) {
      const documentDir = getDocumentDirectory(documentType);
      
      // Skip if directory doesn't exist
      if (!fs.existsSync(documentDir)) {
        continue;
      }
      
      try {
        const files = fs.readdirSync(documentDir);
        
        for (const file of files) {
          if (file.endsWith('.metadata.json')) {
            const metadataPath = path.join(documentDir, file);
            try {
              const content = fs.readFileSync(metadataPath, 'utf-8');
              const rawData = JSON.parse(content);
              
              // Rehydrate dates from string format
              const storedFile: StoredFile = {
                ...rawData,
                uploadedAt: new Date(rawData.uploadedAt),
                metadata: {
                  ...rawData.metadata,
                  effectiveDate: rawData.metadata.effectiveDate ? new Date(rawData.metadata.effectiveDate) : undefined
                }
              };
              
              if (storedFile.id === fileId) {
                return storedFile;
              }
            } catch (error) {
              console.warn(`Failed to read metadata file ${file}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${documentDir}:`, error);
      }
    }
    
    return null;
  }

  /**
   * Retrieve file content by ID
   */
  async getFileContent(fileId: string): Promise<{ buffer: Buffer; metadata: StoredFile } | null> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(metadata.filePath);
      return { buffer, metadata };
    } catch (error) {
      console.error(`Failed to read file content for ID ${fileId}:`, error);
      return null;
    }
  }

  /**
   * List files with optional filtering
   */
  async listFiles(filter?: {
    documentType?: string;
    projectId?: string;
    clientId?: string;
    uploadedBy?: string;
  }): Promise<StoredFile[]> {
    // Search across all document type directories safely
    const results: StoredFile[] = [];
    const directoriesToSearch = filter?.documentType 
      ? [getDocumentDirectory(filter.documentType)]
      : Object.values(DOCUMENT_DIRS);
    
    for (const documentDir of directoriesToSearch) {
      // Skip if directory doesn't exist
      if (!fs.existsSync(documentDir)) {
        continue;
      }
      
      try {
        const files = fs.readdirSync(documentDir);

        for (const file of files) {
          if (file.endsWith('.metadata.json')) {
            const metadataPath = path.join(documentDir, file);
            try {
              const content = fs.readFileSync(metadataPath, 'utf-8');
              const rawData = JSON.parse(content);
              
              // Rehydrate dates from string format
              const storedFile: StoredFile = {
                ...rawData,
                uploadedAt: new Date(rawData.uploadedAt),
                metadata: {
                  ...rawData.metadata,
                  effectiveDate: rawData.metadata.effectiveDate ? new Date(rawData.metadata.effectiveDate) : undefined
                }
              };

              // Apply filters
              if (filter) {
                if (filter.documentType && storedFile.metadata.documentType !== filter.documentType) {
                  continue;
                }
                if (filter.projectId && storedFile.metadata.projectId !== filter.projectId) {
                  continue;
                }
                if (filter.clientId && storedFile.metadata.clientId !== filter.clientId) {
                  continue;
                }
                if (filter.uploadedBy && storedFile.uploadedBy !== filter.uploadedBy) {
                  continue;
                }
              }

              results.push(storedFile);
            } catch (error) {
              console.warn(`Failed to read metadata file ${file}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${documentDir}:`, error);
      }
    }

    // Sort by upload date (newest first)
    return results.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  /**
   * Delete a file and its metadata
   */
  async deleteFile(fileId: string): Promise<boolean> {
    const metadata = await this.getFileMetadata(fileId);
    if (!metadata) {
      return false;
    }

    try {
      // Delete main file
      if (fs.existsSync(metadata.filePath)) {
        fs.unlinkSync(metadata.filePath);
      }

      // Delete metadata file
      const metadataPath = metadata.filePath + '.metadata.json';
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }

      return true;
    } catch (error) {
      console.error(`Failed to delete file ${fileId}:`, error);
      return false;
    }
  }

  /**
   * Update file metadata
   */
  async updateMetadata(fileId: string, updates: Partial<DocumentMetadata>): Promise<StoredFile | null> {
    const storedFile = await this.getFileMetadata(fileId);
    if (!storedFile) {
      return null;
    }

    // Update metadata
    storedFile.metadata = {
      ...storedFile.metadata,
      ...updates,
      metadataVersion: storedFile.metadata.metadataVersion // Preserve version
    };

    // Write updated metadata with proper date serialization
    const metadataPath = storedFile.filePath + '.metadata.json';
    
    const serializedFile = {
      ...storedFile,
      uploadedAt: storedFile.uploadedAt.toISOString(),
      metadata: {
        ...storedFile.metadata,
        effectiveDate: storedFile.metadata.effectiveDate?.toISOString()
      }
    };
    
    fs.writeFileSync(metadataPath, JSON.stringify(serializedFile, null, 2));

    return storedFile;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    byDocumentType: Record<string, number>;
  }> {
    const files = await this.listFiles();
    
    const stats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      byDocumentType: {} as Record<string, number>
    };

    // Group by document type
    for (const file of files) {
      const type = file.metadata.documentType;
      stats.byDocumentType[type] = (stats.byDocumentType[type] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const localFileStorage = new LocalFileStorage();