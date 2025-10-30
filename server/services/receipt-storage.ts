import { Storage } from "@google-cloud/storage";
import * as fs from 'fs/promises';
import * as path from 'path';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Receipt Storage Service
// Production: Uses Replit Object Storage (persistent)
// Development: Uses local filesystem

export interface ReceiptMetadata {
  documentType: 'receipt';
  projectId?: string;
  effectiveDate?: Date;
  amount?: number;
  tags?: string;
  createdByUserId: string;
  metadataVersion: number;
}

export interface StoredReceipt {
  fileId: string;
  fileName: string;
  originalName: string;
  size: number;
  contentType: string;
  metadata: ReceiptMetadata;
}

export class ReceiptStorage {
  private objectStorageClient: Storage | null = null;
  private isProduction: boolean;

  constructor() {
    this.isProduction = 
      process.env.REPLIT_DEPLOYMENT === '1' || 
      process.env.NODE_ENV === 'production';

    // Initialize Object Storage client only in production
    if (this.isProduction) {
      this.objectStorageClient = new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
          type: "external_account",
          credential_source: {
            url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
            format: {
              type: "json",
              subject_token_field_name: "access_token",
            },
          },
          universe_domain: "googleapis.com",
        },
        projectId: "",
      });
    }
  }

  /**
   * Store receipt file
   * Production: Uses Replit Object Storage
   * Development: Uses local filesystem
   */
  async storeReceipt(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    metadata: ReceiptMetadata
  ): Promise<StoredReceipt> {
    const sanitizedName = this.sanitizeFilename(originalName);
    const uniqueId = this.generateUniqueId();
    const ext = path.extname(sanitizedName);
    const baseName = path.basename(sanitizedName, ext);
    const fileName = `${baseName}_${uniqueId}${ext}`;

    if (this.isProduction) {
      // Production: Store in Replit Object Storage
      const fileId = await this.storeInObjectStorage(buffer, fileName, contentType, metadata);
      return {
        fileId,
        fileName,
        originalName,
        size: buffer.length,
        contentType,
        metadata
      };
    } else {
      // Development: Store in local filesystem
      const fileId = await this.storeLocally(buffer, fileName);
      return {
        fileId,
        fileName,
        originalName,
        size: buffer.length,
        contentType,
        metadata
      };
    }
  }

  /**
   * Retrieve receipt file
   */
  async getReceipt(fileId: string): Promise<Buffer> {
    if (this.isProduction) {
      // Production: Retrieve from Object Storage
      return await this.retrieveFromObjectStorage(fileId);
    } else {
      // Development: Retrieve from local filesystem
      return await this.retrieveLocally(fileId);
    }
  }

  /**
   * Delete receipt file
   */
  async deleteReceipt(fileId: string): Promise<void> {
    if (this.isProduction) {
      // Production: Delete from Object Storage
      await this.deleteFromObjectStorage(fileId);
    } else {
      // Development: Delete from local filesystem
      await this.deleteLocally(fileId);
    }
  }

  // === Production: Object Storage Methods ===

  private async storeInObjectStorage(
    buffer: Buffer,
    filename: string,
    contentType: string,
    metadata: ReceiptMetadata
  ): Promise<string> {
    if (!this.objectStorageClient) {
      throw new Error('Object Storage client not initialized');
    }

    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    // Parse the private object directory path: /<bucket_name>/<path>
    const pathParts = privateObjectDir.split('/').filter(p => p);
    if (pathParts.length < 1) {
      throw new Error('Invalid PRIVATE_OBJECT_DIR format');
    }

    const bucketName = pathParts[0];
    const bucketPath = pathParts.slice(1).join('/');
    const objectPath = `${bucketPath}/receipts/${filename}`;

    const bucket = this.objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);

    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: 'private, max-age=3600',
        customMetadata: {
          documentType: metadata.documentType,
          projectId: metadata.projectId || '',
          amount: metadata.amount?.toString() || '',
          createdByUserId: metadata.createdByUserId,
        },
      },
    });

    console.log(`[ReceiptStorage] Stored in Object Storage: ${objectPath}`);
    
    // Return object storage file ID
    return objectPath;
  }

  private async retrieveFromObjectStorage(objectPath: string): Promise<Buffer> {
    if (!this.objectStorageClient) {
      throw new Error('Object Storage client not initialized');
    }

    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    const pathParts = privateObjectDir.split('/').filter(p => p);
    const bucketName = pathParts[0];

    const bucket = this.objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);

    const [contents] = await file.download();
    return contents;
  }

  private async deleteFromObjectStorage(objectPath: string): Promise<void> {
    if (!this.objectStorageClient) {
      throw new Error('Object Storage client not initialized');
    }

    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    const pathParts = privateObjectDir.split('/').filter(p => p);
    const bucketName = pathParts[0];

    const bucket = this.objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);

    await file.delete();
    console.log(`[ReceiptStorage] Deleted from Object Storage: ${objectPath}`);
  }

  // === Development: Local Filesystem Methods ===

  private async storeLocally(buffer: Buffer, filename: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'receipts');
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    console.log(`[ReceiptStorage] Stored locally: ${filePath}`);
    
    // Return relative path as file ID
    return path.join('receipts', filename);
  }

  private async retrieveLocally(fileId: string): Promise<Buffer> {
    const filePath = path.join(process.cwd(), 'uploads', fileId);
    return await fs.readFile(filePath);
  }

  private async deleteLocally(fileId: string): Promise<void> {
    const filePath = path.join(process.cwd(), 'uploads', fileId);
    await fs.unlink(filePath);
    console.log(`[ReceiptStorage] Deleted locally: ${filePath}`);
  }

  // === Utility Methods ===

  private sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}

// Export singleton instance
export const receiptStorage = new ReceiptStorage();
