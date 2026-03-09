import { Storage } from "@google-cloud/storage";
import * as fs from 'fs/promises';
import * as path from 'path';
import { SharePointFileStorage } from './sharepoint-file-storage.js';
import { GraphClient } from './graph-client.js';
import type { DocumentMetadata } from './local-file-storage.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export interface MigrationProgress {
  tenantId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalFiles: number;
  migratedFiles: number;
  failedFiles: number;
  errors: Array<{ fileName: string; error: string }>;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  progress: MigrationProgress;
}

interface LocalFileEntry {
  filePath: string;
  fileName: string;
  fullPath: string;
  documentType: string;
  metadata?: Record<string, any>;
}

export class SpeMigrationService {
  private sharePointStorage: SharePointFileStorage;
  private isProduction: boolean;
  private activeProgress: Map<string, MigrationProgress> = new Map();

  constructor() {
    this.sharePointStorage = new SharePointFileStorage();
    this.isProduction = process.env.REPLIT_DEPLOYMENT === '1' || process.env.NODE_ENV === 'production';
  }

  async getMigrationStatus(tenantId: string): Promise<MigrationProgress> {
    const inMemory = this.activeProgress.get(tenantId);
    if (inMemory) {
      return inMemory;
    }

    const speConfig = await storage.getTenantSpeConfig(tenantId);
    return {
      tenantId,
      status: (speConfig?.speMigrationStatus as MigrationProgress['status']) || 'pending',
      totalFiles: 0,
      migratedFiles: 0,
      failedFiles: 0,
      errors: [],
      startedAt: speConfig?.speMigrationStartedAt || null,
      completedAt: null,
    };
  }

  async startMigration(tenantId: string): Promise<MigrationResult> {
    const speConfig = await storage.getTenantSpeConfig(tenantId);
    if (!speConfig) {
      return {
        success: false,
        message: 'Tenant not found',
        progress: this.createEmptyProgress(tenantId),
      };
    }

    const containerId = this.isProduction
      ? speConfig.speContainerIdProd
      : speConfig.speContainerIdDev;

    if (!containerId) {
      return {
        success: false,
        message: `No SPE container configured for ${this.isProduction ? 'production' : 'development'}`,
        progress: this.createEmptyProgress(tenantId),
      };
    }

    if (speConfig.speMigrationStatus === 'in_progress') {
      const existing = this.activeProgress.get(tenantId);
      if (existing) {
        return {
          success: false,
          message: 'Migration is already in progress',
          progress: existing,
        };
      }
    }

    const progress: MigrationProgress = {
      tenantId,
      status: 'in_progress',
      totalFiles: 0,
      migratedFiles: 0,
      failedFiles: 0,
      errors: [],
      startedAt: new Date(),
      completedAt: null,
    };

    this.activeProgress.set(tenantId, progress);

    await storage.updateTenantSpeConfig(tenantId, {
      speMigrationStatus: 'in_progress',
      speMigrationStartedAt: new Date(),
    });

    this.executeMigration(tenantId, containerId, progress).catch((err) => {
      console.error(`[SPE-Migration] Unhandled error for tenant ${tenantId}:`, err);
      progress.status = 'failed';
      progress.errors.push({ fileName: '_migration', error: err instanceof Error ? err.message : String(err) });
      storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'failed' }).catch(() => {});
    });

    return {
      success: true,
      message: 'Migration started',
      progress,
    };
  }

  private async executeMigration(
    tenantId: string,
    containerId: string,
    progress: MigrationProgress
  ): Promise<void> {
    console.log(`[SPE-Migration] Starting migration for tenant ${tenantId} to container ${containerId.substring(0, 20)}...`);

    const fileIdMappings: Array<{ oldFileId: string; newFileId: string; fileName: string; documentType: string }> = [];

    try {
      const files = await this.listSourceFiles(tenantId);
      progress.totalFiles = files.length;

      if (files.length === 0) {
        console.log(`[SPE-Migration] No files found for tenant ${tenantId}. Marking migration complete.`);
        progress.status = 'completed';
        progress.completedAt = new Date();
        await storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'completed' });
        this.activeProgress.delete(tenantId);
        return;
      }

      console.log(`[SPE-Migration] Found ${files.length} files to migrate for tenant ${tenantId}`);

      for (const file of files) {
        try {
          const buffer = await this.readSourceFile(file);
          const contentType = this.guessContentType(file.fileName);
          const metadata: DocumentMetadata = {
            documentType: (file.documentType || 'receipt') as DocumentMetadata['documentType'],
            createdByUserId: file.metadata?.createdByUserId || 'migration',
            metadataVersion: 1,
            projectId: file.metadata?.projectId,
            clientId: file.metadata?.clientId,
            clientName: file.metadata?.clientName,
            projectCode: file.metadata?.projectCode,
            amount: file.metadata?.amount ? parseFloat(file.metadata.amount) : undefined,
            tags: file.metadata?.tags,
          };

          const storedFile = await this.sharePointStorage.storeFile(
            buffer,
            file.fileName,
            contentType,
            metadata,
            'spe-migration',
            undefined,
            tenantId
          );

          fileIdMappings.push({
            oldFileId: file.filePath || file.fullPath,
            newFileId: storedFile.id,
            fileName: file.fileName,
            documentType: file.documentType,
          });

          progress.migratedFiles++;
          console.log(`[SPE-Migration] Migrated ${progress.migratedFiles}/${progress.totalFiles}: ${file.fileName} → ${storedFile.id}`);
        } catch (fileError) {
          progress.failedFiles++;
          const errorMsg = fileError instanceof Error ? fileError.message : String(fileError);
          progress.errors.push({ fileName: file.fileName, error: errorMsg });
          console.error(`[SPE-Migration] Failed to migrate ${file.fileName}:`, errorMsg);
        }
      }

      if (fileIdMappings.length > 0) {
        console.log(`[SPE-Migration] Updating ${fileIdMappings.length} database pointers...`);
        await this.updateDatabasePointers(tenantId, fileIdMappings);
      }

      if (progress.failedFiles === 0) {
        progress.status = 'completed';
        await storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'completed' });
      } else if (progress.migratedFiles > 0) {
        progress.status = 'completed';
        await storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'completed' });
        console.warn(`[SPE-Migration] Migration completed with ${progress.failedFiles} failures out of ${progress.totalFiles} files`);
      } else {
        progress.status = 'failed';
        await storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'failed' });
      }

      progress.completedAt = new Date();
      console.log(`[SPE-Migration] Migration finished for tenant ${tenantId}: ${progress.migratedFiles} migrated, ${progress.failedFiles} failed, ${fileIdMappings.length} pointers updated`);
    } catch (error) {
      console.error(`[SPE-Migration] Migration failed for tenant ${tenantId}:`, error);
      progress.status = 'failed';
      progress.completedAt = new Date();
      progress.errors.push({
        fileName: '_migration',
        error: error instanceof Error ? error.message : String(error),
      });
      await storage.updateTenantSpeConfig(tenantId, { speMigrationStatus: 'failed' });
    } finally {
      setTimeout(() => {
        this.activeProgress.delete(tenantId);
      }, 5 * 60 * 1000);
    }
  }

  private async updateFilePointerInDb(
    tableName: string,
    columnName: string,
    oldValue: string,
    newValue: string,
    tenantId?: string
  ): Promise<number> {
    try {
      const tenantFilter = tenantId
        ? sql` AND tenant_id = ${tenantId}`
        : sql``;

      const result = await db.execute(
        sql`UPDATE ${sql.identifier(tableName)} SET ${sql.identifier(columnName)} = ${newValue} WHERE ${sql.identifier(columnName)} = ${oldValue}${tenantFilter}`
      );

      return (result as any).rowCount || 0;
    } catch (error) {
      console.warn(`[SPE-Migration] Could not update ${tableName}.${columnName}:`, error instanceof Error ? error.message : error);
      return 0;
    }
  }

  private async updateDatabasePointers(
    tenantId: string,
    mappings: Array<{ oldFileId: string; newFileId: string; fileName: string; documentType: string }>
  ): Promise<void> {
    let updatedCount = 0;

    for (const mapping of mappings) {
      try {
        const { oldFileId, newFileId, fileName, documentType } = mapping;

        if (documentType === 'receipt') {
          const updated = await this.updateFilePointerInDb('expenses', 'receipt_url', oldFileId, newFileId, tenantId);
          if (updated > 0) {
            updatedCount += updated;
            console.log(`[SPE-Migration] Updated ${updated} expense receipt pointer(s): ${oldFileId} → ${newFileId}`);
          }
          const pendingUpdated = await this.updateFilePointerInDb('pending_receipts', 'file_path', oldFileId, newFileId);
          if (pendingUpdated > 0) {
            updatedCount += pendingUpdated;
            console.log(`[SPE-Migration] Updated ${pendingUpdated} pending receipt pointer(s)`);
          }
        }

        if (documentType === 'invoice') {
          const updated = await this.updateFilePointerInDb('invoice_batches', 'pdf_file_id', oldFileId, newFileId, tenantId);
          if (updated > 0) {
            updatedCount += updated;
            console.log(`[SPE-Migration] Updated ${updated} invoice PDF pointer(s): ${oldFileId} → ${newFileId}`);
          }
        }

        if (documentType === 'contract' || documentType === 'sow' || documentType === 'statementOfWork' || documentType === 'changeOrder') {
          const updated = await this.updateFilePointerInDb('sows', 'document_url', oldFileId, newFileId, tenantId);
          if (updated > 0) {
            updatedCount += updated;
            console.log(`[SPE-Migration] Updated ${updated} SOW/change order document pointer(s): ${oldFileId} → ${newFileId}`);
          }
        }
      } catch (error) {
        console.error(`[SPE-Migration] Failed to update pointer for ${mapping.fileName}:`, error);
      }
    }

    console.log(`[SPE-Migration] Database pointer update complete: ${updatedCount} total records updated`);
  }

  async getStorageInventory(tenantId: string, includeUntagged: boolean = false): Promise<{
    totalFiles: number;
    totalSize: number;
    untaggedFiles: number;
    byDocumentType: Record<string, number>;
    files: Array<{ fileName: string; documentType: string; size: number; path: string; tagged: boolean }>;
  }> {
    let allFiles: LocalFileEntry[] = [];
    if (this.isProduction) {
      allFiles = await this.listObjectStorageFiles(tenantId);
    } else {
      allFiles = await this.listLocalFiles();
    }

    let untaggedCount = 0;
    const inventory: Array<{ fileName: string; documentType: string; size: number; path: string; tagged: boolean }> = [];
    let totalSize = 0;
    const byDocumentType: Record<string, number> = {};

    for (const file of allFiles) {
      const hasTenantTag = !!file.metadata?.tenantId;
      const belongsToTenant = hasTenantTag && file.metadata.tenantId === tenantId;
      const isUntagged = !hasTenantTag;

      if (isUntagged) untaggedCount++;

      if (!belongsToTenant && !(isUntagged && includeUntagged)) {
        continue;
      }

      let size = 0;
      try {
        if (!this.isProduction) {
          const fs = await import('fs/promises');
          const stat = await fs.stat(file.fullPath);
          size = stat.size;
        }
      } catch {}

      totalSize += size;
      byDocumentType[file.documentType] = (byDocumentType[file.documentType] || 0) + 1;
      inventory.push({
        fileName: file.fileName,
        documentType: file.documentType,
        size,
        path: file.filePath,
        tagged: hasTenantTag,
      });
    }

    return {
      totalFiles: inventory.length,
      totalSize,
      untaggedFiles: untaggedCount,
      byDocumentType,
      files: inventory,
    };
  }

  async testContainerAccess(tenantId: string): Promise<{
    success: boolean;
    uploadOk: boolean;
    downloadOk: boolean;
    deleteOk: boolean;
    error?: string;
    details?: string;
  }> {
    const speConfig = await storage.getTenantSpeConfig(tenantId);
    if (!speConfig) {
      return { success: false, uploadOk: false, downloadOk: false, deleteOk: false, error: 'Tenant not found' };
    }

    const containerId = this.isProduction
      ? speConfig.speContainerIdProd
      : speConfig.speContainerIdDev;

    if (!containerId) {
      return { success: false, uploadOk: false, downloadOk: false, deleteOk: false, error: `No SPE container configured for ${this.isProduction ? 'production' : 'development'}` };
    }

    const tenant = await storage.getTenant(tenantId);
    const azureTenantId = tenant?.azureTenantId || undefined;
    const graphClient = new GraphClient(azureTenantId);
    console.log(`[SPE-Test] Testing container ${containerId.substring(0, 20)}... with Azure tenant: ${azureTenantId ? azureTenantId.substring(0, 8) + '...' : 'default'}`);

    const token = await graphClient.authenticate();

    const diagnostics: Record<string, string> = {};
    try {
      const containerResp = await fetch(
        `https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const containerData = await containerResp.json();
      diagnostics.containerStatus = containerResp.ok
        ? `OK (${containerData.status}, type: ${containerData.containerTypeId})`
        : `FAIL ${containerResp.status}: ${containerData.error?.message || 'unknown'}`;
      console.log(`[SPE-Test] Container check: ${diagnostics.containerStatus}`);
    } catch (e) {
      diagnostics.containerStatus = `Error: ${e instanceof Error ? e.message : e}`;
    }

    try {
      const driveResp = await fetch(
        `https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const driveData = await driveResp.json();
      diagnostics.driveV1 = driveResp.ok
        ? `OK (driveType: ${driveData.driveType}, id: ${driveData.id?.substring(0, 20)})`
        : `FAIL ${driveResp.status}: ${driveData.error?.message || 'unknown'}`;
      console.log(`[SPE-Test] Drive v1.0: ${diagnostics.driveV1}`);
    } catch (e) {
      diagnostics.driveV1 = `Error: ${e instanceof Error ? e.message : e}`;
    }

    try {
      const betaDriveResp = await fetch(
        `https://graph.microsoft.com/beta/storage/fileStorage/containers/${containerId}/drive`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const betaDriveData = await betaDriveResp.json();
      diagnostics.driveBeta = betaDriveResp.ok
        ? `OK (driveType: ${betaDriveData.driveType}, id: ${betaDriveData.id?.substring(0, 20)})`
        : `FAIL ${betaDriveResp.status}: ${betaDriveData.error?.message || 'unknown'}`;
      console.log(`[SPE-Test] Drive beta: ${diagnostics.driveBeta}`);
    } catch (e) {
      diagnostics.driveBeta = `Error: ${e instanceof Error ? e.message : e}`;
    }

    try {
      const regResp = await fetch(
        `https://graph.microsoft.com/v1.0/storage/fileStorage/containerTypeRegistrations/${graphClient.getContainerTypeId?.() || '358aba7d-bb55-4ce0-a08d-e51f03d5edf1'}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const regData = await regResp.json();
      diagnostics.registration = regResp.ok
        ? `OK (billing: ${regData.billingClassification}, grants: ${regData.applicationPermissionGrants?.length || 0})`
        : `FAIL ${regResp.status}: ${regData.error?.message || 'unknown'}`;
      console.log(`[SPE-Test] Registration: ${diagnostics.registration}`);
    } catch (e) {
      diagnostics.registration = `Error: ${e instanceof Error ? e.message : e}`;
    }

    const testContent = `SPE test file - ${new Date().toISOString()} - tenant: ${tenantId}`;
    const testBuffer = Buffer.from(testContent, 'utf-8');
    const testFileName = `_spe_test_${Date.now()}.txt`;
    let uploadOk = false;
    let downloadOk = false;
    let deleteOk = false;
    let uploadedFileId = '';

    try {
      const driveItem = await graphClient.uploadFile(
        containerId,
        containerId,
        '/reports',
        testFileName,
        testBuffer,
        undefined,
        undefined,
        { DocumentType: 'report', CreatedByUserId: 'spe-test', MetadataVersion: 1 }
      );
      uploadOk = true;
      uploadedFileId = driveItem.id;
      console.log(`[SPE-Test] Upload OK: ${driveItem.id}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SPE-Test] Upload failed:`, errMsg);
      return {
        success: false, uploadOk: false, downloadOk: false, deleteOk: false,
        error: `Upload test failed: ${errMsg}`,
        details: `Diagnostics: ${JSON.stringify(diagnostics)} | Error: ${errMsg}`,
      };
    }

    try {
      const downloaded = await graphClient.downloadFile(containerId, uploadedFileId);
      if (downloaded && downloaded.buffer) {
        const downloadedText = downloaded.buffer.toString('utf-8');
        downloadOk = downloadedText === testContent;
        if (!downloadOk) {
          console.warn(`[SPE-Test] Download content mismatch: expected ${testContent.length} bytes, got ${downloadedText.length}`);
        }
      }
      console.log(`[SPE-Test] Download OK: content match = ${downloadOk}`);
    } catch (err) {
      console.error(`[SPE-Test] Download test failed:`, err instanceof Error ? err.message : err);
    }

    try {
      await graphClient.deleteFile(containerId, uploadedFileId);
      deleteOk = true;
      console.log(`[SPE-Test] Delete OK: ${deleteOk}`);
    } catch (err) {
      console.error(`[SPE-Test] Delete test failed:`, err instanceof Error ? err.message : err);
    }

    return {
      success: uploadOk && downloadOk && deleteOk,
      uploadOk,
      downloadOk,
      deleteOk,
      details: `Test file: ${testFileName}`,
    };
  }

  private async listSourceFiles(tenantId: string): Promise<LocalFileEntry[]> {
    let files: LocalFileEntry[] = [];

    if (this.isProduction) {
      const objectStorageFiles = await this.listObjectStorageFiles(tenantId);
      files.push(...objectStorageFiles);
    } else {
      const localFiles = await this.listLocalFiles();
      files.push(...localFiles);
    }

    const beforeFilter = files.length;
    files = files.filter(f => {
      if (!f.metadata?.tenantId) return false;
      return f.metadata.tenantId === tenantId;
    });

    console.log(`[SPE-Migration] Tenant filter: ${beforeFilter} total → ${files.length} for tenant ${tenantId} (excluded ${beforeFilter - files.length} untagged/other-tenant files)`);
    return files;
  }

  private async listObjectStorageFiles(tenantId: string): Promise<LocalFileEntry[]> {
    const files: LocalFileEntry[] = [];

    try {
      const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
      if (!privateObjectDir) {
        console.log('[SPE-Migration] PRIVATE_OBJECT_DIR not configured, skipping object storage scan');
        return files;
      }

      const objectStorageClient = new Storage({
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

      const pathParts = privateObjectDir.split('/').filter(p => p);
      if (pathParts.length < 1) return files;

      const bucketName = pathParts[0];
      const bucketPath = pathParts.slice(1).join('/');
      const bucket = objectStorageClient.bucket(bucketName);

      const docFolders = ['receipts', 'invoices', 'contracts', 'statements', 'estimates', 'change_orders', 'reports'];

      for (const folder of docFolders) {
        const prefix = bucketPath ? `${bucketPath}/${folder}/` : `${folder}/`;
        try {
          const [gcsFiles] = await bucket.getFiles({ prefix });
          for (const gcsFile of gcsFiles) {
            const fileName = path.basename(gcsFile.name);
            if (!fileName) continue;

            let metadata: Record<string, any> = {};
            try {
              const [fileMetadata] = await gcsFile.getMetadata();
              metadata = (fileMetadata as any).metadata || {};
            } catch {}

            files.push({
              filePath: gcsFile.name,
              fileName,
              fullPath: gcsFile.name,
              documentType: this.folderToDocType(folder),
              metadata,
            });
          }
        } catch (err) {
          console.log(`[SPE-Migration] Could not list ${folder} in object storage:`, err instanceof Error ? err.message : err);
        }
      }
    } catch (error) {
      console.error('[SPE-Migration] Error listing object storage files:', error);
    }

    return files;
  }

  private async listLocalFiles(): Promise<LocalFileEntry[]> {
    const files: LocalFileEntry[] = [];
    const uploadsDir = path.join(process.cwd(), 'uploads');

    const docFolders: Record<string, string> = {
      receipts: 'receipt',
      invoices: 'invoice',
      contracts: 'contract',
      statements: 'statementOfWork',
      estimates: 'estimate',
      change_orders: 'changeOrder',
      reports: 'report',
    };

    for (const [folder, docType] of Object.entries(docFolders)) {
      const folderPath = path.join(uploadsDir, folder);
      try {
        const entries = await fs.readdir(folderPath);
        for (const entry of entries) {
          if (entry.endsWith('.metadata.json')) continue;

          const fullPath = path.join(folderPath, entry);
          const stat = await fs.stat(fullPath);
          if (!stat.isFile()) continue;

          let metadata: Record<string, any> = {};
          try {
            const metadataPath = `${fullPath}.metadata.json`;
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            metadata = JSON.parse(metadataContent);
          } catch {}

          files.push({
            filePath: path.join(folder, entry),
            fileName: entry,
            fullPath,
            documentType: docType,
            metadata,
          });
        }
      } catch {
      }
    }

    return files;
  }

  private async readSourceFile(file: LocalFileEntry): Promise<Buffer> {
    if (this.isProduction) {
      return this.readFromObjectStorage(file.fullPath);
    } else {
      return fs.readFile(file.fullPath);
    }
  }

  private async readFromObjectStorage(objectPath: string): Promise<Buffer> {
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateObjectDir) {
      throw new Error('PRIVATE_OBJECT_DIR not configured');
    }

    const pathParts = privateObjectDir.split('/').filter(p => p);
    const bucketName = pathParts[0];

    const objectStorageClient = new Storage({
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

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);
    const [contents] = await file.download();
    return contents;
  }

  private folderToDocType(folder: string): string {
    const map: Record<string, string> = {
      receipts: 'receipt',
      invoices: 'invoice',
      contracts: 'contract',
      statements: 'statementOfWork',
      estimates: 'estimate',
      change_orders: 'changeOrder',
      reports: 'report',
    };
    return map[folder] || 'receipt';
  }

  private guessContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[ext] || 'application/octet-stream';
  }

  private createEmptyProgress(tenantId: string): MigrationProgress {
    return {
      tenantId,
      status: 'pending',
      totalFiles: 0,
      migratedFiles: 0,
      failedFiles: 0,
      errors: [],
      startedAt: null,
      completedAt: null,
    };
  }
}

export const speMigrationService = new SpeMigrationService();
