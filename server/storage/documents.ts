import {
  users,
  clients,
  projects,
  roles,
  timeEntries,
  containerTypes,
  clientContainers,
  containerPermissions,
  containerColumns,
  documentMetadata,
  type User,
  type Client,
  type Project,
  type Expense,
  type ContainerType,
  type InsertContainerType,
  type ClientContainer,
  type InsertClientContainer,
  type ContainerPermission,
  type InsertContainerPermission,
  type ContainerColumn,
  type InsertContainerColumn
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, desc, and, or, gte, lte, sql } from "drizzle-orm";

export const documentsMethods: ThisType<IStorage & {
  createLocalReceiptColumns(containerId: string): Promise<any>;
  checkUserClientAccess(userId: string, clientId: string): Promise<boolean>;
  initializeDefaultContainerTypes(): Promise<void>;
}> = {
  async getContainerTypes(): Promise<ContainerType[]> {
    return await db.select()
      .from(containerTypes)
      .where(eq(containerTypes.isActive, true))
      .orderBy(containerTypes.displayName);
  },

  async getContainerType(containerTypeId: string): Promise<ContainerType | undefined> {
    const [containerType] = await db.select()
      .from(containerTypes)
      .where(eq(containerTypes.containerTypeId, containerTypeId));
    return containerType || undefined;
  },

  async createContainerType(containerType: InsertContainerType): Promise<ContainerType> {
    const [created] = await db.insert(containerTypes).values(containerType).returning();
    return created;
  },

  async updateContainerType(id: string, updates: Partial<InsertContainerType>): Promise<ContainerType> {
    const [updated] = await db.update(containerTypes)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(containerTypes.id, id))
      .returning();
    return updated;
  },

  async deleteContainerType(id: string): Promise<void> {
    await db.update(containerTypes)
      .set({ isActive: false, updatedAt: sql`now()` })
      .where(eq(containerTypes.id, id));
  },

  async getClientContainers(clientId?: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType })[]> {
    let query = db.select({
      id: clientContainers.id,
      clientId: clientContainers.clientId,
      containerId: clientContainers.containerId,
      containerTypeId: clientContainers.containerTypeId,
      displayName: clientContainers.displayName,
      description: clientContainers.description,
      driveId: clientContainers.driveId,
      webUrl: clientContainers.webUrl,
      status: clientContainers.status,
      createdAt: clientContainers.createdAt,
      updatedAt: clientContainers.updatedAt,
      client: clients,
      containerType: containerTypes
    })
    .from(clientContainers)
    .leftJoin(clients, eq(clientContainers.clientId, clients.id))
    .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
    .where(eq(clientContainers.status, 'active'));

    let finalQuery = query;
    if (clientId) {
      finalQuery = db.select({
        id: clientContainers.id,
        clientId: clientContainers.clientId,
        containerId: clientContainers.containerId,
        containerTypeId: clientContainers.containerTypeId,
        displayName: clientContainers.displayName,
        description: clientContainers.description,
        driveId: clientContainers.driveId,
        webUrl: clientContainers.webUrl,
        status: clientContainers.status,
        createdAt: clientContainers.createdAt,
        updatedAt: clientContainers.updatedAt,
        client: clients,
        containerType: containerTypes
      })
      .from(clientContainers)
      .leftJoin(clients, eq(clientContainers.clientId, clients.id))
      .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
      .where(and(
        eq(clientContainers.status, 'active'),
        eq(clientContainers.clientId, clientId)
      ));
    }

    const results = await finalQuery.orderBy(clientContainers.displayName);
    
    return results.map(row => ({
      ...row,
      client: row.client || { 
        id: 'unknown', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
        vocabularyOverrides: null,
        epicTermId: null,
        stageTermId: null,
        workstreamTermId: null,
        milestoneTermId: null,
        activityTermId: null,
        msaDate: null,
        msaDocument: null,
        hasMsa: false,
        sinceDate: null,
        ndaDate: null,
        ndaDocument: null,
        hasNda: false,
        createdAt: new Date()
      },
      containerType: row.containerType || {
        id: 'unknown',
        containerTypeId: 'unknown',
        displayName: 'Unknown Type',
        description: null,
        applicationId: null,
        isBuiltIn: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }));
  },

  async getClientContainer(containerId: string): Promise<(ClientContainer & { client: Client; containerType: ContainerType }) | undefined> {
    const [result] = await db.select({
      id: clientContainers.id,
      clientId: clientContainers.clientId,
      containerId: clientContainers.containerId,
      containerTypeId: clientContainers.containerTypeId,
      displayName: clientContainers.displayName,
      description: clientContainers.description,
      driveId: clientContainers.driveId,
      webUrl: clientContainers.webUrl,
      status: clientContainers.status,
      createdAt: clientContainers.createdAt,
      updatedAt: clientContainers.updatedAt,
      client: clients,
      containerType: containerTypes
    })
    .from(clientContainers)
    .leftJoin(clients, eq(clientContainers.clientId, clients.id))
    .leftJoin(containerTypes, eq(clientContainers.containerTypeId, containerTypes.containerTypeId))
    .where(eq(clientContainers.containerId, containerId));

    if (!result) return undefined;

    return {
      ...result,
      client: result.client || { 
        id: 'unknown', 
        name: 'Unknown Client', 
        status: 'inactive',
        currency: 'USD',
        billingContact: null,
        contactName: null,
        contactAddress: null,
        vocabularyOverrides: null,
        epicTermId: null,
        stageTermId: null,
        workstreamTermId: null,
        milestoneTermId: null,
        activityTermId: null,
        msaDate: null,
        msaDocument: null,
        hasMsa: false,
        sinceDate: null,
        ndaDate: null,
        ndaDocument: null,
        hasNda: false,
        createdAt: new Date()
      },
      containerType: result.containerType || {
        id: 'unknown',
        containerTypeId: 'unknown',
        displayName: 'Unknown Type',
        description: null,
        applicationId: null,
        isBuiltIn: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };
  },

  async createClientContainer(clientContainer: InsertClientContainer): Promise<ClientContainer> {
    const [created] = await db.insert(clientContainers).values(clientContainer).returning();
    return created;
  },

  async updateClientContainer(id: string, updates: Partial<InsertClientContainer>): Promise<ClientContainer> {
    const [updated] = await db.update(clientContainers)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(clientContainers.id, id))
      .returning();
    return updated;
  },

  async deleteClientContainer(id: string): Promise<void> {
    await db.update(clientContainers)
      .set({ status: 'inactive', updatedAt: sql`now()` })
      .where(eq(clientContainers.id, id));
  },

  async getContainerForClient(clientId: string): Promise<ClientContainer | undefined> {
    const [container] = await db.select()
      .from(clientContainers)
      .where(and(
        eq(clientContainers.clientId, clientId),
        eq(clientContainers.status, 'active')
      ))
      .orderBy(clientContainers.createdAt)
      .limit(1);
    return container || undefined;
  },

  async getContainerPermissions(containerId: string): Promise<(ContainerPermission & { user?: User })[]> {
    const results = await db.select({
      id: containerPermissions.id,
      containerId: containerPermissions.containerId,
      userId: containerPermissions.userId,
      principalType: containerPermissions.principalType,
      principalId: containerPermissions.principalId,
      roles: containerPermissions.roles,
      grantedAt: containerPermissions.grantedAt,
      grantedBy: containerPermissions.grantedBy,
      user: users
    })
    .from(containerPermissions)
    .leftJoin(users, eq(containerPermissions.userId, users.id))
    .where(eq(containerPermissions.containerId, containerId))
    .orderBy(containerPermissions.grantedAt);

    return results.map(row => ({
      ...row,
      user: row.user || undefined
    }));
  },

  async createContainerPermission(permission: InsertContainerPermission): Promise<ContainerPermission> {
    const [created] = await db.insert(containerPermissions).values(permission).returning();
    return created;
  },

  async updateContainerPermission(id: string, updates: Partial<InsertContainerPermission>): Promise<ContainerPermission> {
    const [updated] = await db.update(containerPermissions)
      .set(updates)
      .where(eq(containerPermissions.id, id))
      .returning();
    return updated;
  },

  async deleteContainerPermission(id: string): Promise<void> {
    await db.delete(containerPermissions)
      .where(eq(containerPermissions.id, id));
  },

  async getContainerColumns(containerId: string): Promise<ContainerColumn[]> {
    return await db.select()
      .from(containerColumns)
      .where(eq(containerColumns.containerId, containerId))
      .orderBy(containerColumns.name);
  },

  async createContainerColumn(containerId: string, column: InsertContainerColumn): Promise<ContainerColumn> {
    const [created] = await db.insert(containerColumns)
      .values({
        ...column,
        containerId
      })
      .returning();
    return created;
  },

  async updateContainerColumn(columnId: string, updates: Partial<InsertContainerColumn>): Promise<ContainerColumn> {
    const [updated] = await db.update(containerColumns)
      .set({
        ...updates,
        updatedAt: sql`now()`
      })
      .where(eq(containerColumns.id, columnId))
      .returning();
    return updated;
  },

  async deleteContainerColumn(columnId: string): Promise<void> {
    await db.delete(containerColumns)
      .where(eq(containerColumns.id, columnId));
  },

  async initializeReceiptMetadataColumns(containerId: string): Promise<ContainerColumn[]> {
    try {
      // Check if columns already exist
      const existingColumns = await this.getContainerColumns(containerId);
      if (existingColumns.length > 0) {
        console.log(`[METADATA_INIT] Container ${containerId} already has ${existingColumns.length} columns, skipping initialization`);
        return existingColumns;
      }

      // Skip GraphClient initialization and use local-only approach
      console.warn(`[METADATA_INIT] GraphClient unavailable, creating local-only columns`);
        
      // Fallback: create local columns without SharePoint integration
      return await this.createLocalReceiptColumns(containerId);
    } catch (error) {
      console.error(`[METADATA_INIT] Failed to initialize receipt metadata columns:`, error);
      throw error;
    }
  },

  mapColumnToReceiptFieldType(columnName: string): string | null {
    const mapping: Record<string, string> = {
      'ProjectId': 'project_id',
      'ExpenseId': 'expense_id', 
      'UploadedBy': 'uploaded_by',
      'ExpenseCategory': 'expense_category',
      'ReceiptDate': 'receipt_date',
      'Amount': 'amount',
      'Currency': 'currency',
      'Status': 'status',
      'Vendor': 'vendor',
      'Description': 'description',
      'IsReimbursable': 'is_reimbursable',
      'Tags': 'tags'
    };
    return mapping[columnName] || null;
  },

  async createLocalReceiptColumns(containerId: string): Promise<ContainerColumn[]> {
    const columnDefs = [
      {
        name: 'ProjectId',
        displayName: 'Project ID',
        columnType: 'text' as const,
        description: 'Project identifier',
        isRequired: true,
        receiptFieldType: 'project_id'
      },
      {
        name: 'ExpenseId', 
        displayName: 'Expense ID',
        columnType: 'text' as const,
        description: 'Expense record identifier',
        isRequired: false,
        receiptFieldType: 'expense_id'
      },
      {
        name: 'UploadedBy',
        displayName: 'Uploaded By',
        columnType: 'text' as const,
        description: 'User who uploaded the document',
        isRequired: true,
        receiptFieldType: 'uploaded_by'
      },
      {
        name: 'ExpenseCategory',
        displayName: 'Expense Category', 
        columnType: 'choice' as const,
        description: 'Type of expense category',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["Travel", "Meals", "Accommodation", "Equipment", "Supplies", "Software", "Training", "Other"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'expense_category'
      },
      {
        name: 'ReceiptDate',
        displayName: 'Receipt Date',
        columnType: 'dateTime' as const,
        description: 'Date from the receipt',
        isRequired: true,
        dateTimeConfig: JSON.stringify({ displayAs: "DateTime", includeTime: false }),
        receiptFieldType: 'receipt_date'
      },
      {
        name: 'Amount',
        displayName: 'Amount',
        columnType: 'currency' as const,
        description: 'Receipt amount', 
        isRequired: true,
        currencyConfig: JSON.stringify({ lcid: 1033 }),
        receiptFieldType: 'amount'
      },
      {
        name: 'Currency',
        displayName: 'Currency',
        columnType: 'choice' as const,
        description: 'Currency of the receipt',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'currency'
      },
      {
        name: 'Status',
        displayName: 'Status',
        columnType: 'choice' as const,
        description: 'Processing status of the receipt',
        isRequired: true,
        choiceConfig: JSON.stringify({
          choices: ["pending", "assigned", "processed"],
          allowFillInChoice: false
        }),
        receiptFieldType: 'status'
      },
      {
        name: 'Vendor',
        displayName: 'Vendor',
        columnType: 'text' as const,
        description: 'Merchant or vendor name',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 255, allowMultipleLines: false }),
        receiptFieldType: 'vendor'
      },
      {
        name: 'Description',
        displayName: 'Description',
        columnType: 'text' as const,
        description: 'Receipt description or notes',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 500, allowMultipleLines: true }),
        receiptFieldType: 'description'
      },
      {
        name: 'IsReimbursable',
        displayName: 'Reimbursable',
        columnType: 'boolean' as const,
        description: 'Whether this receipt is reimbursable',
        isRequired: false,
        booleanConfig: JSON.stringify({}),
        receiptFieldType: 'is_reimbursable'
      },
      {
        name: 'Tags',
        displayName: 'Tags',
        columnType: 'text' as const,
        description: 'Additional tags for categorization',
        isRequired: false,
        textConfig: JSON.stringify({ maxLength: 500, allowMultipleLines: false }),
        receiptFieldType: 'tags'
      }
    ];

    const createdColumns: ContainerColumn[] = [];
    for (const colDef of columnDefs) {
      const column = await this.createContainerColumn(containerId, {
        containerId,
        columnId: '', // Local-only, no SharePoint column ID
        name: colDef.name,
        displayName: colDef.displayName,
        description: colDef.description,
        columnType: colDef.columnType,
        isRequired: colDef.isRequired,
        isIndexed: false,
        isHidden: false,
        isReadOnly: false,
        textConfig: colDef.textConfig || null,
        choiceConfig: colDef.choiceConfig || null,
        numberConfig: null,
        dateTimeConfig: colDef.dateTimeConfig || null,
        currencyConfig: colDef.currencyConfig || null,
        booleanConfig: colDef.booleanConfig || null,
        validationRules: null,
        isReceiptMetadata: true,
        receiptFieldType: colDef.receiptFieldType
      });
      createdColumns.push(column);
    }

    console.log(`[METADATA_INIT] Created ${createdColumns.length} local receipt metadata columns`);
    return createdColumns;
  },

  async createTenantContainer(clientId: string, containerTypeId: string, displayName?: string): Promise<ClientContainer> {
    // Get client information
    const client = await this.getClient(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    // Get or create container type
    let containerType = await this.getContainerType(containerTypeId);
    if (!containerType) {
      throw new Error(`Container type not found: ${containerTypeId}`);
    }

    // Generate display name if not provided
    const containerDisplayName = displayName || `SCDP-${client.name.replace(/[^a-zA-Z0-9]/g, '-')}`;

    try {
      // Use local storage approach instead of SharePoint Embedded
      const sharePointContainer = {
        id: `local-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        drive: {
          id: `drive-${Date.now()}`,
          webUrl: `/containers/${containerDisplayName}`
        }
      };

      // Store container association in database
      const clientContainer = await this.createClientContainer({
        clientId,
        containerId: sharePointContainer.id,
        containerTypeId,
        displayName: containerDisplayName,
        description: `Container for ${client.name}`,
        driveId: sharePointContainer.drive?.id,
        webUrl: sharePointContainer.drive?.webUrl,
        status: 'active'
      });

      console.log(`[CONTAINER] Created container ${sharePointContainer.id} for client ${client.name}`);
      
      return clientContainer;
    } catch (error) {
      console.error(`[CONTAINER] Failed to create container for client ${client.name}:`, error);
      throw new Error(`Failed to create container for client ${client.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async ensureClientHasContainer(clientId: string, containerTypeId?: string): Promise<ClientContainer> {
    // Check if client already has a container
    const existingContainer = await this.getContainerForClient(clientId);
    if (existingContainer) {
      return existingContainer;
    }

    // Get default container type if not provided
    let typeId = containerTypeId;
    if (!typeId) {
      const defaultType = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
      if (!defaultType) {
        throw new Error('No container type specified and no default container type configured');
      }
      typeId = defaultType;
    }

    // Create new container for client
    return await this.createTenantContainer(clientId, typeId);
  },

  async getClientContainerIdForUser(userId: string): Promise<string | null> {
    // Find the user's client association
    // This assumes users are associated with clients via projects
    // You might need to adjust this based on your user-client relationship model
    
    // Get the user's projects to determine their client
    const userProjects = await db.select({
      projectId: projects.id,
      clientId: projects.clientId
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(eq(timeEntries.personId, userId))
    .groupBy(projects.id, projects.clientId)
    .limit(1);

    if (userProjects.length === 0) {
      return null;
    }

    const clientId = userProjects[0].clientId;
    if (!clientId) {
      return null;
    }
    const clientContainer = await this.getContainerForClient(clientId);
    
    return clientContainer?.containerId || null;
  },

  async checkContainerAccess(userId: string, containerId: string, userRole: string): Promise<boolean> {
    try {
      // Admin can access all containers
      if (userRole === 'admin' || userRole === 'billing-admin') {
        return true;
      }

      // Find the container and its client
      const [container] = await db.select({
        clientId: clientContainers.clientId
      })
      .from(clientContainers)
      .where(eq(clientContainers.containerId, containerId));

      if (!container) {
        return false; // Container doesn't exist
      }

      // Check if user has projects with this client
      const userClientAccess = await db.select({
        count: sql<number>`count(*)`.as('count')
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(and(
        eq(timeEntries.personId, userId),
        eq(projects.clientId, container.clientId)
      ));

      return (userClientAccess[0]?.count || 0) > 0;
    } catch (error) {
      console.error('[CONTAINER_ACCESS] Error checking container access:', error);
      return false;
    }
  },

  async syncDocumentMetadata(containerId: string, itemId: string, metadata: {
    fileName: string;
    projectId: string | null;
    expenseId?: string | null;
    uploadedBy: string;
    expenseCategory?: string;
    receiptDate?: Date;
    amount?: number;
    currency?: string;
    status?: string;
    vendor?: string | null;
    description?: string | null;
    isReimbursable?: boolean;
    tags?: string[] | null;
    rawMetadata?: any;
  }): Promise<void> {
    try {
      // Check if document metadata already exists
      const [existing] = await db.select()
        .from(documentMetadata)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));

      if (existing) {
        // Update existing record
        await db.update(documentMetadata)
          .set({
            fileName: metadata.fileName,
            projectId: metadata.projectId,
            expenseId: metadata.expenseId || null,
            uploadedBy: metadata.uploadedBy,
            expenseCategory: metadata.expenseCategory || null,
            receiptDate: metadata.receiptDate || null,
            amount: metadata.amount?.toString() || null,
            currency: metadata.currency || 'USD',
            status: metadata.status || 'pending',
            vendor: metadata.vendor || null,
            description: metadata.description || null,
            isReimbursable: metadata.isReimbursable !== false,
            tags: metadata.tags || null,
            rawMetadata: metadata.rawMetadata || null,
            lastSyncedAt: sql`now()`,
            updatedAt: sql`now()`
          })
          .where(eq(documentMetadata.id, existing.id));
      } else {
        // Create new record
        await db.insert(documentMetadata)
          .values({
            containerId,
            itemId,
            fileName: metadata.fileName,
            projectId: metadata.projectId,
            expenseId: metadata.expenseId || null,
            uploadedBy: metadata.uploadedBy,
            expenseCategory: metadata.expenseCategory || null,
            receiptDate: metadata.receiptDate || null,
            amount: metadata.amount?.toString() || null,
            currency: metadata.currency || 'USD',
            status: metadata.status || 'pending',
            vendor: metadata.vendor || null,
            description: metadata.description || null,
            isReimbursable: metadata.isReimbursable !== false,
            tags: metadata.tags || null,
            rawMetadata: metadata.rawMetadata || null
          });
      }
    } catch (error) {
      console.error('[METADATA_SYNC] Error syncing document metadata:', error);
      throw error;
    }
  },

  async updateDocumentMetadataStatus(containerId: string, itemId: string, status: string, expenseId?: string): Promise<void> {
    try {
      const updateData: any = {
        status,
        lastSyncedAt: sql`now()`,
        updatedAt: sql`now()`
      };

      if (expenseId) {
        updateData.expenseId = expenseId;
      }

      await db.update(documentMetadata)
        .set(updateData)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));
    } catch (error) {
      console.error('[METADATA_STATUS] Error updating document metadata status:', error);
      throw error;
    }
  },

  async getDocumentMetadata(containerId: string, itemId: string): Promise<any> {
    try {
      const [metadata] = await db.select()
        .from(documentMetadata)
        .where(and(
          eq(documentMetadata.containerId, containerId),
          eq(documentMetadata.itemId, itemId)
        ));

      return metadata || null;
    } catch (error) {
      console.error('[METADATA_GET] Error getting document metadata:', error);
      return null;
    }
  },

  async searchDocumentMetadata(containerId: string, filters: {
    status?: string;
    projectId?: string;
    uploadedBy?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    try {
      const conditions = [eq(documentMetadata.containerId, containerId)];

      if (filters.status) {
        conditions.push(eq(documentMetadata.status, filters.status));
      }

      if (filters.projectId) {
        conditions.push(eq(documentMetadata.projectId, filters.projectId));
      }

      if (filters.uploadedBy) {
        conditions.push(eq(documentMetadata.uploadedBy, filters.uploadedBy));
      }

      if (filters.startDate) {
        conditions.push(gte(documentMetadata.receiptDate, filters.startDate));
      }

      if (filters.endDate) {
        conditions.push(lte(documentMetadata.receiptDate, filters.endDate));
      }

      const results = await db.select()
        .from(documentMetadata)
        .where(and(...conditions))
        .orderBy(desc(documentMetadata.createdAt));
      return results;
    } catch (error) {
      console.error('[METADATA_SEARCH] Error searching document metadata:', error);
      return [];
    }
  },

  async initializeDefaultContainerTypes(): Promise<void> {
    try {
      console.log('[CONTAINER_INIT] Starting container type initialization...');

      // Check if we have any container types already
      const existingTypes = await this.getContainerTypes();
      if (existingTypes.length > 0) {
        console.log(`[CONTAINER_INIT] Found ${existingTypes.length} existing container types, skipping initialization`);
        return;
      }

      // Try to sync with SharePoint Embedded first
      await this.syncContainerTypesWithSharePoint();

      // If still no types, create a default one
      const typesAfterSync = await this.getContainerTypes();
      if (typesAfterSync.length === 0) {
        console.log('[CONTAINER_INIT] No container types found after SharePoint sync, creating default type...');
        await this.createDefaultContainerType();
      }

      console.log('[CONTAINER_INIT] Container type initialization completed');
    } catch (error) {
      console.error('[CONTAINER_INIT] Failed to initialize container types:', error);
      throw error;
    }
  },

  async syncContainerTypesWithSharePoint(): Promise<void> {
    try {
      console.log('[CONTAINER_SYNC] Syncing container types with SharePoint Embedded...');
      
      // Skip SharePoint Embedded integration - use local-only approach
      console.warn('[CONTAINER_SYNC] SharePoint Embedded integration disabled, skipping sync');
      return;

      // SharePoint integration skipped - no types to sync
      console.log('[CONTAINER_SYNC] No SharePoint types to sync');

    } catch (error) {
      console.warn('[CONTAINER_SYNC] Failed to sync with SharePoint Embedded (this is normal if not configured):', error);
    }
  },

  async createDefaultContainerType(): Promise<ContainerType> {
    try {
      console.log('[CONTAINER_DEFAULT] Creating default container type...');
      
      // Try to create the container type in SharePoint Embedded first
      let containerTypeId = 'default-scdp-containers';
      
      // Skip SharePoint integration - use local-only approach
      console.warn('[CONTAINER_DEFAULT] SharePoint integration disabled, using local type');

      // Create the container type in our database
      const containerType = await this.createContainerType({
        containerTypeId,
        displayName: 'SCDP Default Container Type',
        description: 'Default container type for client file storage and receipts',
        applicationId: process.env.AZURE_CLIENT_ID || null,
        isBuiltIn: false,
        isActive: true
      });

      // Set as default
      await this.setSystemSetting(
        'DEFAULT_CONTAINER_TYPE_ID',
        containerTypeId,
        'Default container type for new clients'
      );

      console.log(`[CONTAINER_DEFAULT] Created and set default container type: ${containerTypeId}`);
      return containerType;
    } catch (error) {
      console.error('[CONTAINER_DEFAULT] Failed to create default container type:', error);
      throw error;
    }
  },

  async ensureContainerTypeExists(containerTypeId: string, displayName?: string): Promise<ContainerType> {
    // Check if type already exists locally
    let containerType = await this.getContainerType(containerTypeId);
    if (containerType) {
      return containerType;
    }

    // Skip SharePoint integration - create local-only container type
    console.warn(`[CONTAINER_TYPE] SharePoint integration disabled, creating local type: ${containerTypeId}`);
    
    const newDisplayName = displayName || `Container Type ${containerTypeId}`;
    
    // Create local-only container type
    containerType = await this.createContainerType({
      containerTypeId,
      displayName: newDisplayName,
      description: `Local container type: ${containerTypeId}`,
      applicationId: process.env.AZURE_CLIENT_ID || null,
      isBuiltIn: false,
      isActive: true
    });

    console.log(`[CONTAINER_TYPE] Created local container type: ${containerTypeId}`);
    return containerType;
  },

  async initializeContainerTypesIfNeeded(): Promise<void> {
    try {
      console.log('[CONTAINER_INIT] Initializing container types if needed...');
      
      // Check if we have any container types
      const existingTypes = await this.getContainerTypes();
      
      if (existingTypes.length === 0) {
        console.log('[CONTAINER_INIT] No container types found, creating default type...');
        await this.createDefaultContainerType();
      } else {
        console.log(`[CONTAINER_INIT] Found ${existingTypes.length} existing container types, skipping initialization`);
      }
      
      // Sync with SharePoint to ensure consistency
      await this.syncContainerTypesWithSharePoint();
      
    } catch (error) {
      console.error('[CONTAINER_INIT] Failed to initialize container types:', error);
      throw new Error(`Failed to initialize container types: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getContainerForProject(projectId: string): Promise<ClientContainer | undefined> {
    try {
      // Get the project with client information
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId));
      
      if (!project?.clientId) {
        return undefined;
      }
      
      // Get the client's container
      const clientContainers = await this.getClientContainers(project.clientId);
      return clientContainers[0]?.client ? clientContainers[0] : undefined;
      
    } catch (error) {
      console.error('[CONTAINER_PROJECT] Failed to get container for project:', error);
      return undefined;
    }
  },

  async validateContainerAccess(userId: string, containerId: string): Promise<boolean> {
    try {
      // Get the container with client information
      const container = await this.getClientContainer(containerId);
      if (!container) {
        return false;
      }
      
      // Check if user has access to the client through their work
      return await this.checkUserClientAccess(userId, container.client.id);
      
    } catch (error) {
      console.error('[CONTAINER_ACCESS] Failed to validate container access:', error);
      return false;
    }
  },

  async getDefaultContainerType(): Promise<ContainerType> {
    const defaultTypeId = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
    
    if (!defaultTypeId) {
      // Initialize container types if not done
      await this.initializeDefaultContainerTypes();
      
      const newDefaultTypeId = await this.getSystemSettingValue('DEFAULT_CONTAINER_TYPE_ID');
      if (!newDefaultTypeId) {
        throw new Error('No default container type configured and initialization failed');
      }
      
      return await this.ensureContainerTypeExists(newDefaultTypeId);
    }
    
    return await this.ensureContainerTypeExists(defaultTypeId);
  },

  async checkUserClientAccess(userId: string, clientId: string): Promise<boolean> {
    try {
      const timeEntryData = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeEntries)
        .leftJoin(projects, eq(timeEntries.projectId, projects.id))
        .where(and(
          eq(timeEntries.personId, userId),
          eq(projects.clientId, clientId)
        ));

      const count = Number(timeEntryData[0]?.count || 0);
      return count > 0;
    } catch (error) {
      console.error("[USER CLIENT ACCESS] Error checking user-client access:", error);
      return false;
    }
  }
};
