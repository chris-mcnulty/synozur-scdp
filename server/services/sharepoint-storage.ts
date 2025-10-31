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

  constructor() {}

  /**
   * Set the storage instance for database access
   */
  setStorage(storage: IStorage): void {
    this.storage = storage;
  }

  private getSiteId(siteUrl: string): string {
    // Extract site name from URL like https://synozur.sharepoint.com/sites/RevOps/
    const match = siteUrl.match(/sharepoint\.com\/sites\/([^\/]+)/);
    if (!match) {
      throw new Error(`Invalid SharePoint site URL: ${siteUrl}`);
    }
    return match[1];
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
   * Ensure a folder exists in the document library, create if needed
   */
  private async ensureFolder(folderName: string): Promise<void> {
    const config = await this.getConfig();
    const client = await getUncachableSharePointClient();
    const siteName = this.getSiteId(config.siteUrl);

    try {
      // Try to get the folder first
      await client
        .api(`/sites/root:/sites/${siteName}:/drives`)
        .get()
        .then(async (drives: any) => {
          const drive = drives.value.find((d: any) => d.name === config.libraryName);
          if (!drive) {
            throw new Error(`Document library '${config.libraryName}' not found`);
          }

          // Check if folder exists
          try {
            await client.api(`/drives/${drive.id}/root:/${folderName}`).get();
          } catch (err: any) {
            // Folder doesn't exist, create it
            if (err.statusCode === 404) {
              await client
                .api(`/drives/${drive.id}/root/children`)
                .post({
                  name: folderName,
                  folder: {},
                  '@microsoft.graph.conflictBehavior': 'rename'
                });
            } else {
              throw err;
            }
          }
        });
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
    const siteName = this.getSiteId(config.siteUrl);

    // Ensure the folder exists
    await this.ensureFolder(fileType);

    try {
      // Get the drive ID
      const drives = await client.api(`/sites/root:/sites/${siteName}:/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found`);
      }

      // Upload the file
      const filePath = `${fileType}/${fileName}`;
      const uploadResult = await client
        .api(`/drives/${drive.id}/root:/${filePath}:/content`)
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
    const siteName = this.getSiteId(config.siteUrl);

    try {
      const drives = await client.api(`/sites/root:/sites/${siteName}:/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found`);
      }

      const filePath = `${fileType}/${fileName}`;
      const downloadUrl = await client
        .api(`/drives/${drive.id}/root:/${filePath}`)
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
    const siteName = this.getSiteId(config.siteUrl);

    try {
      const drives = await client.api(`/sites/root:/sites/${siteName}:/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found`);
      }

      const filePath = `${fileType}/${fileName}`;
      await client.api(`/drives/${drive.id}/root:/${filePath}`).delete();
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
    const siteName = this.getSiteId(config.siteUrl);

    try {
      const drives = await client.api(`/sites/root:/sites/${siteName}:/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found`);
      }

      const filePath = `${fileType}/${fileName}`;
      const file = await client.api(`/drives/${drive.id}/root:/${filePath}`).get();
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
    const siteName = this.getSiteId(config.siteUrl);

    try {
      const drives = await client.api(`/sites/root:/sites/${siteName}:/drives`).get();
      const drive = drives.value.find((d: any) => d.name === config.libraryName);
      
      if (!drive) {
        throw new Error(`Document library '${config.libraryName}' not found`);
      }

      const folderContents = await client
        .api(`/drives/${drive.id}/root:/${fileType}:/children`)
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
