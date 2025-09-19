import { msalInstance, clientCredentialsRequest } from '../auth/entra-config.js';

// SharePoint Embedded container interfaces
export interface FileStorageContainer {
  id: string;
  displayName: string;
  description?: string;
  containerTypeId: string;
  createdDateTime: string;
  drive?: {
    id: string;
    webUrl: string;
  };
  status: 'active' | 'inactive';
  viewpoint?: {
    effectiveRole: string;
  };
}

export interface ContainerPermission {
  id: string;
  roles: string[];
  grantedToV2?: {
    user?: {
      id: string;
      displayName: string;
    };
    application?: {
      id: string;
      displayName: string;
    };
  };
}

export interface ContainerType {
  id: string;
  displayName: string;
  description?: string;
  isBuiltIn: boolean;
  applicationId?: string;
}

// TypeScript interfaces for Microsoft Graph API responses
export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl?: string;
  downloadUrl?: string;
  file?: {
    mimeType: string;
    hashes?: {
      sha1Hash?: string;
      sha256Hash?: string;
    };
  };
  folder?: {
    childCount: number;
  };
  parentReference?: {
    driveId: string;
    id: string;
    path: string;
  };
  '@microsoft.graph.downloadUrl'?: string;
}

export interface GraphError {
  code: string;
  message: string;
  innerError?: {
    code?: string;
    message?: string;
    'request-id'?: string;
    date?: string;
  };
}

export interface GraphErrorResponse {
  error: GraphError;
}

export interface GraphResponse<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

// Main GraphClient class for SharePoint Embedded operations
export class GraphClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
  
  // Cache for container information to reduce API calls
  private containerCache = new Map<string, FileStorageContainer>();
  private cacheExpiry = new Map<string, number>();
  private readonly cacheLifetime = 5 * 60 * 1000; // 5 minutes

  constructor() {
    if (!msalInstance) {
      console.warn('[GraphClient] MSAL instance not configured. Please check Azure AD environment variables.');
    }
  }

  /**
   * Get container from cache or fetch from API
   */
  private async getCachedContainer(containerId: string): Promise<FileStorageContainer | null> {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(containerId);
    
    if (expiry && now < expiry && this.containerCache.has(containerId)) {
      return this.containerCache.get(containerId)!;
    }
    
    try {
      const container = await this.getFileStorageContainer(containerId);
      this.containerCache.set(containerId, container);
      this.cacheExpiry.set(containerId, now + this.cacheLifetime);
      return container;
    } catch (error) {
      console.warn(`[GraphClient] Failed to fetch container ${containerId}:`, error);
      return null;
    }
  }

  /**
   * Clear container cache
   */
  private clearContainerCache(): void {
    this.containerCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Authenticate and get an access token for Microsoft Graph
   */
  async authenticate(): Promise<string> {
    const now = Date.now();
    
    // Check if we have a valid token (with 5-minute buffer)
    if (this.accessToken && now < (this.tokenExpiry - 300000)) {
      return this.accessToken;
    }

    if (!msalInstance) {
      throw new Error('MSAL instance not configured. Please check Azure AD environment variables.');
    }

    try {
      const response = await msalInstance.acquireTokenByClientCredential(clientCredentialsRequest);
      
      if (!response) {
        throw new Error('Failed to acquire access token - no response received');
      }
      
      this.accessToken = response.accessToken;
      this.tokenExpiry = response.expiresOn?.getTime() || 0;
      
      console.log('[GraphClient] Successfully authenticated with Microsoft Graph');
      return this.accessToken;
    } catch (error) {
      console.error('[GraphClient] Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Make authenticated HTTP request to Microsoft Graph
   */
  private async makeGraphRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<T> {
    const token = await this.authenticate();
    const url = endpoint.startsWith('http') ? endpoint : `${this.graphBaseUrl}${endpoint}`;
    
    const defaultHeaders: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers
    };

    const requestOptions: RequestInit = {
      method,
      headers: defaultHeaders,
    };

    if (body && method !== 'GET') {
      if (body instanceof Buffer || body instanceof ArrayBuffer) {
        requestOptions.body = body;
        delete defaultHeaders['Content-Type']; // Let browser set it for binary data
      } else {
        requestOptions.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText) as GraphErrorResponse;
        if (errorData.error) {
          errorMessage = `${errorData.error.code}: ${errorData.error.message}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      
      const error = new Error(errorMessage) as any;
      error.status = response.status;
      error.response = { status: response.status, headers: response.headers };
      throw error;
    }

    if (response.status === 204) {
      return {} as T; // No content
    }

    const responseText = await response.text();
    if (!responseText) {
      return {} as T;
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      return responseText as unknown as T;
    }
  }

  /**
   * Retry mechanism for handling transient failures
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        const delay = this.calculateDelay(retryCount, error);
        console.warn(`[GraphClient] ${operationName} failed (attempt ${retryCount + 1}/${this.maxRetries}). Retrying in ${delay}ms...`, error.message);
        
        await this.sleep(delay);
        return this.withRetry(operation, operationName, retryCount + 1);
      }
      
      console.error(`[GraphClient] ${operationName} failed after ${retryCount + 1} attempts:`, error);
      throw this.normalizeError(error);
    }
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetry(error: any, retryCount: number): boolean {
    if (retryCount >= this.maxRetries) {
      return false;
    }

    // Check for rate limiting (429) or server errors (5xx)
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
      return true;
    }

    // Check for network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private calculateDelay(retryCount: number, error: any): number {
    // If it's a rate limit error, use Retry-After header if available
    if (error.status === 429) {
      const retryAfter = error.response?.headers?.get?.('retry-after');
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000; // Convert to milliseconds
      }
    }

    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Normalize errors for consistent error handling
   */
  private normalizeError(error: any): Error {
    if (error.message?.includes('Graph API Error:')) {
      return error;
    }
    
    if (error.status && error.message) {
      return new Error(`Graph API Error: ${error.status} - ${error.message}`);
    }
    
    return new Error(`Graph Client Error: ${error.message || 'Unknown error'}`);
  }

  // ============ SHAREPOINT EMBEDDED CONTAINER OPERATIONS ============

  /**
   * List all file storage containers accessible to the application
   */
  async listFileStorageContainers(): Promise<FileStorageContainer[]> {
    return this.withRetry(async () => {
      const response = await this.makeGraphRequest<GraphResponse<FileStorageContainer>>(
        'GET',
        '/storage/fileStorage/containers'
      );
      return response.value || [];
    }, 'listFileStorageContainers');
  }

  /**
   * Get a specific file storage container
   */
  async getFileStorageContainer(containerId: string): Promise<FileStorageContainer> {
    return this.withRetry(async () => {
      return await this.makeGraphRequest<FileStorageContainer>(
        'GET',
        `/storage/fileStorage/containers/${containerId}`
      );
    }, `getFileStorageContainer(${containerId})`);
  }

  /**
   * Create a new file storage container (for multitenant support)
   */
  async createFileStorageContainer(
    displayName: string,
    containerTypeId: string,
    description?: string
  ): Promise<FileStorageContainer> {
    return this.withRetry(async () => {
      return await this.makeGraphRequest<FileStorageContainer>(
        'POST',
        '/storage/fileStorage/containers',
        {
          displayName,
          description,
          containerTypeId
        }
      );
    }, `createFileStorageContainer(${displayName})`);
  }

  /**
   * Validate and normalize folder path to prevent path traversal attacks
   * When expenseId is provided, ignore arbitrary folderPath and use canonical structure
   */
  private validateAndNormalizeFolderPath(folderPath: string, projectCode?: string, expenseId?: string): string {
    // If expenseId is provided, ALWAYS use canonical path regardless of folderPath input
    if (expenseId) {
      const year = new Date().getFullYear();
      const sanitizedProjectCode = this.sanitizePathSegment(projectCode || 'unknown');
      const sanitizedExpenseId = this.sanitizePathSegment(expenseId);
      return `/Receipts/${year}/${sanitizedProjectCode}/${sanitizedExpenseId}`;
    }

    // Security validation for arbitrary folder paths
    if (!folderPath || typeof folderPath !== 'string') {
      throw new Error('Invalid folder path: path must be a non-empty string');
    }

    // Remove any leading/trailing whitespace
    folderPath = folderPath.trim();

    // Check for path traversal attempts
    if (folderPath.includes('..')) {
      throw new Error('Invalid folder path: path traversal attempts are not allowed');
    }

    // Check for invalid characters that could cause issues
    const invalidChars = /[\\:*?"<>|\x00-\x1f]/;
    if (invalidChars.test(folderPath)) {
      throw new Error('Invalid folder path: contains invalid characters');
    }

    // Normalize path separators and remove duplicates
    folderPath = folderPath.replace(/\/+/g, '/');

    // Remove leading slash for processing
    let normalizedPath = folderPath.startsWith('/') ? folderPath.slice(1) : folderPath;
    
    // Split path into segments and validate each
    const segments = normalizedPath.split('/').filter(segment => segment.length > 0);
    
    // Validate and sanitize each segment
    const sanitizedSegments = segments.map(segment => {
      // Check for dangerous segments
      if (segment === '.' || segment === '..' || segment.trim() === '') {
        throw new Error(`Invalid folder path segment: '${segment}' is not allowed`);
      }
      
      return this.sanitizePathSegment(segment);
    });

    // Ensure path starts with /Receipts/
    if (sanitizedSegments.length === 0 || sanitizedSegments[0] !== 'Receipts') {
      sanitizedSegments.unshift('Receipts');
    }

    return '/' + sanitizedSegments.join('/');
  }

  /**
   * Sanitize a single path segment to remove dangerous characters
   */
  private sanitizePathSegment(segment: string): string {
    if (!segment || typeof segment !== 'string') {
      throw new Error('Invalid path segment: must be a non-empty string');
    }

    // Trim whitespace
    segment = segment.trim();
    
    if (segment.length === 0) {
      throw new Error('Invalid path segment: cannot be empty after trimming');
    }

    // Remove or replace invalid characters
    // Allow alphanumeric, hyphens, underscores, spaces, and dots (but not .. sequence)
    segment = segment.replace(/[^a-zA-Z0-9\-_\s\.]/g, '_');
    
    // Ensure no .. sequences remain after replacement
    if (segment.includes('..')) {
      segment = segment.replace(/\.\./g, '_');
    }

    // Limit segment length to prevent issues
    if (segment.length > 255) {
      segment = segment.substring(0, 255);
    }

    return segment;
  }

  /**
   * Validate and sanitize file name
   */
  private validateAndSanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid file name: must be a non-empty string');
    }

    // Trim whitespace
    fileName = fileName.trim();
    
    if (fileName.length === 0) {
      throw new Error('Invalid file name: cannot be empty after trimming');
    }

    // Check for path traversal attempts
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Invalid file name: cannot contain path separators or traversal attempts');
    }

    // Check for invalid characters
    const invalidChars = /[\\\/:*?"<>|\x00-\x1f]/;
    if (invalidChars.test(fileName)) {
      throw new Error('Invalid file name: contains invalid characters');
    }

    // Check for reserved Windows names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
    if (reservedNames.test(fileName)) {
      throw new Error('Invalid file name: cannot use reserved system names');
    }

    // Limit file name length
    if (fileName.length > 255) {
      // Keep extension if possible
      const lastDotIndex = fileName.lastIndexOf('.');
      if (lastDotIndex > 0 && lastDotIndex > fileName.length - 20) {
        const extension = fileName.substring(lastDotIndex);
        const baseName = fileName.substring(0, lastDotIndex);
        fileName = baseName.substring(0, 255 - extension.length) + extension;
      } else {
        fileName = fileName.substring(0, 255);
      }
    }

    return fileName;
  }

  /**
   * Validate file size and MIME type
   */
  private validateFileProperties(fileBuffer: Buffer, fileName: string): void {
    // File size validation (max 100MB)
    const maxFileSize = 100 * 1024 * 1024; // 100MB
    if (fileBuffer.length > maxFileSize) {
      throw new Error(`File too large: maximum size is ${maxFileSize / (1024 * 1024)}MB`);
    }

    if (fileBuffer.length === 0) {
      throw new Error('Invalid file: file cannot be empty');
    }

    // Basic file extension validation
    const allowedExtensions = [
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg',
      // Documents
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf',
      // Archives
      '.zip', '.rar', '.7z', '.tar', '.gz',
      // Other common types
      '.csv', '.json', '.xml', '.log'
    ];

    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    if (extension && !allowedExtensions.includes(extension)) {
      throw new Error(`File type not allowed: ${extension} files are not permitted`);
    }
  }

  /**
   * Upload a file to SharePoint Embedded container with security validation
   * Maintains backward compatibility by accepting legacy parameters
   */
  async uploadFile(
    siteIdOrContainerId: string, // For backward compatibility, this can be either siteId (ignored) or containerId
    driveIdOrContainerId: string, // This will be the containerId in new usage, driveId for backward compatibility
    folderPath: string,
    fileName: string,
    fileBuffer: Buffer,
    projectCode?: string,
    expenseId?: string
  ): Promise<DriveItem> {
    // For SharePoint Embedded, use the second parameter as containerId
    const containerId = driveIdOrContainerId;
    // Validate and sanitize inputs
    const sanitizedFileName = this.validateAndSanitizeFileName(fileName);
    this.validateFileProperties(fileBuffer, sanitizedFileName);
    const normalizedFolderPath = this.validateAndNormalizeFolderPath(folderPath, projectCode, expenseId);
    
    return this.withRetry(async () => {
      // First, ensure the folder structure exists
      await this.ensureFolderExists(containerId, normalizedFolderPath);
      
      // Construct the upload path
      const uploadPath = `${normalizedFolderPath}/${sanitizedFileName}`.replace(/\/+/g, '/');
      
      // For large files (>4MB), use resumable upload
      if (fileBuffer.length > 4 * 1024 * 1024) {
        return this.uploadLargeFileWithRetry(containerId, uploadPath, fileBuffer);
      }
      
      // For small files, use simple upload with container endpoint
      return await this.makeGraphRequest<DriveItem>(
        'PUT',
        `/storage/fileStorage/containers/${containerId}/drive/root:${uploadPath}:/content`,
        fileBuffer,
        { 'Content-Type': 'application/octet-stream' }
      );
    }, `uploadFile(${sanitizedFileName})`);
  }

  /**
   * Upload large file using resumable upload with proper retry logic
   */
  private async uploadLargeFileWithRetry(containerId: string, uploadPath: string, fileBuffer: Buffer): Promise<DriveItem> {
    // Create upload session with container endpoint
    const uploadSession = await this.makeGraphRequest<{uploadUrl: string}>(
      'POST',
      `/storage/fileStorage/containers/${containerId}/drive/root:${uploadPath}:/createUploadSession`,
      {
        item: {
          '@microsoft.graph.conflictBehavior': 'replace'
        }
      }
    );

    const uploadUrl = uploadSession.uploadUrl;
    // Use larger chunk size for better efficiency (5MB - within Graph API limits)
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    let start = 0;

    while (start < fileBuffer.length) {
      const end = Math.min(start + chunkSize, fileBuffer.length);
      const chunk = fileBuffer.slice(start, end);
      
      // Retry individual chunk uploads with exponential backoff
      const result = await this.uploadChunkWithRetry(
        uploadUrl,
        chunk,
        start,
        end - 1,
        fileBuffer.length,
        `chunk ${start}-${end - 1}`
      );

      if (result.completed) {
        return result.driveItem!;
      }

      start = end;
    }

    throw new Error('Upload completed but no final response received');
  }

  /**
   * Upload a single chunk with retry logic for resumable uploads
   */
  private async uploadChunkWithRetry(
    uploadUrl: string,
    chunk: Buffer,
    start: number,
    end: number,
    totalSize: number,
    operationName: string,
    retryCount = 0
  ): Promise<{ completed: boolean; driveItem?: DriveItem }> {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': chunk.length.toString(),
        },
        body: chunk,
      });

      if (response.status === 200 || response.status === 201) {
        // Upload completed
        const driveItem = await response.json() as DriveItem;
        return { completed: true, driveItem };
      } else if (response.status === 202) {
        // Chunk accepted, continue
        return { completed: false };
      } else {
        // Handle errors
        const errorText = await response.text();
        const error = new Error(`Upload chunk failed with status ${response.status}: ${errorText}`) as any;
        error.status = response.status;
        error.response = { status: response.status, headers: response.headers };
        throw error;
      }
    } catch (error: any) {
      // Check if we should retry this chunk
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        const delay = this.calculateDelay(retryCount, error);
        console.warn(`[GraphClient] ${operationName} failed (attempt ${retryCount + 1}/${this.maxRetries}). Retrying in ${delay}ms...`, error.message);
        
        await this.sleep(delay);
        return this.uploadChunkWithRetry(uploadUrl, chunk, start, end, totalSize, operationName, retryCount + 1);
      }
      
      console.error(`[GraphClient] ${operationName} failed after ${retryCount + 1} attempts:`, error);
      throw this.normalizeError(error);
    }
  }

  /**
   * Ensure folder structure exists, creating folders as needed with sanitized names
   */
  private async ensureFolderExists(containerId: string, folderPath: string): Promise<void> {
    const pathParts = folderPath.split('/').filter(part => part.length > 0);
    let currentPath = '';

    for (const part of pathParts) {
      // Sanitize the folder name before creating
      const sanitizedPart = this.sanitizePathSegment(part);
      currentPath += `/${sanitizedPart}`;
      
      try {
        // Check if folder exists using container endpoint
        await this.makeGraphRequest<DriveItem>('GET', `/storage/fileStorage/containers/${containerId}/drive/root:${currentPath}`);
      } catch (error: any) {
        if (error.status === 404) {
          // Folder doesn't exist, create it
          const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
          const parentPathForApi = parentPath === '/' ? '' : `:${parentPath}:`;
          
          await this.makeGraphRequest<DriveItem>(
            'POST',
            `/storage/fileStorage/containers/${containerId}/drive/root${parentPathForApi}/children`,
            {
              name: sanitizedPart,
              folder: {},
              '@microsoft.graph.conflictBehavior': 'fail'
            }
          );
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Download a file from SharePoint Embedded container with proper validation and metadata
   * Maintains backward compatibility by accepting driveId parameter but uses containerId internally
   */
  async downloadFile(driveIdOrContainerId: string, itemId: string): Promise<{ 
    buffer: Buffer; 
    fileName: string; 
    mimeType: string; 
    size: number 
  }> {
    // For SharePoint Embedded, use the first parameter as containerId
    const containerId = driveIdOrContainerId;
    
    // Validate itemId
    if (!itemId || typeof itemId !== 'string' || itemId.trim().length === 0) {
      throw new Error('Invalid item ID: must be a non-empty string');
    }

    return this.withRetry(async () => {
      // Get the file metadata first using container endpoint
      const driveItem = await this.makeGraphRequest<DriveItem>('GET', `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}`);
      
      // Validate it's actually a file
      if (!driveItem.file) {
        throw new Error('Item is not a file');
      }

      // Sanitize the file name for safe handling
      const sanitizedFileName = this.sanitizeFileNameForDownload(driveItem.name);
      
      const downloadUrl = driveItem['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) {
        throw new Error('No download URL available for this file');
      }
      
      // Download the file content
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Validate file size matches expected
      if (driveItem.size && buffer.length !== driveItem.size) {
        console.warn(`File size mismatch: expected ${driveItem.size}, got ${buffer.length}`);
      }
      
      return {
        buffer,
        fileName: sanitizedFileName,
        mimeType: driveItem.file.mimeType || 'application/octet-stream',
        size: buffer.length
      };
    }, `downloadFile(${itemId})`);
  }

  /**
   * Sanitize file name for safe download (less restrictive than upload)
   */
  private sanitizeFileNameForDownload(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      return 'download';
    }

    // Remove dangerous characters but preserve most of the original name
    let sanitized = fileName.replace(/[\x00-\x1f\x7f-\x9f"<>|:*?\\]/g, '_');
    
    // Ensure it's not empty
    if (sanitized.trim().length === 0) {
      sanitized = 'download';
    }
    
    // Limit length
    if (sanitized.length > 255) {
      const lastDotIndex = sanitized.lastIndexOf('.');
      if (lastDotIndex > 0 && lastDotIndex > sanitized.length - 20) {
        const extension = sanitized.substring(lastDotIndex);
        const baseName = sanitized.substring(0, lastDotIndex);
        sanitized = baseName.substring(0, 255 - extension.length) + extension;
      } else {
        sanitized = sanitized.substring(0, 255);
      }
    }
    
    return sanitized;
  }

  /**
   * Delete a file from SharePoint Embedded container
   * Maintains backward compatibility by accepting driveId parameter but uses containerId internally
   */
  async deleteFile(driveIdOrContainerId: string, itemId: string): Promise<void> {
    // For SharePoint Embedded, use the first parameter as containerId
    const containerId = driveIdOrContainerId;
    
    return this.withRetry(async () => {
      await this.makeGraphRequest<void>('DELETE', `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}`);
    }, `deleteFile(${itemId})`);
  }

  /**
   * Create a folder in SharePoint Embedded container
   * Maintains backward compatibility by accepting driveId parameter but uses containerId internally
   */
  async createFolder(driveIdOrContainerId: string, parentPath: string, folderName: string): Promise<DriveItem> {
    // For SharePoint Embedded, use the first parameter as containerId
    const containerId = driveIdOrContainerId;
    
    return this.withRetry(async () => {
      const parentPathForApi = parentPath === '/' ? '' : `:${parentPath}:`;
      
      return await this.makeGraphRequest<DriveItem>(
        'POST',
        `/storage/fileStorage/containers/${containerId}/drive/root${parentPathForApi}/children`,
        {
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        }
      );
    }, `createFolder(${folderName})`);
  }

  /**
   * List files in a folder in SharePoint Embedded container
   * Maintains backward compatibility by accepting driveId parameter but uses containerId internally
   */
  async listFiles(driveIdOrContainerId: string, folderPath: string = '/'): Promise<DriveItem[]> {
    // For SharePoint Embedded, use the first parameter as containerId
    const containerId = driveIdOrContainerId;
    
    return this.withRetry(async () => {
      const pathForApi = folderPath === '/' ? '' : `:${folderPath}:`;
      
      const response = await this.makeGraphRequest<GraphResponse<DriveItem>>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/drive/root${pathForApi}/children`
      );
      
      return response.value || [];
    }, `listFiles(${folderPath})`);
  }

  /**
   * Get file/folder information from SharePoint Embedded container
   * Maintains backward compatibility by accepting driveId parameter but uses containerId internally
   */
  async getItem(driveIdOrContainerId: string, itemId: string): Promise<DriveItem> {
    // For SharePoint Embedded, use the first parameter as containerId
    const containerId = driveIdOrContainerId;
    
    return this.withRetry(async () => {
      return await this.makeGraphRequest<DriveItem>('GET', `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}`);
    }, `getItem(${itemId})`);
  }

  /**
   * Test connectivity to SharePoint Embedded containers
   * Maintains backward compatibility but tests container access instead of site/drive access
   */
  async testConnectivity(siteIdOrContainerId?: string, driveIdOrContainerId?: string): Promise<{ 
    authenticated: boolean; 
    siteAccessible: boolean; 
    driveAccessible: boolean; 
    containerAccessible?: boolean;
    error?: string 
  }> {
    try {
      // Test authentication
      await this.authenticate();
      
      const result = {
        authenticated: true,
        siteAccessible: true, // For backward compatibility, set to true since we don't use sites anymore
        driveAccessible: false,
        containerAccessible: false,
        error: undefined as string | undefined
      };

      // Test container access - use second parameter as containerId for compatibility
      const containerId = driveIdOrContainerId || siteIdOrContainerId;
      
      if (containerId) {
        try {
          // Test container access
          await this.makeGraphRequest<FileStorageContainer>('GET', `/storage/fileStorage/containers/${containerId}`);
          result.driveAccessible = true; // For backward compatibility
          result.containerAccessible = true;
        } catch (error) {
          result.error = `Container access failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      } else {
        // If no container ID provided, test that we can list containers
        try {
          await this.listFileStorageContainers();
          result.driveAccessible = true; // For backward compatibility
          result.containerAccessible = true;
        } catch (error) {
          result.error = `Container listing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }

      return result;
    } catch (error) {
      return {
        authenticated: false,
        siteAccessible: false,
        driveAccessible: false,
        containerAccessible: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const graphClient = new GraphClient();