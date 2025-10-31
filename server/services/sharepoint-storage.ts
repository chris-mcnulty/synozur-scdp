import { getUncachableSharePointClient } from './sharepoint-client.js';
import { Readable } from 'stream';
import type { IStorage } from '../storage.js';

export type FileType = 'receipts' | 'invoices' | 'sows' | 'changeorders';

interface SharePointConfig {
  siteUrl: string;
  libraryName: string;
}

/**
 * SharePoint Storage Service
 * Manages document storage in SharePoint with automatic folder organization
 */
export class SharePointStorageService {
  private storage: IStorage | null = null;
  private driveCache: Map<string, string> = new Map(); // Cache drive IDs per config key

  constructor() {}

  /**
   * Set the storage instance for database access
   */
  setStorage(storage: IStorage): void {
    this.storage = storage;
  }

  /**
   * Parse SharePoint site URL to extract hostname and server-relative path
   * Supports root sites, sites collection, and multi-level paths
   */
  private parseSiteUrl(siteUrl: string): { hostname: string; serverRelativePath: string } {
    try {
      const url = new URL(siteUrl);
      const hostname = url.hostname;
      let serverRelativePath = url.pathname;
      
      // Remove trailing slashes
      if (serverRelativePath.endsWith('/')) {
        serverRelativePath = serverRelativePath.slice(0, -1);
      }
      
      // Root site case: empty path or just /
      if (!serverRelativePath || serverRelativePath === '/') {
        serverRelativePath = '/';
      }
      
      return { hostname, serverRelativePath };
    } catch (error) {
      throw new Error(`Invalid SharePoint site URL: ${siteUrl}. Must be a valid HTTPS URL.`);
    }
  }

  /**
   * Build the Graph API path for accessing a site
   */
  private getSiteApiPath(siteUrl: string): string {
    const { hostname, serverRelativePath } = this.parseSiteUrl(siteUrl);
    
    // For root site collection (no trailing colon/slash to avoid malformed paths like /sites/host://drives)
    if (serverRelativePath === '/') {
      return `/sites/${hostname}`;
    }
    
    // For sites collection or deeper paths
    return `/sites/${hostname}:${serverRelativePath}`;
  }

  /**
   * Get SharePoint configuration from system settings or environment defaults
   */
  private async getConfig(): Promise<SharePointConfig> {
    const isDevelopment = !process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === 'development';
    
    // Default fallback values
    const defaultSiteUrl = 'https://synozur.sharepoint.com/sites/RevOps/';
    const defaultLibraryDev = 'SCDP-Dev';
    const defaultLibraryProd = 'SCDP-Prod';

    // Try to get from system settings if storage is available
    if (this.storage) {
      try {
        const siteUrl = isDevelopment
          ? await this.storage.getSystemSettingValue('SHAREPOINT_SITE_URL_DEV', defaultSiteUrl)
          : await this.storage.getSystemSettingValue('SHAREPOINT_SITE_URL_PROD', defaultSiteUrl);
        
        const libraryName = isDevelopment
          ? await this.storage.getSystemSettingValue('SHAREPOINT_LIBRARY_DEV', defaultLibraryDev)
          : await this.storage.getSystemSettingValue('SHAREPOINT_LIBRARY_PROD', defaultLibraryProd);

        return { siteUrl, libraryName };
      } catch (error) {
        console.warn('Failed to get SharePoint settings from database, using defaults:', error);
      }
    }

    // Fallback to defaults
    return {
      siteUrl: defaultSiteUrl,
      libraryName: isDevelopment ? defaultLibraryDev : defaultLibraryProd
    };
  }

  /**
   * Get or resolve the drive ID for the configured library
   * Caches the result to avoid repeated API calls
   */
  private async getDriveId(config: SharePointConfig): Promise<string> {
    const cacheKey = `${config.siteUrl}:${config.libraryName}`;
    
    // Return cached drive ID if available
    if (this.driveCache.has(cacheKey)) {
      return this.driveCache.get(cacheKey)!;
    }

    const client = await getUncachableSharePointClient();
    const siteApiPath = this.getSiteApiPath(config.siteUrl);

    try {
      const drives = await client.api(`${siteApiPath}/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found at ${config.siteUrl}. Available libraries: ${drives.value.map((d: any) => d.name).join(', ')}`);
      }

      // Cache the drive ID
      this.driveCache.set(cacheKey, drive.id);
      return drive.id;
    } catch (error) {
      console.error(`Error resolving drive ID for ${config.libraryName}:`, error);
      throw error;
    }
  }

  /**
   * Ensure a folder exists in the document library, create if needed
   */
  private async ensureFolder(folderName: string): Promise<void> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    try {
      // Check if folder exists
      try {
        await client.api(`/drives/${driveId}/root:/${folderName}`).get();
      } catch (err: any) {
        // Folder doesn't exist, create it
        if (err.statusCode === 404) {
          await client
            .api(`/drives/${driveId}/root/children`)
            .post({
              name: folderName,
              folder: {}
              // Removed '@microsoft.graph.conflictBehavior': 'rename' to make it idempotent
            });
        } else {
          throw err;
        }
      }
    } catch (error) {
      console.error(`Error ensuring folder ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Upload a file to SharePoint
   */
  async uploadFile(
    fileType: FileType,
    fileName: string,
    fileBuffer: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<string> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    // Ensure the folder exists
    await this.ensureFolder(fileType);

    try {
      // Upload the file
      const filePath = `${fileType}/${fileName}`;
      const uploadResult = await client
        .api(`/drives/${driveId}/root:/${filePath}:/content`)
        .putStream(Readable.from(fileBuffer));

      // Return the SharePoint URL
      return uploadResult.webUrl;
    } catch (error) {
      console.error(`Error uploading file to SharePoint:`, error);
      throw error;
    }
  }

  /**
   * Download a file from SharePoint
   */
  async downloadFile(fileType: FileType, fileName: string): Promise<Buffer> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    try {
      const filePath = `${fileType}/${fileName}`;
      const downloadUrl = await client
        .api(`/drives/${driveId}/root:/${filePath}`)
        .get()
        .then((file: any) => file['@microsoft.graph.downloadUrl']);

      // Download the file content
      const response = await fetch(downloadUrl);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`Error downloading file from SharePoint:`, error);
      throw error;
    }
  }

  /**
   * Delete a file from SharePoint
   */
  async deleteFile(fileType: FileType, fileName: string): Promise<void> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    try {
      const filePath = `${fileType}/${fileName}`;
      await client.api(`/drives/${driveId}/root:/${filePath}`).delete();
    } catch (error) {
      console.error(`Error deleting file from SharePoint:`, error);
      throw error;
    }
  }

  /**
   * Get file URL without downloading
   */
  async getFileUrl(fileType: FileType, fileName: string): Promise<string> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    try {
      const filePath = `${fileType}/${fileName}`;
      const file = await client.api(`/drives/${driveId}/root:/${filePath}`).get();
      return file.webUrl;
    } catch (error) {
      console.error(`Error getting file URL from SharePoint:`, error);
      throw error;
    }
  }

  /**
   * List all files in a folder
   */
  async listFiles(fileType: FileType): Promise<Array<{ name: string; url: string; size: number; modifiedAt: string }>> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const driveId = await this.getDriveId(config);

    try {
      const folderContents = await client
        .api(`/drives/${driveId}/root:/${fileType}:/children`)
        .get();

      return folderContents.value.map((file: any) => ({
        name: file.name,
        url: file.webUrl,
        size: file.size,
        modifiedAt: file.lastModifiedDateTime
      }));
    } catch (error: any) {
      // If folder doesn't exist, return empty array
      if (error.statusCode === 404) {
        return [];
      }
      console.error(`Error listing files from SharePoint:`, error);
      throw error;
    }
  }
}

// Export singleton instance - will be initialized with storage after import
export const sharepointStorage = new SharePointStorageService();

// Initialize with storage instance after export (called from routes.ts)
export function initSharePointStorage(storage: IStorage): void {
  sharepointStorage.setStorage(storage);
}
