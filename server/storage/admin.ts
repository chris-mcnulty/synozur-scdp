import {
  users,
  clients,
  projects,
  estimates,
  systemSettings,
  vocabularyCatalog,
  organizationVocabulary,
  tenants,
  type Client,
  type Project,
  type Estimate,
  type SystemSetting,
  type InsertSystemSetting,
  type VocabularyCatalog,
  type InsertVocabularyCatalog,
  type OrganizationVocabulary,
  type InsertOrganizationVocabulary,
  type Tenant,
  type VocabularyTerms,
  DEFAULT_VOCABULARY,
  scheduledJobRuns,
  type ScheduledJobRun,
  type InsertScheduledJobRun,
  raiddEntries,
  type RaiddEntry,
  type InsertRaiddEntry,
  groundingDocuments,
  type GroundingDocument,
  type InsertGroundingDocument,
  supportTickets,
  type SupportTicket,
  type InsertSupportTicket,
  supportTicketReplies,
  type SupportTicketReply,
  type InsertSupportTicketReply,
  supportTicketPlannerSync,
  type SupportTicketPlannerSync,
  type InsertSupportTicketPlannerSync,
  crmConnections,
  type CrmConnection,
  type InsertCrmConnection,
  crmObjectMappings,
  type CrmObjectMapping,
  type InsertCrmObjectMapping,
  crmSyncLog,
  type CrmSyncLog,
  type InsertCrmSyncLog,
  aiConfiguration,
  type AiConfiguration,
  type InsertAiConfiguration,
  aiUsageLogs,
  type AiUsageLog,
  type InsertAiUsageLog,
  aiUsageAlerts,
  type AiUsageAlert,
  type InsertAiUsageAlert,
  agentCardHealthChecks,
  type AgentCardHealthCheck,
  type InsertAgentCardHealthCheck,
} from "@shared/schema";
import { db } from "../db";
import type { IStorage } from "./index";
import { eq, ne, desc, and, or, gte, lte, sql, isNotNull, isNull, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getCached, invalidate, invalidatePrefix } from "../lib/cache";

const TTL_SETTINGS = 5 * 60 * 1000;
const TTL_VOCAB = 5 * 60 * 1000;

const raiddOwnerAlias = alias(users, 'raidd_owner');
const raiddAssigneeAlias = alias(users, 'raidd_assignee');
const raiddCreatedByAlias = alias(users, 'raidd_created_by');

export const adminMethods: ThisType<IStorage & {
  getNextTicketNumber(): Promise<number>;
  getNextRaiddRefNumber(projectId: string, type: string): Promise<string>;
}> = {
  async getSystemSettings(): Promise<SystemSetting[]> {
    return getCached('system_settings:all', TTL_SETTINGS, () =>
      db.select().from(systemSettings).orderBy(systemSettings.settingKey)
    );
  },

  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    return getCached(`system_settings:${key}`, TTL_SETTINGS, async () => {
      const [setting] = await db.select()
        .from(systemSettings)
        .where(eq(systemSettings.settingKey, key));
      return setting || undefined;
    });
  },

  async getSystemSettingValue(key: string, defaultValue?: string): Promise<string> {
    const setting = await this.getSystemSetting(key);
    return setting?.settingValue || defaultValue || '';
  },

  async setSystemSetting(key: string, value: string, description?: string, settingType: string = 'string'): Promise<SystemSetting> {
    // Use cached existence check, then invalidate AFTER the write so
    // subsequent reads get the fresh value (not the pre-write cached one).
    const existingSetting = await this.getSystemSetting(key);

    let result: SystemSetting;
    if (existingSetting) {
      const [updated] = await db.update(systemSettings)
        .set({ 
          settingValue: value, 
          description: description || existingSetting.description,
          settingType,
          updatedAt: sql`now()`
        })
        .where(eq(systemSettings.settingKey, key))
        .returning();
      result = updated;
    } else {
      // Create new setting
      const [created] = await db.insert(systemSettings)
        .values({
          settingKey: key,
          settingValue: value,
          description,
          settingType
        })
        .returning();
      result = created;
    }
    // Invalidate AFTER write so the next read fetches the updated value
    invalidate(`system_settings:${key}`);
    invalidate('system_settings:all');
    return result;
  },

  async updateSystemSetting(id: string, updates: Partial<InsertSystemSetting>): Promise<SystemSetting> {
    const [updated] = await db.update(systemSettings)
      .set({ ...updates, updatedAt: sql`now()` })
      .where(eq(systemSettings.id, id))
      .returning();
    // Invalidate by key if we know it, otherwise bust the whole settings cache
    if (updated?.settingKey) {
      invalidate(`system_settings:${updated.settingKey}`);
    }
    invalidate('system_settings:all');
    return updated;
  },

  async deleteSystemSetting(id: string): Promise<void> {
    await db.delete(systemSettings)
      .where(eq(systemSettings.id, id));
    invalidate('system_settings:all');
    // Cannot know the key, so bust all per-key cache entries too
    invalidatePrefix('system_settings:');
  },

  async getOrganizationVocabulary(): Promise<VocabularyTerms> {
    const value = await this.getSystemSettingValue('ORGANIZATION_VOCABULARY');
    if (!value) {
      return {};
    }
    try {
      return JSON.parse(value) as VocabularyTerms;
    } catch {
      return {};
    }
  },

  async setOrganizationVocabulary(terms: VocabularyTerms): Promise<VocabularyTerms> {
    await this.setSystemSetting(
      'ORGANIZATION_VOCABULARY',
      JSON.stringify(terms),
      'Organization-level vocabulary defaults',
      'json'
    );
    return terms;
  },

  async getVocabularyForContext(context: { 
    projectId?: string; 
    clientId?: string; 
    estimateId?: string 
  }): Promise<Required<VocabularyTerms>> {
    let projectVocab: VocabularyTerms = {};
    let clientVocab: VocabularyTerms = {};
    let estimateVocab: VocabularyTerms = {};
    
    // Get project vocabulary if projectId provided
    if (context.projectId) {
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, context.projectId));
      if (project?.vocabularyOverrides) {
        try {
          projectVocab = JSON.parse(project.vocabularyOverrides);
        } catch {}
      }
      // Also get client vocab from project's client
      if (project?.clientId) {
        const [client] = await db.select()
          .from(clients)
          .where(eq(clients.id, project.clientId));
        if (client?.vocabularyOverrides) {
          try {
            clientVocab = JSON.parse(client.vocabularyOverrides);
          } catch {}
        }
      }
    }
    
    // Get client vocabulary if clientId provided (and not already loaded)
    if (context.clientId && !clientVocab.epic) {
      const [client] = await db.select()
        .from(clients)
        .where(eq(clients.id, context.clientId));
      if (client?.vocabularyOverrides) {
        try {
          clientVocab = JSON.parse(client.vocabularyOverrides);
        } catch {}
      }
    }
    
    // Get estimate vocabulary if estimateId provided
    if (context.estimateId) {
      const [estimate] = await db.select()
        .from(estimates)
        .where(eq(estimates.id, context.estimateId));
      if (estimate) {
        estimateVocab = {
          epic: estimate.epicLabel || undefined,
          stage: estimate.stageLabel || undefined,
          activity: estimate.activityLabel || undefined,
        };
      }
    }
    
    // Get organization defaults
    const orgVocab = await this.getOrganizationVocabulary();
    
    // Cascade: Estimate -> Project -> Client -> Organization -> Default
    return {
      epic: estimateVocab.epic || projectVocab.epic || clientVocab.epic || orgVocab.epic || DEFAULT_VOCABULARY.epic,
      stage: estimateVocab.stage || projectVocab.stage || clientVocab.stage || orgVocab.stage || DEFAULT_VOCABULARY.stage,
      activity: estimateVocab.activity || projectVocab.activity || clientVocab.activity || orgVocab.activity || DEFAULT_VOCABULARY.activity,
      workstream: projectVocab.workstream || clientVocab.workstream || orgVocab.workstream || DEFAULT_VOCABULARY.workstream,
    };
  },

  async getAllVocabularies(): Promise<{
    organization: VocabularyTerms;
    clients: Array<{ id: string; name: string; vocabulary: VocabularyTerms }>;
    projects: Array<{ id: string; name: string; code: string; clientId: string; clientName: string; vocabulary: VocabularyTerms }>;
  }> {
    const organization = await this.getOrganizationVocabulary();
    
    const allClients = await db.select()
      .from(clients)
      .where(isNotNull(clients.vocabularyOverrides));
    
    const clientVocabularies = allClients.map(client => {
      let vocabulary: VocabularyTerms = {};
      if (client.vocabularyOverrides) {
        try {
          vocabulary = JSON.parse(client.vocabularyOverrides);
        } catch {}
      }
      return {
        id: client.id,
        name: client.name,
        vocabulary
      };
    });
    
    const allProjects = await db.select({
      project: projects,
      client: clients
    })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(isNotNull(projects.vocabularyOverrides));
    
    const projectVocabularies = allProjects.map(row => {
      let vocabulary: VocabularyTerms = {};
      if (row.project.vocabularyOverrides) {
        try {
          vocabulary = JSON.parse(row.project.vocabularyOverrides);
        } catch {}
      }
      return {
        id: row.project.id,
        name: row.project.name,
        code: row.project.code,
        clientId: row.project.clientId,
        clientName: row.client?.name || 'Unknown',
        vocabulary
      };
    });
    
    return {
      organization,
      clients: clientVocabularies,
      projects: projectVocabularies
    };
  },

  async getVocabularyCatalog(): Promise<VocabularyCatalog[]> {
    return getCached('vocab_catalog:all', TTL_VOCAB, () =>
      db.select()
        .from(vocabularyCatalog)
        .where(eq(vocabularyCatalog.isActive, true))
        .orderBy(vocabularyCatalog.termType, vocabularyCatalog.sortOrder)
    );
  },

  async getVocabularyCatalogByType(termType: string): Promise<VocabularyCatalog[]> {
    return getCached(`vocab_catalog:type:${termType}`, TTL_VOCAB, () =>
      db.select()
        .from(vocabularyCatalog)
        .where(and(
          eq(vocabularyCatalog.termType, termType),
          eq(vocabularyCatalog.isActive, true)
        ))
        .orderBy(vocabularyCatalog.sortOrder)
    );
  },

  async getOrganizationVocabularySelections(tenantId?: string): Promise<OrganizationVocabulary | undefined> {
    // Tenant isolation: require tenantId for strict tenant scoping
    if (!tenantId) {
      console.warn('[VOCABULARY] getOrganizationVocabularySelections called without tenantId - returning undefined for tenant isolation');
      return undefined;
    }
    return getCached(`org_vocab:${tenantId}`, TTL_VOCAB, async () => {
      const [orgVocab] = await db.select()
        .from(organizationVocabulary)
        .where(eq(organizationVocabulary.tenantId, tenantId))
        .limit(1);
      return orgVocab || undefined;
    });
  },

  async updateOrganizationVocabularySelections(updates: Partial<InsertOrganizationVocabulary>, tenantId?: string): Promise<OrganizationVocabulary> {
    // Tenant isolation: require tenantId for write operations to prevent cross-tenant contamination
    if (!tenantId) {
      throw new Error('tenantId is required for updating organization vocabulary');
    }

    // Validate term IDs exist in catalog and match correct types
    const termValidations = [
      { id: updates.epicTermId, expectedType: 'epic' },
      { id: updates.stageTermId, expectedType: 'stage' },
      { id: updates.workstreamTermId, expectedType: 'workstream' },
      { id: updates.milestoneTermId, expectedType: 'milestone' },
      { id: updates.activityTermId, expectedType: 'activity' },
    ];

    for (const { id, expectedType } of termValidations) {
      if (id) {
        const term = await this.getVocabularyTermById(id);
        if (!term) {
          throw new Error(`Invalid term ID: ${id} does not exist in vocabulary catalog`);
        }
        if (term.termType !== expectedType) {
          throw new Error(`Invalid term type: ${id} is a ${term.termType} term, expected ${expectedType}`);
        }
      }
    }

    // Ensure only one organization vocabulary record exists per tenant (enforce single-record invariant)
    const existing = await this.getOrganizationVocabularySelections(tenantId);

    let result: OrganizationVocabulary;
    if (existing) {
      // Update existing record - strictly by tenant
      const [updated] = await db.update(organizationVocabulary)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(and(
          eq(organizationVocabulary.id, existing.id),
          eq(organizationVocabulary.tenantId, tenantId)
        ))
        .returning();
      result = updated;
    } else {
      // Create new record for this tenant (should only happen once per tenant on initial setup)
      const [created] = await db.insert(organizationVocabulary)
        .values({ ...updates, tenantId })
        .returning();
      result = created;
    }
    invalidate(`org_vocab:${tenantId}`);
    return result;
  },

  async getVocabularyTermById(termId: string): Promise<VocabularyCatalog | undefined> {
    const [term] = await db.select()
      .from(vocabularyCatalog)
      .where(eq(vocabularyCatalog.id, termId));
    return term || undefined;
  },

  async createVocabularyTerm(term: InsertVocabularyCatalog): Promise<VocabularyCatalog> {
    const [created] = await db.insert(vocabularyCatalog)
      .values({
        ...term,
        isActive: term.isActive !== undefined ? term.isActive : true,
        isSystemDefault: term.isSystemDefault !== undefined ? term.isSystemDefault : false,
        sortOrder: term.sortOrder !== undefined ? term.sortOrder : 0
      })
      .returning();
    invalidatePrefix('vocab_catalog:');
    return created;
  },

  async updateVocabularyTerm(id: string, updates: Partial<InsertVocabularyCatalog>): Promise<VocabularyCatalog> {
    const [updated] = await db.update(vocabularyCatalog)
      .set(updates)
      .where(eq(vocabularyCatalog.id, id))
      .returning();
    if (!updated) {
      throw new Error(`Vocabulary term with id ${id} not found`);
    }
    invalidatePrefix('vocab_catalog:');
    return updated;
  },

  async deleteVocabularyTerm(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await db.update(vocabularyCatalog)
      .set({ isActive: false })
      .where(eq(vocabularyCatalog.id, id));
    invalidatePrefix('vocab_catalog:');
  },

  async seedDefaultVocabulary(): Promise<void> {
    // Check if any vocabulary terms exist
    const existingTerms = await db.select()
      .from(vocabularyCatalog)
      .limit(1);
    
    if (existingTerms.length > 0) {
      console.log('Vocabulary catalog already has terms, skipping seed');
      return;
    }

    console.log('Seeding default vocabulary catalog...');
    
    const defaultTerms: InsertVocabularyCatalog[] = [
      // Epic terms
      { termType: 'epic', termValue: 'Epic', description: 'Default epic term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'epic', termValue: 'Program', description: 'Consulting/corporate term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'epic', termValue: 'Initiative', description: 'Business term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'epic', termValue: 'Release', description: 'Software development term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'epic', termValue: 'Phase', description: 'Construction/project management term', isSystemDefault: false, sortOrder: 4 },
      
      // Stage terms
      { termType: 'stage', termValue: 'Stage', description: 'Default stage term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'stage', termValue: 'Sprint', description: 'Agile/software term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'stage', termValue: 'Phase', description: 'Traditional project term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'stage', termValue: 'Iteration', description: 'Development term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'stage', termValue: 'Period', description: 'Time-based term', isSystemDefault: false, sortOrder: 4 },
      
      // Activity terms
      { termType: 'activity', termValue: 'Activity', description: 'Default activity term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'activity', termValue: 'Task', description: 'Software/general term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'activity', termValue: 'Deliverable', description: 'Consulting term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'activity', termValue: 'Action', description: 'Business term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'activity', termValue: 'Gate', description: 'Process/construction term', isSystemDefault: false, sortOrder: 4 },
      
      // Workstream terms
      { termType: 'workstream', termValue: 'Workstream', description: 'Default workstream term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'workstream', termValue: 'Feature', description: 'Software development term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'workstream', termValue: 'Category', description: 'General classification term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'workstream', termValue: 'Track', description: 'Project management term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'workstream', termValue: 'Trade', description: 'Construction term', isSystemDefault: false, sortOrder: 4 },
      
      // Milestone terms
      { termType: 'milestone', termValue: 'Milestone', description: 'Default milestone term', isSystemDefault: true, sortOrder: 0 },
      { termType: 'milestone', termValue: 'Target', description: 'Business goal term', isSystemDefault: false, sortOrder: 1 },
      { termType: 'milestone', termValue: 'Checkpoint', description: 'Progress marker term', isSystemDefault: false, sortOrder: 2 },
      { termType: 'milestone', termValue: 'Deadline', description: 'Time-based term', isSystemDefault: false, sortOrder: 3 },
      { termType: 'milestone', termValue: 'Goal', description: 'Objective term', isSystemDefault: false, sortOrder: 4 },
    ];

    await db.insert(vocabularyCatalog).values(defaultTerms);
    console.log(`Seeded ${defaultTerms.length} default vocabulary terms`);
  },

  async createScheduledJobRun(run: InsertScheduledJobRun): Promise<ScheduledJobRun> {
    const [created] = await db.insert(scheduledJobRuns)
      .values(run)
      .returning();
    return created;
  },

  async updateScheduledJobRun(id: string, updates: Partial<ScheduledJobRun>): Promise<ScheduledJobRun> {
    const [updated] = await db.update(scheduledJobRuns)
      .set(updates)
      .where(eq(scheduledJobRuns.id, id))
      .returning();
    return updated;
  },

  async getScheduledJobRunById(id: string): Promise<ScheduledJobRun | null> {
    const [run] = await db.select()
      .from(scheduledJobRuns)
      .where(eq(scheduledJobRuns.id, id))
      .limit(1);
    return run || null;
  },

  async getScheduledJobRuns(filters?: { tenantId?: string; jobType?: string; limit?: number }): Promise<ScheduledJobRun[]> {
    let query = db.select().from(scheduledJobRuns);
    
    const conditions = [];
    if (filters?.tenantId) {
      conditions.push(eq(scheduledJobRuns.tenantId, filters.tenantId));
    }
    if (filters?.jobType) {
      conditions.push(eq(scheduledJobRuns.jobType, filters.jobType));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    
    query = query.orderBy(desc(scheduledJobRuns.startedAt)) as typeof query;
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    
    return await query;
  },

  async getScheduledJobStats(tenantId?: string): Promise<{
    jobType: string;
    lastRun: Date | null;
    lastStatus: string | null;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
  }[]> {
    const conditions = tenantId ? [eq(scheduledJobRuns.tenantId, tenantId)] : [];
    
    const stats = await db.select({
      jobType: scheduledJobRuns.jobType,
      lastRun: sql<Date>`MAX(${scheduledJobRuns.startedAt})`,
      totalRuns: sql<number>`COUNT(*)::int`,
      successfulRuns: sql<number>`COUNT(*) FILTER (WHERE ${scheduledJobRuns.status} = 'completed')::int`,
      failedRuns: sql<number>`COUNT(*) FILTER (WHERE ${scheduledJobRuns.status} = 'failed')::int`,
    })
    .from(scheduledJobRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(scheduledJobRuns.jobType);

    const result = await Promise.all(stats.map(async (stat) => {
      const conditions2 = tenantId 
        ? [eq(scheduledJobRuns.tenantId, tenantId), eq(scheduledJobRuns.jobType, stat.jobType)]
        : [eq(scheduledJobRuns.jobType, stat.jobType)];
      
      const [lastRunRecord] = await db.select({ status: scheduledJobRuns.status })
        .from(scheduledJobRuns)
        .where(and(...conditions2))
        .orderBy(desc(scheduledJobRuns.startedAt))
        .limit(1);
      
      return {
        ...stat,
        lastStatus: lastRunRecord?.status || null,
      };
    }));

    return result;
  },

  async getRaiddEntries(projectId: string, filters?: { type?: string; status?: string; priority?: string; ownerId?: string; assigneeId?: string }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string })[]> {
    // Single query: owner/assignee/createdBy user names resolved via LEFT JOINs — no N+1.
    const conditions = [eq(raiddEntries.projectId, projectId)];
    if (filters?.type) conditions.push(eq(raiddEntries.type, filters.type));
    if (filters?.status) conditions.push(eq(raiddEntries.status, filters.status));
    if (filters?.priority) conditions.push(eq(raiddEntries.priority, filters.priority));
    if (filters?.ownerId) conditions.push(eq(raiddEntries.ownerId, filters.ownerId));
    if (filters?.assigneeId) conditions.push(eq(raiddEntries.assigneeId, filters.assigneeId));

    const rows = await db.select({
      entry: raiddEntries,
      ownerName: raiddOwnerAlias.name,
      assigneeName: raiddAssigneeAlias.name,
      createdByName: raiddCreatedByAlias.name,
    })
    .from(raiddEntries)
    .leftJoin(raiddOwnerAlias, eq(raiddEntries.ownerId, raiddOwnerAlias.id))
    .leftJoin(raiddAssigneeAlias, eq(raiddEntries.assigneeId, raiddAssigneeAlias.id))
    .leftJoin(raiddCreatedByAlias, eq(raiddEntries.createdBy, raiddCreatedByAlias.id))
    .where(and(...conditions))
    .orderBy(desc(raiddEntries.createdAt));

    return rows.map(r => ({
      ...r.entry,
      ownerName: r.ownerName ?? undefined,
      assigneeName: r.assigneeName ?? undefined,
      createdByName: r.createdByName ?? undefined,
    }));
  },

  async getRaiddEntry(id: string): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string }) | undefined> {
    const [row] = await db.select({
      entry: raiddEntries,
      ownerName: raiddOwnerAlias.name,
      assigneeName: raiddAssigneeAlias.name,
      createdByName: raiddCreatedByAlias.name,
    })
    .from(raiddEntries)
    .leftJoin(raiddOwnerAlias, eq(raiddEntries.ownerId, raiddOwnerAlias.id))
    .leftJoin(raiddAssigneeAlias, eq(raiddEntries.assigneeId, raiddAssigneeAlias.id))
    .leftJoin(raiddCreatedByAlias, eq(raiddEntries.createdBy, raiddCreatedByAlias.id))
    .where(eq(raiddEntries.id, id));

    if (!row) return undefined;
    return {
      ...row.entry,
      ownerName: row.ownerName ?? undefined,
      assigneeName: row.assigneeName ?? undefined,
      createdByName: row.createdByName ?? undefined,
    };
  },

  async createRaiddEntry(entry: InsertRaiddEntry): Promise<RaiddEntry> {
    const refNumber = await this.getNextRaiddRefNumber(entry.projectId, entry.type);
    const [created] = await db.insert(raiddEntries).values({ ...entry, refNumber }).returning();
    return created;
  },

  async updateRaiddEntry(id: string, updates: Partial<InsertRaiddEntry>): Promise<RaiddEntry> {
    const existing = await this.getRaiddEntry(id);
    if (!existing) throw new Error('RAIDD entry not found');
    if (existing.type === 'decision' && existing.status !== 'open') {
      const allowedFields = ['resolutionNotes', 'updatedBy'];
      const attemptedFields = Object.keys(updates).filter(k => !allowedFields.includes(k));
      if (attemptedFields.length > 0) {
        throw new Error('Decisions cannot be modified after they are accepted. Create a superseding decision instead.');
      }
    }

    const closingStatuses = ['closed', 'resolved', 'mitigated', 'accepted'];
    const closedAt = updates.status && closingStatuses.includes(updates.status) && !existing.closedAt
      ? new Date()
      : undefined;

    const [updated] = await db.update(raiddEntries)
      .set({ ...updates, updatedAt: new Date(), ...(closedAt ? { closedAt } : {}) })
      .where(eq(raiddEntries.id, id))
      .returning();
    return updated;
  },

  async deleteRaiddEntry(id: string): Promise<void> {
    const childEntries = await db.select({ id: raiddEntries.id })
      .from(raiddEntries)
      .where(eq(raiddEntries.parentEntryId, id));
    if (childEntries.length > 0) {
      throw new Error('Cannot delete entry with linked action items. Remove linked items first.');
    }
    await db.delete(raiddEntries).where(eq(raiddEntries.id, id));
  },

  async convertRiskToIssue(riskId: string, updatedBy: string): Promise<RaiddEntry> {
    const risk = await this.getRaiddEntry(riskId);
    if (!risk) throw new Error('Risk not found');
    if (risk.type !== 'risk') throw new Error('Only risks can be converted to issues');

    await db.update(raiddEntries)
      .set({ status: 'closed', updatedBy, updatedAt: new Date(), closedAt: new Date(), resolutionNotes: 'Converted to issue' })
      .where(eq(raiddEntries.id, riskId));

    const refNumber = await this.getNextRaiddRefNumber(risk.projectId, 'issue');
    const [issue] = await db.insert(raiddEntries).values({
      tenantId: risk.tenantId,
      projectId: risk.projectId,
      type: 'issue',
      refNumber,
      title: risk.title,
      description: risk.description,
      status: 'open',
      priority: risk.priority,
      impact: risk.impact,
      ownerId: risk.ownerId,
      assigneeId: risk.assigneeId,
      dueDate: risk.dueDate,
      category: risk.category,
      convertedFromId: riskId,
      tags: risk.tags,
      createdBy: updatedBy,
      updatedBy,
    }).returning();

    return issue;
  },

  async supersedeDecision(decisionId: string, newEntry: InsertRaiddEntry): Promise<RaiddEntry> {
    const decision = await this.getRaiddEntry(decisionId);
    if (!decision) throw new Error('Decision not found');
    if (decision.type !== 'decision') throw new Error('Only decisions can be superseded');

    const refNumber = await this.getNextRaiddRefNumber(decision.projectId, 'decision');
    const [newDecision] = await db.insert(raiddEntries).values({
      ...newEntry,
      type: 'decision',
      refNumber,
      convertedFromId: decisionId,
    }).returning();

    await db.update(raiddEntries)
      .set({ status: 'superseded', supersededById: newDecision.id, updatedAt: new Date() })
      .where(eq(raiddEntries.id, decisionId));

    return newDecision;
  },

  async getNextRaiddRefNumber(projectId: string, type: string): Promise<string> {
    const prefix = { risk: 'R', issue: 'I', decision: 'D', dependency: 'DEP', action_item: 'A' }[type] || 'X';
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(raiddEntries)
      .where(and(eq(raiddEntries.projectId, projectId), eq(raiddEntries.type, type)));
    const nextNum = (Number(result?.count) || 0) + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
  },

  async getPortfolioRaiddEntries(tenantId: string, filters?: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]> {
    const conditions: SQL[] = [eq(raiddEntries.tenantId, tenantId)];
    if (filters?.type) conditions.push(eq(raiddEntries.type, filters.type));
    if (filters?.status) conditions.push(eq(raiddEntries.status, filters.status));
    if (filters?.priority) conditions.push(eq(raiddEntries.priority, filters.priority));
    if (filters?.projectId) conditions.push(eq(raiddEntries.projectId, filters.projectId));
    if (filters?.activeProjectsOnly !== false) {
      conditions.push(eq(projects.status, 'active'));
    }

    const rows = await db.select({
      entry: raiddEntries,
      ownerName: raiddOwnerAlias.name,
      assigneeName: raiddAssigneeAlias.name,
      createdByName: raiddCreatedByAlias.name,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(raiddEntries)
    .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(raiddOwnerAlias, eq(raiddEntries.ownerId, raiddOwnerAlias.id))
    .leftJoin(raiddAssigneeAlias, eq(raiddEntries.assigneeId, raiddAssigneeAlias.id))
    .leftJoin(raiddCreatedByAlias, eq(raiddEntries.createdBy, raiddCreatedByAlias.id))
    .where(and(...conditions))
    .orderBy(desc(raiddEntries.createdAt));

    return rows.map(r => ({
      ...r.entry,
      ownerName: r.ownerName ?? undefined,
      assigneeName: r.assigneeName ?? undefined,
      createdByName: r.createdByName ?? undefined,
      projectName: r.projectName ?? undefined,
      clientName: r.clientName ?? undefined,
    }));
  },

  async getPortfolioRaiddEntriesPaginated(tenantId: string, filters: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean; limit: number; offset: number }): Promise<{ items: (RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]; total: number; hasMore: boolean; limit: number; offset: number; summary: { totalEntries: number; openRisks: number; openIssues: number; openActionItems: number; openDependencies: number; recentDecisions: number; criticalItems: number; highPriorityItems: number; overdueActionItems: number; closedThisMonth: number; projectsWithEntries: number }; projectList: { id: string; name: string }[] }> {
    const activeOnly = filters.activeProjectsOnly !== false;

    // Build base conditions (for the paged query AND summary queries)
    const makeConditions = () => {
      const conds: SQL[] = [eq(raiddEntries.tenantId, tenantId)];
      if (filters.type) conds.push(eq(raiddEntries.type, filters.type));
      if (filters.status) conds.push(eq(raiddEntries.status, filters.status));
      if (filters.priority) conds.push(eq(raiddEntries.priority, filters.priority));
      if (filters.projectId) conds.push(eq(raiddEntries.projectId, filters.projectId));
      return conds;
    };

    // Base subquery builder (joins projects for activeOnly filter)
    const baseQuery = () => {
      const conds = makeConditions();
      if (activeOnly) conds.push(eq(projects.status, 'active'));
      const whereClause = and(...conds);
      return { whereClause, activeOnly };
    };

    const { whereClause } = baseQuery();

    // 1. Count query (SQL COUNT — no row fetching)
    const countRows = await db.select({ count: sql<number>`COUNT(*)` })
      .from(raiddEntries)
      .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
      .where(whereClause);
    const total = Number(countRows[0]?.count || 0);

    // 2. Paged row query (limit + offset in SQL)
    const pageRows = await db.select({
      entry: raiddEntries,
      ownerName: raiddOwnerAlias.name,
      assigneeName: raiddAssigneeAlias.name,
      createdByName: raiddCreatedByAlias.name,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(raiddEntries)
    .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(raiddOwnerAlias, eq(raiddEntries.ownerId, raiddOwnerAlias.id))
    .leftJoin(raiddAssigneeAlias, eq(raiddEntries.assigneeId, raiddAssigneeAlias.id))
    .leftJoin(raiddCreatedByAlias, eq(raiddEntries.createdBy, raiddCreatedByAlias.id))
    .where(whereClause)
    .orderBy(desc(raiddEntries.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);

    const items = pageRows.map(r => ({
      ...r.entry,
      ownerName: r.ownerName ?? undefined,
      assigneeName: r.assigneeName ?? undefined,
      createdByName: r.createdByName ?? undefined,
      projectName: r.projectName ?? undefined,
      clientName: r.clientName ?? undefined,
    }));

    // 3. Summary via SQL aggregate queries (no full scan in JS)
    // Build summary conditions WITHOUT type/status/priority filter (summary is over all entries matching tenant+project)
    const summaryConds: SQL[] = [eq(raiddEntries.tenantId, tenantId)];
    if (filters.projectId) summaryConds.push(eq(raiddEntries.projectId, filters.projectId));
    if (activeOnly) summaryConds.push(eq(projects.status, 'active'));
    const summaryWhere = and(...summaryConds);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nowIso = now.toISOString();

    const summaryRows = await db.select({
      total: sql<number>`COUNT(*)`,
      openRisks: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'risk' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      openIssues: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'issue' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      openActionItems: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'action_item' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      openDependencies: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'dependency' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      recentDecisions: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'decision' AND ${raiddEntries.status} != 'superseded')`,
      criticalItems: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.priority} = 'critical' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      highPriorityItems: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.priority} = 'high' AND ${raiddEntries.status} IN ('open','in_progress'))`,
      overdueActionItems: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.type} = 'action_item' AND ${raiddEntries.dueDate} < ${nowIso} AND ${raiddEntries.status} IN ('open','in_progress'))`,
      closedThisMonth: sql<number>`COUNT(*) FILTER (WHERE ${raiddEntries.closedAt} >= ${monthStart} AND ${raiddEntries.closedAt} < ${nowIso})`,
      projectCount: sql<number>`COUNT(DISTINCT ${raiddEntries.projectId})`,
    })
    .from(raiddEntries)
    .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
    .where(summaryWhere);

    const sr = summaryRows[0];
    const summary = {
      totalEntries: Number(sr?.total || 0),
      openRisks: Number(sr?.openRisks || 0),
      openIssues: Number(sr?.openIssues || 0),
      openActionItems: Number(sr?.openActionItems || 0),
      openDependencies: Number(sr?.openDependencies || 0),
      recentDecisions: Number(sr?.recentDecisions || 0),
      criticalItems: Number(sr?.criticalItems || 0),
      highPriorityItems: Number(sr?.highPriorityItems || 0),
      overdueActionItems: Number(sr?.overdueActionItems || 0),
      closedThisMonth: Number(sr?.closedThisMonth || 0),
      projectsWithEntries: Number(sr?.projectCount || 0),
    };

    // 4. Project list via bounded DISTINCT query
    const projectRows = await db.selectDistinct({
      id: raiddEntries.projectId,
      name: projects.name,
    })
    .from(raiddEntries)
    .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
    .where(summaryWhere)
    .orderBy(projects.name);

    const projectList = projectRows.map(r => ({ id: r.id, name: r.name || '' }));

    return {
      items,
      total,
      hasMore: filters.offset + filters.limit < total,
      limit: filters.limit,
      offset: filters.offset,
      summary,
      projectList,
    };
  },

  async getMyRaiddEntries(userId: string, tenantId: string, filters?: { type?: string; status?: string; priority?: string; projectId?: string }): Promise<(RaiddEntry & { ownerName?: string; assigneeName?: string; createdByName?: string; projectName?: string; clientName?: string })[]> {
    const conditions: SQL[] = [
      eq(raiddEntries.tenantId, tenantId),
      or(eq(raiddEntries.ownerId, userId), eq(raiddEntries.assigneeId, userId))!,
    ];
    if (filters?.type) conditions.push(eq(raiddEntries.type, filters.type));
    if (filters?.status) conditions.push(eq(raiddEntries.status, filters.status));
    if (filters?.priority) conditions.push(eq(raiddEntries.priority, filters.priority));
    if (filters?.projectId) conditions.push(eq(raiddEntries.projectId, filters.projectId));

    const rows = await db.select({
      entry: raiddEntries,
      ownerName: raiddOwnerAlias.name,
      assigneeName: raiddAssigneeAlias.name,
      createdByName: raiddCreatedByAlias.name,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(raiddEntries)
    .innerJoin(projects, eq(raiddEntries.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(raiddOwnerAlias, eq(raiddEntries.ownerId, raiddOwnerAlias.id))
    .leftJoin(raiddAssigneeAlias, eq(raiddEntries.assigneeId, raiddAssigneeAlias.id))
    .leftJoin(raiddCreatedByAlias, eq(raiddEntries.createdBy, raiddCreatedByAlias.id))
    .where(and(...conditions))
    .orderBy(desc(raiddEntries.createdAt));

    return rows.map(r => ({
      ...r.entry,
      ownerName: r.ownerName ?? undefined,
      assigneeName: r.assigneeName ?? undefined,
      createdByName: r.createdByName ?? undefined,
      projectName: r.projectName ?? undefined,
      clientName: r.clientName ?? undefined,
    }));
  },

  async getGroundingDocuments(filters?: { tenantId?: string | null; category?: string; isActive?: boolean }): Promise<GroundingDocument[]> {
    const conditions: SQL[] = [];
    if (filters?.tenantId !== undefined) {
      if (filters.tenantId === null) {
        conditions.push(isNull(groundingDocuments.tenantId));
      } else {
        conditions.push(eq(groundingDocuments.tenantId, filters.tenantId));
      }
    }
    if (filters?.category) {
      conditions.push(eq(groundingDocuments.category, filters.category));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(groundingDocuments.isActive, filters.isActive));
    }

    return await db.select()
      .from(groundingDocuments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(groundingDocuments.priority), groundingDocuments.category, groundingDocuments.title);
  },

  async getGroundingDocument(id: string): Promise<GroundingDocument | undefined> {
    const [doc] = await db.select()
      .from(groundingDocuments)
      .where(eq(groundingDocuments.id, id));
    return doc;
  },

  async getGlobalGroundingDocuments(): Promise<GroundingDocument[]> {
    return this.getGroundingDocuments({ tenantId: null });
  },

  async getTenantGroundingDocuments(tenantId: string): Promise<GroundingDocument[]> {
    return this.getGroundingDocuments({ tenantId });
  },

  async getActiveGroundingDocuments(): Promise<GroundingDocument[]> {
    return await db.select()
      .from(groundingDocuments)
      .where(and(eq(groundingDocuments.isActive, true), isNull(groundingDocuments.tenantId)))
      .orderBy(desc(groundingDocuments.priority), groundingDocuments.category);
  },

  async getActiveGroundingDocumentsForTenant(tenantId: string): Promise<GroundingDocument[]> {
    return await db.select()
      .from(groundingDocuments)
      .where(and(
        eq(groundingDocuments.isActive, true),
        or(isNull(groundingDocuments.tenantId), eq(groundingDocuments.tenantId, tenantId))
      ))
      .orderBy(desc(groundingDocuments.priority), groundingDocuments.category);
  },

  async createGroundingDocument(doc: InsertGroundingDocument): Promise<GroundingDocument> {
    const [created] = await db.insert(groundingDocuments).values(doc).returning();
    return created;
  },

  async updateGroundingDocument(id: string, updates: Partial<InsertGroundingDocument>): Promise<GroundingDocument> {
    const [updated] = await db.update(groundingDocuments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(groundingDocuments.id, id))
      .returning();
    if (!updated) throw new Error("Grounding document not found");
    return updated;
  },

  async deleteGroundingDocument(id: string): Promise<void> {
    await db.delete(groundingDocuments).where(eq(groundingDocuments.id, id));
  },

  async getSupportTicketsByUserId(userId: string): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt));
  },

  async getSupportTicketsByTenantId(tenantId: string, status?: string): Promise<SupportTicket[]> {
    const conditions = [eq(supportTickets.tenantId, tenantId)];
    if (status) conditions.push(eq(supportTickets.status, status));
    return await db.select().from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.createdAt));
  },

  async getAllSupportTickets(filters?: { status?: string | string[]; priority?: string; category?: string; tenantId?: string }): Promise<SupportTicket[]> {
    const conditions: SQL[] = [];
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(supportTickets.status, filters.status));
      } else {
        conditions.push(eq(supportTickets.status, filters.status));
      }
    }
    if (filters?.priority) conditions.push(eq(supportTickets.priority, filters.priority));
    if (filters?.category) conditions.push(eq(supportTickets.category, filters.category));
    if (filters?.tenantId) conditions.push(eq(supportTickets.tenantId, filters.tenantId));

    const query = conditions.length > 0
      ? db.select().from(supportTickets).where(and(...conditions))
      : db.select().from(supportTickets);

    return await query.orderBy(desc(supportTickets.createdAt));
  },

  async getSupportTicketById(id: string): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return ticket;
  },

  async createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket> {
    const ticketNumber = await this.getNextTicketNumber();
    const [created] = await db.insert(supportTickets).values({
      ...ticket,
      ticketNumber,
      applicationSource: 'Constellation',
    }).returning();
    return created;
  },

  async updateSupportTicket(id: string, updates: Partial<InsertSupportTicket>): Promise<SupportTicket> {
    const [updated] = await db.update(supportTickets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return updated;
  },

  async getNextTicketNumber(): Promise<number> {
    const result = await db.select({ maxNum: sql<number>`COALESCE(MAX(${supportTickets.ticketNumber}), 0)` })
      .from(supportTickets);
    return (result[0]?.maxNum || 0) + 1;
  },

  async getSupportTicketReplies(ticketId: string, includeInternal: boolean = false): Promise<SupportTicketReply[]> {
    const conditions = [eq(supportTicketReplies.ticketId, ticketId)];
    if (!includeInternal) {
      conditions.push(eq(supportTicketReplies.isInternal, false));
    }
    return await db.select().from(supportTicketReplies)
      .where(and(...conditions))
      .orderBy(supportTicketReplies.createdAt);
  },

  async createSupportTicketReply(reply: InsertSupportTicketReply): Promise<SupportTicketReply> {
    const [created] = await db.insert(supportTicketReplies).values(reply).returning();
    await db.update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, reply.ticketId));
    return created;
  },

  async createSupportTicketPlannerSync(sync: InsertSupportTicketPlannerSync): Promise<SupportTicketPlannerSync> {
    const [created] = await db.insert(supportTicketPlannerSync).values(sync).returning();
    return created;
  },

  async getSupportTicketPlannerSyncByTicketId(ticketId: string): Promise<SupportTicketPlannerSync | undefined> {
    const [record] = await db.select().from(supportTicketPlannerSync)
      .where(eq(supportTicketPlannerSync.ticketId, ticketId));
    return record;
  },

  async getSupportTicketPlannerSyncByTaskId(taskId: string): Promise<SupportTicketPlannerSync | undefined> {
    const [record] = await db.select().from(supportTicketPlannerSync)
      .where(eq(supportTicketPlannerSync.taskId, taskId));
    return record;
  },

  async getSupportTicketPlannerSyncsByTenant(tenantId: string): Promise<SupportTicketPlannerSync[]> {
    return await db.select().from(supportTicketPlannerSync)
      .where(eq(supportTicketPlannerSync.tenantId, tenantId));
  },

  async updateSupportTicketPlannerSync(id: string, updates: Partial<InsertSupportTicketPlannerSync>): Promise<SupportTicketPlannerSync> {
    const [updated] = await db.update(supportTicketPlannerSync)
      .set({ ...updates, lastSyncedAt: new Date() })
      .where(eq(supportTicketPlannerSync.id, id))
      .returning();
    return updated;
  },

  async getTenantsWithSupportPlannerEnabled(): Promise<Tenant[]> {
    return await db.select().from(tenants)
      .where(and(
        eq(tenants.supportPlannerEnabled, true),
        isNotNull(tenants.supportPlannerPlanId)
      ));
  },

  async getOpenSupportTicketSyncsByTenant(tenantId: string): Promise<(SupportTicketPlannerSync & { ticketStatus: string })[]> {
    const results = await db.select({
      id: supportTicketPlannerSync.id,
      ticketId: supportTicketPlannerSync.ticketId,
      tenantId: supportTicketPlannerSync.tenantId,
      planId: supportTicketPlannerSync.planId,
      taskId: supportTicketPlannerSync.taskId,
      taskTitle: supportTicketPlannerSync.taskTitle,
      bucketId: supportTicketPlannerSync.bucketId,
      bucketName: supportTicketPlannerSync.bucketName,
      lastSyncedAt: supportTicketPlannerSync.lastSyncedAt,
      syncStatus: supportTicketPlannerSync.syncStatus,
      syncError: supportTicketPlannerSync.syncError,
      remoteEtag: supportTicketPlannerSync.remoteEtag,
      createdAt: supportTicketPlannerSync.createdAt,
      ticketStatus: supportTickets.status,
    }).from(supportTicketPlannerSync)
      .innerJoin(supportTickets, eq(supportTicketPlannerSync.ticketId, supportTickets.id))
      .where(and(
        eq(supportTicketPlannerSync.tenantId, tenantId),
        ne(supportTickets.status, 'resolved')
      ));
    return results;
  },

  async getCrmConnection(tenantId: string, provider: string): Promise<CrmConnection | undefined> {
    const [conn] = await db.select().from(crmConnections)
      .where(and(eq(crmConnections.tenantId, tenantId), eq(crmConnections.crmProvider, provider)));
    return conn;
  },

  async upsertCrmConnection(data: InsertCrmConnection): Promise<CrmConnection> {
    const existing = await this.getCrmConnection(data.tenantId, data.crmProvider);
    if (existing) {
      const [updated] = await db.update(crmConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(crmConnections.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(crmConnections).values(data).returning();
    return created;
  },

  async updateCrmConnection(id: string, updates: Partial<InsertCrmConnection>): Promise<CrmConnection> {
    const [updated] = await db.update(crmConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(crmConnections.id, id))
      .returning();
    return updated;
  },

  async updateCrmSyncStatus(tenantId: string, provider: string, status: string, error?: string | null): Promise<void> {
    await db.update(crmConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: error || null,
        updatedAt: new Date(),
      })
      .where(and(eq(crmConnections.tenantId, tenantId), eq(crmConnections.crmProvider, provider)));
  },

  async getCrmObjectMapping(tenantId: string, provider: string, crmObjectType: string, crmObjectId: string): Promise<CrmObjectMapping | undefined> {
    const [mapping] = await db.select().from(crmObjectMappings)
      .where(and(
        eq(crmObjectMappings.tenantId, tenantId),
        eq(crmObjectMappings.crmProvider, provider),
        eq(crmObjectMappings.crmObjectType, crmObjectType),
        eq(crmObjectMappings.crmObjectId, crmObjectId),
      ));
    return mapping;
  },

  async getCrmObjectMappingByLocal(tenantId: string, provider: string, localObjectType: string, localObjectId: string): Promise<CrmObjectMapping | undefined> {
    const [mapping] = await db.select().from(crmObjectMappings)
      .where(and(
        eq(crmObjectMappings.tenantId, tenantId),
        eq(crmObjectMappings.crmProvider, provider),
        eq(crmObjectMappings.localObjectType, localObjectType),
        eq(crmObjectMappings.localObjectId, localObjectId),
      ));
    return mapping;
  },

  async getCrmObjectMappings(tenantId: string, provider: string, crmObjectType?: string): Promise<CrmObjectMapping[]> {
    const conditions = [
      eq(crmObjectMappings.tenantId, tenantId),
      eq(crmObjectMappings.crmProvider, provider),
    ];
    if (crmObjectType) {
      conditions.push(eq(crmObjectMappings.crmObjectType, crmObjectType));
    }
    return await db.select().from(crmObjectMappings).where(and(...conditions));
  },

  async createCrmObjectMapping(data: InsertCrmObjectMapping): Promise<CrmObjectMapping> {
    const [created] = await db.insert(crmObjectMappings).values(data).returning();
    return created;
  },

  async deleteCrmObjectMapping(id: string): Promise<void> {
    await db.delete(crmObjectMappings).where(eq(crmObjectMappings.id, id));
  },

  async createCrmSyncLog(data: InsertCrmSyncLog): Promise<CrmSyncLog> {
    const [created] = await db.insert(crmSyncLog).values(data).returning();
    return created;
  },

  async getCrmSyncLogs(tenantId: string, provider: string, limit: number = 50): Promise<CrmSyncLog[]> {
    return await db.select().from(crmSyncLog)
      .where(and(eq(crmSyncLog.tenantId, tenantId), eq(crmSyncLog.crmProvider, provider)))
      .orderBy(desc(crmSyncLog.createdAt))
      .limit(limit);
  },

  async getAiConfiguration(): Promise<AiConfiguration | undefined> {
    const rows = await db.select().from(aiConfiguration).limit(1);
    return rows[0];
  },

  async updateAiConfiguration(config: Partial<InsertAiConfiguration>): Promise<AiConfiguration> {
    const existing = await this.getAiConfiguration();
    if (existing) {
      const [updated] = await db.update(aiConfiguration)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(aiConfiguration.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(aiConfiguration)
      .values(config as InsertAiConfiguration)
      .returning();
    return created;
  },

  async createAiUsageLog(log: InsertAiUsageLog): Promise<AiUsageLog> {
    const [result] = await db.insert(aiUsageLogs).values(log).returning();
    return result;
  },

  async getAiUsageStats(filters: {
    tenantId?: string;
    startDate?: Date;
    endDate?: Date;
    feature?: string;
    provider?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    logs: AiUsageLog[];
    totalRequests: number;
    totalTokens: number;
    totalCostMicrodollars: number;
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    byFeature: Record<string, { requests: number; tokens: number; cost: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const conditions: SQL[] = [];
    if (filters.tenantId) conditions.push(eq(aiUsageLogs.tenantId, filters.tenantId));
    if (filters.startDate) conditions.push(gte(aiUsageLogs.createdAt, filters.startDate));
    if (filters.endDate) conditions.push(lte(aiUsageLogs.createdAt, filters.endDate));
    if (filters.feature) conditions.push(eq(aiUsageLogs.feature, filters.feature));
    if (filters.provider) conditions.push(eq(aiUsageLogs.provider, filters.provider));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db.select().from(aiUsageLogs)
      .where(whereClause)
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);

    const aggregateRows = await db.select({
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
      totalCost: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostMicrodollars}), 0)::int`,
    }).from(aiUsageLogs).where(whereClause);
    const agg = aggregateRows[0] || { totalRequests: 0, totalTokens: 0, totalCost: 0 };

    const modelRows = await db.select({
      model: aiUsageLogs.model,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostMicrodollars}), 0)::int`,
    }).from(aiUsageLogs).where(whereClause).groupBy(aiUsageLogs.model);
    const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
    for (const row of modelRows) {
      byModel[row.model] = { requests: row.requests, tokens: row.tokens, cost: row.cost };
    }

    const featureRows = await db.select({
      feature: aiUsageLogs.feature,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostMicrodollars}), 0)::int`,
    }).from(aiUsageLogs).where(whereClause).groupBy(aiUsageLogs.feature);
    const byFeature: Record<string, { requests: number; tokens: number; cost: number }> = {};
    for (const row of featureRows) {
      byFeature[row.feature] = { requests: row.requests, tokens: row.tokens, cost: row.cost };
    }

    const dailyRows = await db.select({
      date: sql<string>`to_char(${aiUsageLogs.createdAt}, 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${aiUsageLogs.estimatedCostMicrodollars}), 0)::int`,
    }).from(aiUsageLogs).where(whereClause)
      .groupBy(sql`to_char(${aiUsageLogs.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${aiUsageLogs.createdAt}, 'YYYY-MM-DD')`);

    return {
      logs,
      totalRequests: agg.totalRequests,
      totalTokens: agg.totalTokens,
      totalCostMicrodollars: agg.totalCost,
      byModel,
      byFeature,
      dailyUsage: dailyRows.map(r => ({ date: r.date, requests: r.requests, tokens: r.tokens, cost: r.cost })),
    };
  },

  async getMonthlyTokenTotal(periodMonth: string): Promise<number> {
    const [year, month] = periodMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const result = await db.select({
      total: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
    }).from(aiUsageLogs)
      .where(and(
        gte(aiUsageLogs.createdAt, startDate),
        lte(aiUsageLogs.createdAt, endDate),
      ));

    return result[0]?.total ?? 0;
  },

  async getAiUsageAlert(periodMonth: string, thresholdPercent: number): Promise<AiUsageAlert | undefined> {
    const [result] = await db.select().from(aiUsageAlerts)
      .where(and(
        eq(aiUsageAlerts.periodMonth, periodMonth),
        eq(aiUsageAlerts.thresholdPercent, thresholdPercent),
      ))
      .limit(1);
    return result;
  },

  async createAiUsageAlert(alert: InsertAiUsageAlert): Promise<AiUsageAlert> {
    const [result] = await db.insert(aiUsageAlerts).values(alert).returning();
    return result;
  },

  async getAiUsageAlerts(periodMonth?: string): Promise<AiUsageAlert[]> {
    if (periodMonth) {
      return db.select().from(aiUsageAlerts)
        .where(eq(aiUsageAlerts.periodMonth, periodMonth))
        .orderBy(desc(aiUsageAlerts.alertedAt));
    }
    return db.select().from(aiUsageAlerts)
      .orderBy(desc(aiUsageAlerts.alertedAt))
      .limit(50);
  },

  async saveAgentCardHealthCheck(result: InsertAgentCardHealthCheck): Promise<AgentCardHealthCheck> {
    const [created] = await db.insert(agentCardHealthChecks).values(result).returning();
    return created;
  },

  async getAgentCardHealthChecks(limit: number = 50): Promise<AgentCardHealthCheck[]> {
    return db.select()
      .from(agentCardHealthChecks)
      .orderBy(desc(agentCardHealthChecks.checkedAt))
      .limit(limit);
  },

  async pruneAgentCardHealthHistory(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await db.delete(agentCardHealthChecks)
      .where(lte(agentCardHealthChecks.checkedAt, cutoff))
      .returning({ id: agentCardHealthChecks.id });
    return result.length;
  },
};
