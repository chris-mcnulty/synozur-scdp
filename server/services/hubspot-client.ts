import { Client } from '@hubspot/api-client';
import { storage } from '../storage.js';

interface TenantOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  hubspotClientId: string;
  hubspotClientSecret: string;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function getTenantTokens(tenantId: string): Promise<TenantOAuthTokens> {
  const connection = await storage.getCrmConnection(tenantId, "hubspot");
  if (!connection) {
    throw new Error('HubSpot is not configured for this organization');
  }

  const settings = (connection.settings || {}) as Record<string, any>;

  if (!settings.accessToken || !settings.refreshToken) {
    throw new Error('HubSpot is not connected for this organization. Please connect via Organization Settings.');
  }

  if (!settings.hubspotClientId || !settings.hubspotClientSecret) {
    throw new Error('HubSpot OAuth credentials not configured for this organization');
  }

  return {
    accessToken: settings.accessToken,
    refreshToken: settings.refreshToken,
    expiresAt: settings.expiresAt || 0,
    hubspotClientId: settings.hubspotClientId,
    hubspotClientSecret: settings.hubspotClientSecret,
  };
}

async function refreshTokenIfNeeded(tenantId: string): Promise<string> {
  const tokens = await getTenantTokens(tenantId);

  if (tokens.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }

  console.log(`[HubSpot] Refreshing token for tenant ${tenantId}`);

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: tokens.hubspotClientId,
      client_secret: tokens.hubspotClientSecret,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[HubSpot] Token refresh failed for tenant ${tenantId}:`, errText);
    throw new Error('HubSpot token refresh failed. Please reconnect in Organization Settings.');
  }

  const data = await response.json() as any;

  const connection = await storage.getCrmConnection(tenantId, "hubspot");
  const existingSettings = (connection?.settings || {}) as Record<string, any>;

  await storage.upsertCrmConnection({
    tenantId,
    crmProvider: "hubspot",
    settings: {
      ...existingSettings,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    },
  });

  return data.access_token;
}

async function getHubSpotClient(tenantId: string): Promise<Client> {
  const accessToken = await refreshTokenIfNeeded(tenantId);
  return new Client({ accessToken });
}

async function getAccessTokenForTenant(tenantId: string): Promise<string> {
  return refreshTokenIfNeeded(tenantId);
}

export interface HubSpotDealStage {
  id: string;
  label: string;
  probability: number;
  displayOrder: number;
}

export interface HubSpotPipeline {
  id: string;
  label: string;
  stages: HubSpotDealStage[];
}

export interface HubSpotDeal {
  id: string;
  dealName: string;
  amount: string | null;
  dealStage: string;
  dealStageName: string;
  pipeline: string;
  pipelineName: string;
  probability: number;
  closeDate: string | null;
  ownerName: string | null;
  companyName: string | null;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getHubSpotPipelines(tenantId: string): Promise<HubSpotPipeline[]> {
  const client = await getHubSpotClient(tenantId);
  const response = await client.crm.pipelines.pipelinesApi.getAll('deals');

  return response.results.map(pipeline => ({
    id: pipeline.id,
    label: pipeline.label,
    stages: pipeline.stages.map(stage => ({
      id: stage.id,
      label: stage.label,
      probability: parseFloat((stage.metadata as any)?.probability || '0'),
      displayOrder: stage.displayOrder,
    })).sort((a, b) => a.displayOrder - b.displayOrder),
  }));
}

export async function getHubSpotDealsAboveThreshold(tenantId: string, probabilityThreshold: number): Promise<HubSpotDeal[]> {
  const client = await getHubSpotClient(tenantId);
  const pipelines = await getHubSpotPipelines(tenantId);

  const stageMap = new Map<string, { name: string; probability: number; pipelineId: string; pipelineName: string }>();
  const qualifyingStageIds: string[] = [];

  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stageMap.set(stage.id, {
        name: stage.label,
        probability: stage.probability,
        pipelineId: pipeline.id,
        pipelineName: pipeline.label,
      });
      if (stage.probability * 100 >= probabilityThreshold) {
        qualifyingStageIds.push(stage.id);
      }
    }
  }

  if (qualifyingStageIds.length === 0) {
    return [];
  }

  const allDeals: HubSpotDeal[] = [];
  const batchSize = 3;

  for (let i = 0; i < qualifyingStageIds.length; i += batchSize) {
    const batch = qualifyingStageIds.slice(i, i + batchSize);
    const filterGroups = batch.map(stageId => ({
      filters: [
        { propertyName: 'dealstage', operator: 'EQ' as const, value: stageId },
      ],
    }));

    let after: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const searchRequest: any = {
        filterGroups,
        properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline', 'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate'],
        limit: 100,
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      };
      if (after) searchRequest.after = after;

      const response = await client.crm.deals.searchApi.doSearch(searchRequest);

      for (const deal of response.results) {
        const props = deal.properties;
        const stageInfo = stageMap.get(props.dealstage || '');

        allDeals.push({
          id: deal.id,
          dealName: props.dealname || 'Untitled Deal',
          amount: props.amount || null,
          dealStage: props.dealstage || '',
          dealStageName: stageInfo?.name || 'Unknown',
          pipeline: props.pipeline || '',
          pipelineName: stageInfo?.pipelineName || 'Unknown',
          probability: stageInfo?.probability ? stageInfo.probability * 100 : 0,
          closeDate: props.closedate || null,
          ownerName: null,
          companyName: null,
          companyId: null,
          createdAt: props.createdate || String(deal.createdAt),
          updatedAt: props.hs_lastmodifieddate || String(deal.updatedAt),
        });
      }

      if (response.paging?.next?.after) {
        after = response.paging.next.after;
      } else {
        hasMore = false;
      }
    }
  }

  const seenIds = new Set<string>();
  return allDeals.filter(d => {
    if (seenIds.has(d.id)) return false;
    seenIds.add(d.id);
    return true;
  });
}

export async function getHubSpotDealById(tenantId: string, dealId: string): Promise<HubSpotDeal | null> {
  const client = await getHubSpotClient(tenantId);
  const pipelines = await getHubSpotPipelines(tenantId);

  const stageMap = new Map<string, { name: string; probability: number; pipelineId: string; pipelineName: string }>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      stageMap.set(stage.id, {
        name: stage.label,
        probability: stage.probability,
        pipelineId: pipeline.id,
        pipelineName: pipeline.label,
      });
    }
  }

  try {
    const deal = await client.crm.deals.basicApi.getById(
      dealId,
      ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline', 'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate']
    );
    const props = deal.properties;
    const stageInfo = stageMap.get(props.dealstage || '');

    return {
      id: deal.id,
      dealName: props.dealname || 'Untitled Deal',
      amount: props.amount || null,
      dealStage: props.dealstage || '',
      dealStageName: stageInfo?.name || 'Unknown',
      pipeline: props.pipeline || '',
      pipelineName: stageInfo?.pipelineName || 'Unknown',
      probability: stageInfo?.probability ? stageInfo.probability * 100 : 0,
      closeDate: props.closedate || null,
      ownerName: null,
      companyName: null,
      companyId: null,
      createdAt: props.createdate || String(deal.createdAt),
      updatedAt: props.hs_lastmodifieddate || String(deal.updatedAt),
    };
  } catch (e) {
    return null;
  }
}

export async function updateHubSpotDealAmount(tenantId: string, dealId: string, amount: number): Promise<void> {
  const client = await getHubSpotClient(tenantId);
  await client.crm.deals.basicApi.update(dealId, {
    properties: {
      amount: String(amount),
    },
  });
}

export async function updateHubSpotDealStage(tenantId: string, dealId: string, stageId: string): Promise<void> {
  const client = await getHubSpotClient(tenantId);
  await client.crm.deals.basicApi.update(dealId, {
    properties: {
      dealstage: stageId,
    },
  });
}

export async function updateHubSpotDealProperties(tenantId: string, dealId: string, properties: Record<string, string>): Promise<void> {
  const client = await getHubSpotClient(tenantId);
  await client.crm.deals.basicApi.update(dealId, { properties });
}

export async function createHubSpotDealNote(tenantId: string, dealId: string, noteBody: string): Promise<string | null> {
  try {
    const accessToken = await getAccessTokenForTenant(tenantId);
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: dealId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 214,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[HubSpot] Failed to create note:', response.status, errText);
      return null;
    }

    const result = await response.json() as any;
    return result.id || null;
  } catch (e: any) {
    console.error('[HubSpot] Error creating deal note:', e.message);
    return null;
  }
}

export async function getHubSpotDealCompanyAssociations(tenantId: string, dealId: string): Promise<{ companyId: string; companyName: string } | null> {
  const client = await getHubSpotClient(tenantId);
  try {
    const deal = await client.crm.deals.basicApi.getById(dealId, undefined, undefined, ['companies']);
    const companyAssocs = deal.associations?.companies?.results;
    if (companyAssocs && companyAssocs.length > 0) {
      const companyId = companyAssocs[0].id;
      const company = await client.crm.companies.basicApi.getById(companyId, ['name']);
      return {
        companyId,
        companyName: company.properties.name || 'Unknown Company',
      };
    }
  } catch (e) {
    console.error('[HubSpot] Error fetching deal company associations:', e);
  }
  return null;
}

export interface HubSpotCompany {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
}

const COMPANY_PROPERTIES = ['name', 'domain', 'industry', 'city', 'state', 'country', 'phone', 'website', 'createdate', 'hs_lastmodifieddate'];

function mapCompany(company: any): HubSpotCompany {
  const p = company.properties || {};
  return {
    id: company.id,
    name: p.name || 'Unknown Company',
    domain: p.domain || null,
    industry: p.industry || null,
    city: p.city || null,
    state: p.state || null,
    country: p.country || null,
    phone: p.phone || null,
    website: p.website || null,
    createdAt: p.createdate || String(company.createdAt),
    updatedAt: p.hs_lastmodifieddate || String(company.updatedAt),
  };
}

export async function getHubSpotCompanies(tenantId: string, limit: number = 100): Promise<HubSpotCompany[]> {
  const client = await getHubSpotClient(tenantId);
  const companies: HubSpotCompany[] = [];
  let after: string | undefined;

  while (true) {
    const response = await client.crm.companies.basicApi.getPage(
      Math.min(limit - companies.length, 100),
      after,
      COMPANY_PROPERTIES
    );

    for (const company of response.results) {
      companies.push(mapCompany(company));
    }

    if (companies.length >= limit || !response.paging?.next?.after) break;
    after = response.paging.next.after;
  }

  return companies;
}

export async function getHubSpotCompanyById(tenantId: string, companyId: string): Promise<HubSpotCompany | null> {
  const client = await getHubSpotClient(tenantId);
  try {
    const company = await client.crm.companies.basicApi.getById(companyId, COMPANY_PROPERTIES);
    return mapCompany(company);
  } catch {
    return null;
  }
}

export async function searchHubSpotCompanies(tenantId: string, query: string): Promise<HubSpotCompany[]> {
  const client = await getHubSpotClient(tenantId);
  try {
    const response = await client.crm.companies.searchApi.doSearch({
      query,
      limit: 20,
      properties: COMPANY_PROPERTIES,
      filterGroups: [],
      sorts: [],
      after: 0 as any,
    });
    return response.results.map(mapCompany);
  } catch {
    return [];
  }
}

export async function updateHubSpotCompany(tenantId: string, companyId: string, properties: Record<string, string>): Promise<void> {
  const client = await getHubSpotClient(tenantId);
  await client.crm.companies.basicApi.update(companyId, { properties });
}

// ============================================================================
// HubSpot Contacts API
// ============================================================================

export interface HubSpotContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  jobTitle: string | null;
  phone: string | null;
  company: string | null;
  createdAt: string;
  updatedAt: string;
}

const CONTACT_PROPERTIES = ['email', 'firstname', 'lastname', 'jobtitle', 'phone', 'company', 'createdate', 'hs_lastmodifieddate'];

function mapContact(contact: any): HubSpotContact {
  const p = contact.properties || {};
  const firstName = p.firstname || null;
  const lastName = p.lastname || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || p.email || 'Unknown Contact';
  return {
    id: contact.id,
    email: p.email || null,
    firstName,
    lastName,
    fullName,
    jobTitle: p.jobtitle || null,
    phone: p.phone || null,
    company: p.company || null,
    createdAt: p.createdate || String(contact.createdAt),
    updatedAt: p.hs_lastmodifieddate || String(contact.updatedAt),
  };
}

export async function getHubSpotDealContacts(tenantId: string, dealId: string): Promise<HubSpotContact[]> {
  const client = await getHubSpotClient(tenantId);
  try {
    const deal = await client.crm.deals.basicApi.getById(dealId, undefined, undefined, ['contacts']);
    const contactAssocs = deal.associations?.contacts?.results;
    if (!contactAssocs || contactAssocs.length === 0) return [];

    const contacts: HubSpotContact[] = [];
    for (const assoc of contactAssocs) {
      try {
        const contact = await client.crm.contacts.basicApi.getById(assoc.id, CONTACT_PROPERTIES);
        contacts.push(mapContact(contact));
      } catch (e) {
        console.error(`[HubSpot] Error fetching contact ${assoc.id}:`, e);
      }
    }
    return contacts;
  } catch (e) {
    console.error('[HubSpot] Error fetching deal contacts:', e);
    return [];
  }
}

export async function getHubSpotContactById(tenantId: string, contactId: string): Promise<HubSpotContact | null> {
  const client = await getHubSpotClient(tenantId);
  try {
    const contact = await client.crm.contacts.basicApi.getById(contactId, CONTACT_PROPERTIES);
    return mapContact(contact);
  } catch {
    return null;
  }
}

export async function searchHubSpotContacts(tenantId: string, query: string): Promise<HubSpotContact[]> {
  const client = await getHubSpotClient(tenantId);
  try {
    const response = await client.crm.contacts.searchApi.doSearch({
      query,
      limit: 20,
      properties: CONTACT_PROPERTIES,
      filterGroups: [],
      sorts: [],
      after: 0 as any,
    });
    return response.results.map(mapContact);
  } catch {
    return [];
  }
}

export async function getHubSpotCompanyContacts(tenantId: string, companyId: string): Promise<HubSpotContact[]> {
  const client = await getHubSpotClient(tenantId);
  try {
    const company = await client.crm.companies.basicApi.getById(companyId, undefined, undefined, ['contacts']);
    const contactAssocs = company.associations?.contacts?.results;
    if (!contactAssocs || contactAssocs.length === 0) return [];

    const contacts: HubSpotContact[] = [];
    for (const assoc of contactAssocs) {
      try {
        const contact = await client.crm.contacts.basicApi.getById(assoc.id, CONTACT_PROPERTIES);
        contacts.push(mapContact(contact));
      } catch (e) {
        console.error(`[HubSpot] Error fetching contact ${assoc.id}:`, e);
      }
    }
    return contacts;
  } catch (e) {
    console.error('[HubSpot] Error fetching company contacts:', e);
    return [];
  }
}

export async function isHubSpotConnected(tenantId: string): Promise<boolean> {
  try {
    const connection = await storage.getCrmConnection(tenantId, "hubspot");
    if (!connection) return false;
    const settings = (connection.settings || {}) as Record<string, any>;
    return !!(settings.accessToken && settings.refreshToken);
  } catch {
    return false;
  }
}
