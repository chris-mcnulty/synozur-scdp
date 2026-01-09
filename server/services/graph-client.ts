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

// Container metadata column interfaces
export interface ColumnDefinition {
  id?: string;
  name: string;
  displayName: string;
  description?: string;
  columnType: 'text' | 'choice' | 'dateTime' | 'number' | 'currency' | 'boolean' | 'personOrGroup' | 'hyperlinkOrPicture';
  required?: boolean;
  indexed?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  enforceUniqueValues?: boolean;
  // Type-specific configurations
  text?: {
    allowMultipleLines?: boolean;
    appendChangesToExistingText?: boolean;
    linesForEditing?: number;
    maxLength?: number;
  };
  choice?: {
    choices: string[];
    allowFillInChoice?: boolean;
    displayAs?: 'dropDownMenu' | 'radioButtons' | 'checkboxes';
  };
  dateTime?: {
    displayAs?: 'DateTime' | 'DateOnly';
    includeTime?: boolean;
    dateTimeFormat?: string;
  };
  number?: {
    decimalPlaces?: number;
    minimum?: number;
    maximum?: number;
    showAsPercentage?: boolean;
  };
  currency?: {
    lcid?: number; // Locale identifier (e.g., 1033 for US English)
    currencySymbol?: string;
  };
  boolean?: {
    // Currently no specific options for boolean columns
  };
  personOrGroup?: {
    allowMultipleSelection?: boolean;
    chooseFromType?: 'peopleOnly' | 'peopleAndGroups';
  };
  hyperlinkOrPicture?: {
    isPicture?: boolean;
  };
}

export interface DocumentMetadata {
  [key: string]: string | number | boolean | Date | string[] | null;
}

export interface DocumentListItem {
  id: string;
  fields: DocumentMetadata;
}

export interface DriveItemWithMetadata extends DriveItem {
  listItem?: DocumentListItem;
}

export interface MetadataQueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'startsWith' | 'substringof';
  value: string | number | boolean | Date;
}

export interface MetadataQueryOptions {
  filters?: MetadataQueryFilter[];
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  top?: number;
  skip?: number;
  expand?: string[];
  select?: string[];
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

// Circuit breaker state for preventing cascading failures
interface CircuitBreakerState {
  failures: number;
  lastFailure: number | null;
  state: 'closed' | 'open' | 'half-open';
  lastStateChange: number;
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
  
  // Circuit breaker for preventing cascading failures
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: 'closed',
    lastStateChange: Date.now()
  };
  private readonly circuitBreakerThreshold = 5; // Open after 5 failures
  private readonly circuitBreakerResetTimeout = 60000; // 60 seconds to half-open
  private readonly circuitBreakerTestTimeout = 30000; // 30 seconds in half-open before closing
  
  // Lock for thread-safe circuit breaker state modifications
  private circuitBreakerLock: Promise<void> = Promise.resolve();

  constructor() {
    if (!msalInstance) {
      console.warn('[GraphClient] MSAL instance not configured. Please check Azure AD environment variables.');
    }
  }
  
  /**
   * Get circuit breaker status for health monitoring
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      lastFailure: this.circuitBreaker.lastFailure 
        ? new Date(this.circuitBreaker.lastFailure).toISOString() 
        : null,
      lastStateChange: new Date(this.circuitBreaker.lastStateChange).toISOString()
    };
  }
  
  /**
   * Check and update circuit breaker state (thread-safe)
   */
  private async checkCircuitBreaker(): Promise<void> {
    // Acquire lock to prevent concurrent state modifications
    this.circuitBreakerLock = this.circuitBreakerLock.then(() => {
      const now = Date.now();
      
      if (this.circuitBreaker.state === 'open') {
        // Check if we should transition to half-open
        if (now - this.circuitBreaker.lastStateChange >= this.circuitBreakerResetTimeout) {
          this.circuitBreaker.state = 'half-open';
          this.circuitBreaker.lastStateChange = now;
          console.log('[GraphClient] Circuit breaker transitioning to half-open');
        }
      }
    });
    await this.circuitBreakerLock;
  }
  
  /**
   * Record a success for circuit breaker (thread-safe)
   */
  private async recordSuccess(): Promise<void> {
    // Acquire lock to prevent concurrent state modifications
    this.circuitBreakerLock = this.circuitBreakerLock.then(() => {
      if (this.circuitBreaker.state === 'half-open') {
        // Successful request in half-open state closes the circuit
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.lastStateChange = Date.now();
        console.log('[GraphClient] Circuit breaker closed after successful request');
      } else if (this.circuitBreaker.state === 'closed') {
        // Reset failure count on success
        this.circuitBreaker.failures = 0;
      }
    });
    await this.circuitBreakerLock;
  }
  
  /**
   * Record a failure for circuit breaker (thread-safe)
   */
  private async recordFailure(): Promise<void> {
    // Acquire lock to prevent concurrent state modifications
    this.circuitBreakerLock = this.circuitBreakerLock.then(() => {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = Date.now();
      
      if (this.circuitBreaker.state === 'half-open') {
        // Failure in half-open state opens the circuit again
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.lastStateChange = Date.now();
        console.log('[GraphClient] Circuit breaker re-opened after failure in half-open state');
      } else if (this.circuitBreaker.state === 'closed' && 
                 this.circuitBreaker.failures >= this.circuitBreakerThreshold) {
        // Too many failures, open the circuit
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.lastStateChange = Date.now();
        console.log(`[GraphClient] Circuit breaker opened after ${this.circuitBreaker.failures} failures`);
      }
    });
    await this.circuitBreakerLock;
  }
  
  /**
   * Check if request should be allowed through circuit breaker
   */
  private async isCircuitBreakerOpen(): Promise<boolean> {
    await this.checkCircuitBreaker();
    return this.circuitBreaker.state === 'open';
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
      
      // Enhanced logging for SharePoint Embedded errors
      console.error('[GraphClient] Request failed:', {
        method,
        url: url.replace(/containers\/[^\/]+/, 'containers/***'),
        status: response.status,
        statusText: response.statusText
      });
      
      try {
        const errorData = JSON.parse(errorText) as GraphErrorResponse;
        if (errorData.error) {
          errorMessage = `${errorData.error.code}: ${errorData.error.message}`;
          console.error('[GraphClient] Graph API error:', {
            code: errorData.error.code,
            message: errorData.error.message,
            innerError: errorData.error.innerError
          });
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
   * Retry mechanism for handling transient failures with circuit breaker
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryCount = 0
  ): Promise<T> {
    // Check circuit breaker before attempting request
    if (await this.isCircuitBreakerOpen()) {
      const error = new Error(`GraphClient circuit breaker is open - ${operationName} blocked to prevent cascading failures`);
      (error as any).circuitBreakerOpen = true;
      throw error;
    }
    
    try {
      const result = await operation();
      await this.recordSuccess();
      return result;
    } catch (error: any) {
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        const delay = this.calculateDelay(retryCount, error);
        console.warn(`[GraphClient] ${operationName} failed (attempt ${retryCount + 1}/${this.maxRetries}). Retrying in ${delay}ms...`, error.message);
        
        await this.sleep(delay);
        return this.withRetry(operation, operationName, retryCount + 1);
      }
      
      // Record failure for circuit breaker
      await this.recordFailure();
      
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

  // ============ CONTAINER TYPE OPERATIONS ============

  /**
   * List all container types available to the application
   */
  async listContainerTypes(): Promise<ContainerType[]> {
    return this.withRetry(async () => {
      const response = await this.makeGraphRequest<GraphResponse<ContainerType>>(
        'GET',
        '/storage/fileStorage/containerTypes'
      );
      return response.value || [];
    }, 'listContainerTypes');
  }

  /**
   * Get a specific container type by ID
   */
  async getContainerType(containerTypeId: string): Promise<ContainerType> {
    return this.withRetry(async () => {
      return await this.makeGraphRequest<ContainerType>(
        'GET',
        `/storage/fileStorage/containerTypes/${containerTypeId}`
      );
    }, `getContainerType(${containerTypeId})`);
  }

  /**
   * Register a new container type with SharePoint Embedded
   * Note: This typically requires administrative privileges
   */
  async createContainerType(
    displayName: string,
    description?: string,
    applicationId?: string
  ): Promise<ContainerType> {
    return this.withRetry(async () => {
      return await this.makeGraphRequest<ContainerType>(
        'POST',
        '/storage/fileStorage/containerTypes',
        {
          displayName,
          description,
          applicationId: applicationId || process.env.AZURE_CLIENT_ID
        }
      );
    }, `createContainerType(${displayName})`);
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
    expenseId?: string,
    metadata?: Record<string, string | number | boolean | null> // NEW: Optional metadata to store in list columns
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
      
      // Upload the file
      let driveItem: DriveItem;
      
      // For large files (>4MB), use resumable upload
      if (fileBuffer.length > 4 * 1024 * 1024) {
        driveItem = await this.uploadLargeFileWithRetry(containerId, uploadPath, fileBuffer);
      } else {
        // For small files, use simple upload with container endpoint
        const uploadEndpoint = `/storage/fileStorage/containers/${containerId}/drive/root:${uploadPath}:/content`;
        console.log(`[GraphClient] Uploading file to SharePoint Embedded:`, {
          containerId,
          uploadPath,
          fileName: sanitizedFileName,
          endpoint: uploadEndpoint,
          fileSize: fileBuffer.length
        });
        driveItem = await this.makeGraphRequest<DriveItem>(
          'PUT',
          uploadEndpoint,
          fileBuffer,
          { 'Content-Type': 'application/octet-stream' }
        );
      }
      
      // If metadata provided, update the list item fields
      if (metadata && Object.keys(metadata).length > 0) {
        try {
          await this.updateFileMetadata(containerId, driveItem.id, metadata);
        } catch (error) {
          console.warn('[GraphClient] Failed to update metadata, file uploaded but metadata not saved:', error);
        }
      }
      
      return driveItem;
    }, `uploadFile(${sanitizedFileName})`);
  }
  
  /**
   * Update file metadata in SharePoint list columns
   */
  async updateFileMetadata(
    containerId: string,
    itemId: string,
    metadata: Record<string, string | number | boolean | null>
  ): Promise<void> {
    try {
      // Filter out empty values and null fields
      const cleanedMetadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(metadata)) {
        // Skip empty strings, null, and undefined values
        if (value !== '' && value !== null && value !== undefined) {
          cleanedMetadata[key] = value;
        }
      }
      
      // Only update if there's metadata to set
      if (Object.keys(cleanedMetadata).length > 0) {
        // Update list item fields via PATCH request
        await this.makeGraphRequest(
          'PATCH',
          `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}/listItem/fields`,
          cleanedMetadata
        );
        console.log('[GraphClient] Metadata updated successfully for item:', itemId);
      }
    } catch (error) {
      console.error('[GraphClient] Failed to update metadata:', error);
      throw error;
    }
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
      
      // Request with expanded listItem fields to get metadata for all files
      const response = await this.makeGraphRequest<GraphResponse<DriveItem>>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/drive/root${pathForApi}/children?$expand=listItem($expand=fields)`
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
      // Request item with expanded listItem fields to get metadata
      return await this.makeGraphRequest<DriveItem>(
        'GET', 
        `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}?$expand=listItem($expand=fields)`
      );
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

  // ============ CONTAINER METADATA MANAGEMENT OPERATIONS ============

  /**
   * List all columns in a SharePoint Embedded container
   */
  async listContainerColumns(containerId: string): Promise<ColumnDefinition[]> {
    return this.withRetry(async () => {
      const response = await this.makeGraphRequest<GraphResponse<ColumnDefinition>>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/columns`
      );
      return response.value || [];
    }, `listContainerColumns(${containerId})`);
  }

  /**
   * Get a specific column definition from a container
   */
  async getContainerColumn(containerId: string, columnId: string): Promise<ColumnDefinition> {
    return this.withRetry(async () => {
      return await this.makeGraphRequest<ColumnDefinition>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/columns/${columnId}`
      );
    }, `getContainerColumn(${containerId}, ${columnId})`);
  }

  /**
   * Create a new column in a SharePoint Embedded container
   */
  async createContainerColumn(containerId: string, columnDefinition: ColumnDefinition): Promise<ColumnDefinition> {
    return this.withRetry(async () => {
      // Build the column request based on column type
      const columnRequest: any = {
        displayName: columnDefinition.displayName,
        name: columnDefinition.name,
        description: columnDefinition.description,
        required: columnDefinition.required || false,
        indexed: columnDefinition.indexed || false,
        hidden: columnDefinition.hidden || false,
        readOnly: columnDefinition.readOnly || false,
        enforceUniqueValues: columnDefinition.enforceUniqueValues || false
      };

      // Add type-specific configuration
      switch (columnDefinition.columnType) {
        case 'text':
          columnRequest.text = {
            allowMultipleLines: columnDefinition.text?.allowMultipleLines || false,
            appendChangesToExistingText: columnDefinition.text?.appendChangesToExistingText || false,
            linesForEditing: columnDefinition.text?.linesForEditing || 0,
            maxLength: Math.min(columnDefinition.text?.maxLength || 255, 255) // SharePoint max is 255
          };
          break;

        case 'choice':
          columnRequest.choice = {
            choices: columnDefinition.choice?.choices || [],
            allowFillInChoice: columnDefinition.choice?.allowFillInChoice || false,
            displayAs: columnDefinition.choice?.displayAs || 'dropDownMenu'
          };
          break;

        case 'dateTime':
          columnRequest.dateTime = {
            displayAs: columnDefinition.dateTime?.displayAs || 'DateTime',
            includeTime: columnDefinition.dateTime?.includeTime !== false
          };
          break;

        case 'number':
          columnRequest.number = {
            decimalPlaces: columnDefinition.number?.decimalPlaces || 0,
            minimum: columnDefinition.number?.minimum,
            maximum: columnDefinition.number?.maximum,
            showAsPercentage: columnDefinition.number?.showAsPercentage || false
          };
          break;

        case 'currency':
          columnRequest.currency = {
            lcid: columnDefinition.currency?.lcid || 1033 // Default to US English
          };
          break;

        case 'boolean':
          columnRequest.boolean = columnDefinition.boolean || {};
          break;

        case 'personOrGroup':
          columnRequest.personOrGroup = {
            allowMultipleSelection: columnDefinition.personOrGroup?.allowMultipleSelection || false,
            chooseFromType: columnDefinition.personOrGroup?.chooseFromType || 'peopleOnly'
          };
          break;

        case 'hyperlinkOrPicture':
          columnRequest.hyperlinkOrPicture = {
            isPicture: columnDefinition.hyperlinkOrPicture?.isPicture || false
          };
          break;

        default:
          throw new Error(`Unsupported column type: ${columnDefinition.columnType}`);
      }

      return await this.makeGraphRequest<ColumnDefinition>(
        'POST',
        `/storage/fileStorage/containers/${containerId}/columns`,
        columnRequest
      );
    }, `createContainerColumn(${containerId}, ${columnDefinition.name})`);
  }

  /**
   * Update an existing column in a SharePoint Embedded container
   */
  async updateContainerColumn(
    containerId: string,
    columnId: string,
    updates: Partial<ColumnDefinition>
  ): Promise<ColumnDefinition> {
    return this.withRetry(async () => {
      // Only include updateable fields
      const updateRequest: any = {};
      
      if (updates.displayName) updateRequest.displayName = updates.displayName;
      if (updates.description !== undefined) updateRequest.description = updates.description;
      if (updates.required !== undefined) updateRequest.required = updates.required;
      if (updates.hidden !== undefined) updateRequest.hidden = updates.hidden;

      return await this.makeGraphRequest<ColumnDefinition>(
        'PATCH',
        `/storage/fileStorage/containers/${containerId}/columns/${columnId}`,
        updateRequest
      );
    }, `updateContainerColumn(${containerId}, ${columnId})`);
  }

  /**
   * Delete a column from a SharePoint Embedded container
   */
  async deleteContainerColumn(containerId: string, columnId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.makeGraphRequest<void>(
        'DELETE',
        `/storage/fileStorage/containers/${containerId}/columns/${columnId}`
      );
    }, `deleteContainerColumn(${containerId}, ${columnId})`);
  }

  // ============ DOCUMENT METADATA OPERATIONS ============

  /**
   * Get metadata for a document in a SharePoint Embedded container
   */
  async getDocumentMetadata(containerId: string, itemId: string): Promise<DocumentMetadata> {
    return this.withRetry(async () => {
      const response = await this.makeGraphRequest<DocumentListItem>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}/listitem/fields`
      );
      return response.fields || {};
    }, `getDocumentMetadata(${containerId}, ${itemId})`);
  }

  /**
   * Update metadata for a document in a SharePoint Embedded container
   */
  async updateDocumentMetadata(
    containerId: string,
    itemId: string,
    metadata: DocumentMetadata
  ): Promise<DocumentMetadata> {
    return this.withRetry(async () => {
      // Clean the metadata - remove null/undefined values and format properly
      const cleanMetadata: any = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (value !== null && value !== undefined) {
          if (value instanceof Date) {
            cleanMetadata[key] = value.toISOString();
          } else if (Array.isArray(value)) {
            cleanMetadata[key] = value;
          } else {
            cleanMetadata[key] = value;
          }
        } else {
          // Explicitly set null to clear the field
          cleanMetadata[key] = null;
        }
      }

      const response = await this.makeGraphRequest<DocumentListItem>(
        'PATCH',
        `/storage/fileStorage/containers/${containerId}/drive/items/${itemId}/listitem/fields`,
        cleanMetadata
      );
      return response.fields || {};
    }, `updateDocumentMetadata(${containerId}, ${itemId})`);
  }

  /**
   * List documents with their metadata from a SharePoint Embedded container
   */
  async listDocumentsWithMetadata(
    containerId: string,
    folderPath: string = '/',
    options?: MetadataQueryOptions
  ): Promise<DriveItemWithMetadata[]> {
    return this.withRetry(async () => {
      const pathForApi = folderPath === '/' ? '' : `:${folderPath}:`;
      
      // Build query parameters
      const queryParams: string[] = [];
      
      // Add expand to include listItem fields
      queryParams.push('$expand=listItem($expand=fields)');
      
      if (options?.select && options.select.length > 0) {
        queryParams.push(`$select=${options.select.join(',')}`);
      }
      
      if (options?.filters && options.filters.length > 0) {
        const filterExpression = options.filters
          .map(filter => `listItem/fields/${filter.field} ${filter.operator} '${filter.value}'`)
          .join(' and ');
        queryParams.push(`$filter=${filterExpression}`);
      }
      
      if (options?.orderBy) {
        const order = options.orderDirection === 'desc' ? 'desc' : 'asc';
        queryParams.push(`$orderby=listItem/fields/${options.orderBy} ${order}`);
      }
      
      if (options?.top) {
        queryParams.push(`$top=${options.top}`);
      }
      
      if (options?.skip) {
        queryParams.push(`$skip=${options.skip}`);
      }
      
      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      
      const response = await this.makeGraphRequest<GraphResponse<DriveItemWithMetadata>>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/drive/root${pathForApi}/children${queryString}`
      );
      
      return response.value || [];
    }, `listDocumentsWithMetadata(${containerId}, ${folderPath})`);
  }

  /**
   * Search documents by metadata in a SharePoint Embedded container
   */
  async searchDocumentsByMetadata(
    containerId: string,
    query: string,
    metadataFilters?: MetadataQueryFilter[]
  ): Promise<DriveItemWithMetadata[]> {
    return this.withRetry(async () => {
      // Build search query parameters
      const queryParams: string[] = [`q=${encodeURIComponent(query)}`];
      queryParams.push('$expand=listItem($expand=fields)');
      
      if (metadataFilters && metadataFilters.length > 0) {
        const filterExpression = metadataFilters
          .map(filter => `listItem/fields/${filter.field} ${filter.operator} '${filter.value}'`)
          .join(' and ');
        queryParams.push(`$filter=${filterExpression}`);
      }
      
      const queryString = queryParams.join('&');
      
      const response = await this.makeGraphRequest<GraphResponse<DriveItemWithMetadata>>(
        'GET',
        `/storage/fileStorage/containers/${containerId}/drive/root/search(q='${encodeURIComponent(query)}')?${queryString}`
      );
      
      return response.value || [];
    }, `searchDocumentsByMetadata(${containerId}, ${query})`);
  }

  // ============ RECEIPT METADATA SPECIFIC OPERATIONS ============

  /**
   * Initialize the receipt metadata schema for a container
   * Creates all the required columns for receipt processing
   */
  async initializeReceiptMetadataSchema(containerId: string): Promise<ColumnDefinition[]> {
    const receiptColumns: ColumnDefinition[] = [
      {
        name: 'ProjectId',
        displayName: 'Project ID',
        columnType: 'text',
        description: 'Project code this receipt belongs to',
        required: true,
        text: { maxLength: 50, allowMultipleLines: false }
      },
      {
        name: 'ExpenseId',
        displayName: 'Expense ID',
        columnType: 'text',
        description: 'Expense ID when assigned to an expense',
        required: false,
        text: { maxLength: 50, allowMultipleLines: false }
      },
      {
        name: 'UploadedBy',
        displayName: 'Uploaded By',
        columnType: 'text',
        description: 'User who uploaded this receipt',
        required: true,
        text: { maxLength: 255, allowMultipleLines: false }
      },
      {
        name: 'ExpenseCategory',
        displayName: 'Expense Category',
        columnType: 'choice',
        description: 'Type of expense category',
        required: true,
        choice: {
          choices: ['Travel', 'Meals', 'Accommodation', 'Equipment', 'Supplies', 'Software', 'Training', 'Other'],
          allowFillInChoice: false
        }
      },
      {
        name: 'ReceiptDate',
        displayName: 'Receipt Date',
        columnType: 'dateTime',
        description: 'Date from the receipt',
        required: true,
        dateTime: { displayAs: 'DateTime', includeTime: false }
      },
      {
        name: 'Amount',
        displayName: 'Amount',
        columnType: 'currency',
        description: 'Receipt amount',
        required: true,
        currency: { lcid: 1033 }
      },
      {
        name: 'Currency',
        displayName: 'Currency',
        columnType: 'choice',
        description: 'Currency of the receipt',
        required: true,
        choice: {
          choices: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
          allowFillInChoice: false
        }
      },
      {
        name: 'Status',
        displayName: 'Status',
        columnType: 'choice',
        description: 'Processing status of the receipt',
        required: true,
        choice: {
          choices: ['pending', 'assigned', 'processed'],
          allowFillInChoice: false
        }
      },
      {
        name: 'Vendor',
        displayName: 'Vendor',
        columnType: 'text',
        description: 'Merchant or vendor name',
        required: false,
        text: { maxLength: 255, allowMultipleLines: false }
      },
      {
        name: 'Description',
        displayName: 'Description',
        columnType: 'text',
        description: 'Receipt description or notes',
        required: false,
        text: { maxLength: 500, allowMultipleLines: true }
      },
      {
        name: 'IsReimbursable',
        displayName: 'Reimbursable',
        columnType: 'boolean',
        description: 'Whether this receipt is reimbursable',
        required: false,
        boolean: {}
      },
      {
        name: 'Tags',
        displayName: 'Tags',
        columnType: 'text',
        description: 'Additional tags for categorization',
        required: false,
        text: { maxLength: 500, allowMultipleLines: false }
      }
    ];

    const createdColumns: ColumnDefinition[] = [];
    
    // Create each column, handling existing columns gracefully
    for (const columnDef of receiptColumns) {
      try {
        const createdColumn = await this.createContainerColumn(containerId, columnDef);
        createdColumns.push(createdColumn);
        console.log(`[GraphClient] Created receipt metadata column: ${columnDef.name}`);
      } catch (error: any) {
        if (error.message?.includes('already exists') || error.status === 409) {
          console.log(`[GraphClient] Receipt metadata column ${columnDef.name} already exists, skipping`);
          // Try to get the existing column
          try {
            const existingColumns = await this.listContainerColumns(containerId);
            const existing = existingColumns.find(col => col.name === columnDef.name);
            if (existing) {
              createdColumns.push(existing);
            }
          } catch (getError) {
            console.warn(`[GraphClient] Could not retrieve existing column ${columnDef.name}:`, getError);
          }
        } else {
          console.error(`[GraphClient] Failed to create receipt metadata column ${columnDef.name}:`, error);
          throw error;
        }
      }
    }

    return createdColumns;
  }

  /**
   * Assign receipt metadata to an uploaded file
   */
  async assignReceiptMetadata(
    containerId: string,
    itemId: string,
    receiptData: {
      projectId: string;
      uploadedBy: string;
      expenseCategory: string;
      receiptDate: Date;
      amount: number;
      currency?: string;
      status?: string;
      expenseId?: string;
      vendor?: string;
      description?: string;
      isReimbursable?: boolean;
      tags?: string;
    }
  ): Promise<DocumentMetadata> {
    const metadata: DocumentMetadata = {
      ProjectId: receiptData.projectId,
      UploadedBy: receiptData.uploadedBy,
      ExpenseCategory: receiptData.expenseCategory,
      ReceiptDate: receiptData.receiptDate,
      Amount: receiptData.amount,
      Currency: receiptData.currency || 'USD',
      Status: receiptData.status || 'pending',
    };

    // Add optional fields if provided
    if (receiptData.expenseId) {
      metadata.ExpenseId = receiptData.expenseId;
    }
    if (receiptData.vendor) {
      metadata.Vendor = receiptData.vendor;
    }
    if (receiptData.description) {
      metadata.Description = receiptData.description;
    }
    if (receiptData.isReimbursable !== undefined) {
      metadata.IsReimbursable = receiptData.isReimbursable;
    }
    if (receiptData.tags) {
      metadata.Tags = receiptData.tags;
    }

    return await this.updateDocumentMetadata(containerId, itemId, metadata);
  }

  /**
   * Update receipt status (pending -> assigned -> processed)
   */
  async updateReceiptStatus(
    containerId: string,
    itemId: string,
    status: 'pending' | 'assigned' | 'processed',
    expenseId?: string
  ): Promise<DocumentMetadata> {
    const metadata: DocumentMetadata = { Status: status };
    
    // If assigning to an expense, include the expense ID
    if (status === 'assigned' && expenseId) {
      metadata.ExpenseId = expenseId;
    }
    
    return await this.updateDocumentMetadata(containerId, itemId, metadata);
  }

  /**
   * Get receipts by status from a container
   */
  async getReceiptsByStatus(
    containerId: string,
    status: 'pending' | 'assigned' | 'processed',
    limit?: number
  ): Promise<DriveItemWithMetadata[]> {
    const options: MetadataQueryOptions = {
      filters: [{ field: 'Status', operator: 'eq', value: status }],
      expand: ['listItem($expand=fields)']
    };
    
    if (limit) {
      options.top = limit;
    }
    
    return await this.listDocumentsWithMetadata(containerId, '/', options);
  }

  /**
   * Get receipts for a specific project
   */
  async getReceiptsByProject(
    containerId: string,
    projectId: string,
    status?: 'pending' | 'assigned' | 'processed'
  ): Promise<DriveItemWithMetadata[]> {
    const filters: MetadataQueryFilter[] = [
      { field: 'ProjectId', operator: 'eq', value: projectId }
    ];
    
    if (status) {
      filters.push({ field: 'Status', operator: 'eq', value: status });
    }
    
    const options: MetadataQueryOptions = {
      filters,
      expand: ['listItem($expand=fields)']
    };
    
    return await this.listDocumentsWithMetadata(containerId, '/', options);
  }

  /**
   * Get receipts uploaded by a specific user
   */
  async getReceiptsByUploader(
    containerId: string,
    uploadedBy: string,
    status?: 'pending' | 'assigned' | 'processed'
  ): Promise<DriveItemWithMetadata[]> {
    const filters: MetadataQueryFilter[] = [
      { field: 'UploadedBy', operator: 'eq', value: uploadedBy }
    ];
    
    if (status) {
      filters.push({ field: 'Status', operator: 'eq', value: status });
    }
    
    const options: MetadataQueryOptions = {
      filters,
      expand: ['listItem($expand=fields)']
    };
    
    return await this.listDocumentsWithMetadata(containerId, '/', options);
  }
}

/**
 * Register container type application permissions using SharePoint REST API v2.1
 * This grants the owning application permissions to all containers of this type
 */
export async function registerContainerTypePermissions(
  containerTypeId: string,
  appId: string
): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[GraphClient] Registering container type permissions:', {
      containerTypeId,
      appId
    });

    // Get access token for SharePoint API
    if (!msalInstance) {
      throw new Error('MSAL instance not initialized');
    }
    
    const tokenResponse = await msalInstance.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
      skipCache: false,
    });

    if (!tokenResponse?.accessToken) {
      throw new Error('Failed to acquire access token');
    }

    // Construct the root SharePoint site URL from the tenant
    // For Synozur tenant, this is https://synozur.sharepoint.com
    const rootSiteUrl = 'https://synozur.sharepoint.com';
    
    console.log('[GraphClient] Using SharePoint root site URL:', rootSiteUrl);

    // Construct the SharePoint REST API v2.1 endpoint
    const registrationUrl = `${rootSiteUrl}/_api/v2.1/storageContainerTypes/${containerTypeId}/applicationPermissions`;
    
    console.log('[GraphClient] Registration URL:', registrationUrl);

    // Prepare the payload
    const payload = {
      value: [
        {
          appId: appId,
          delegated: ["full"],
          appOnly: ["full"]
        }
      ]
    };

    console.log('[GraphClient] Registration payload:', JSON.stringify(payload, null, 2));

    // Make the PUT request to register permissions
    const registrationResponse = await fetch(
      registrationUrl,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseText = await registrationResponse.text();
    console.log('[GraphClient] Registration response:', {
      status: registrationResponse.status,
      statusText: registrationResponse.statusText,
      body: responseText
    });

    if (!registrationResponse.ok) {
      let errorMessage = `HTTP ${registrationResponse.status}`;
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error) {
          errorMessage = errorData.error.message || errorMessage;
        }
      } catch {
        errorMessage += `: ${responseText}`;
      }
      
      return {
        success: false,
        message: `Registration failed: ${errorMessage}`
      };
    }

    return {
      success: true,
      message: 'Container type permissions registered successfully. Your application now has full access to all containers of this type.'
    };

  } catch (error: any) {
    console.error('[GraphClient] Error registering container type permissions:', error);
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
}

// Export singleton instance
export const graphClient = new GraphClient();