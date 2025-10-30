import { Storage } from "@google-cloud/storage";
import * as fs from 'fs/promises';
import * as path from 'path';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Invoice PDF Storage Service
// Production: Uses Replit Object Storage (persistent)
// Development: Uses local filesystem

export class InvoicePDFStorage {
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
   * Store invoice PDF
   * Production: Uses Replit Object Storage
   * Development: Uses local filesystem
   */
  async storeInvoicePDF(pdfBuffer: Buffer, invoiceId: string): Promise<string> {
    const filename = `invoice_${invoiceId}.pdf`;

    if (this.isProduction) {
      // Production: Store in Replit Object Storage
      return await this.storeInObjectStorage(pdfBuffer, filename);
    } else {
      // Development: Store in local filesystem
      return await this.storeLocally(pdfBuffer, filename);
    }
  }

  /**
   * Retrieve invoice PDF
   */
  async getInvoicePDF(fileId: string): Promise<Buffer> {
    if (this.isProduction) {
      // Production: Retrieve from Object Storage
      return await this.retrieveFromObjectStorage(fileId);
    } else {
      // Development: Retrieve from local filesystem
      return await this.retrieveLocally(fileId);
    }
  }

  /**
   * Delete invoice PDF
   */
  async deleteInvoicePDF(fileId: string): Promise<void> {
    if (this.isProduction) {
      // Production: Delete from Object Storage
      await this.deleteFromObjectStorage(fileId);
    } else {
      // Development: Delete from local filesystem
      await this.deleteLocally(fileId);
    }
  }

  // === Production: Object Storage Methods ===

  private async storeInObjectStorage(buffer: Buffer, filename: string): Promise<string> {
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
    const objectPath = `${bucketPath}/invoices/${filename}`;

    const bucket = this.objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);

    await file.save(buffer, {
      contentType: 'application/pdf',
      metadata: {
        cacheControl: 'private, max-age=3600',
      },
    });

    console.log(`[InvoicePDFStorage] Stored in Object Storage: ${objectPath}`);
    
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
    console.log(`[InvoicePDFStorage] Deleted from Object Storage: ${objectPath}`);
  }

  // === Development: Local Filesystem Methods ===

  private async storeLocally(buffer: Buffer, filename: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'invoices');
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    console.log(`[InvoicePDFStorage] Stored locally: ${filePath}`);
    
    // Return relative path as file ID
    return path.join('invoices', filename);
  }

  private async retrieveLocally(fileId: string): Promise<Buffer> {
    const filePath = path.join(process.cwd(), 'uploads', fileId);
    return await fs.readFile(filePath);
  }

  private async deleteLocally(fileId: string): Promise<void> {
    const filePath = path.join(process.cwd(), 'uploads', fileId);
    await fs.unlink(filePath);
    console.log(`[InvoicePDFStorage] Deleted locally: ${filePath}`);
  }
}

// Export singleton instance
export const invoicePDFStorage = new InvoicePDFStorage();
