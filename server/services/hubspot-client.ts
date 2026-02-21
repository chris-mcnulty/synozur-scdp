import { Client } from '@hubspot/api-client';

// HubSpot connection via Replit connector (connection:conn_hubspot_01KAH52TA9XM6ATEF6T06QN7Z1)
let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=hubspot',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('HubSpot not connected');
  }
  return accessToken;
}

async function getUncachableHubSpotClient(): Promise<Client> {
  const accessToken = await getAccessToken();
  return new Client({ accessToken });
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

export async function getHubSpotPipelines(): Promise<HubSpotPipeline[]> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotDealsAboveThreshold(probabilityThreshold: number): Promise<HubSpotDeal[]> {
  const client = await getUncachableHubSpotClient();
  const pipelines = await getHubSpotPipelines();

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

export async function getHubSpotDealById(dealId: string): Promise<HubSpotDeal | null> {
  const client = await getUncachableHubSpotClient();
  const pipelines = await getHubSpotPipelines();

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

export async function updateHubSpotDealAmount(dealId: string, amount: number): Promise<void> {
  const client = await getUncachableHubSpotClient();
  await client.crm.deals.basicApi.update(dealId, {
    properties: {
      amount: String(amount),
    },
  });
}

export async function updateHubSpotDealStage(dealId: string, stageId: string): Promise<void> {
  const client = await getUncachableHubSpotClient();
  await client.crm.deals.basicApi.update(dealId, {
    properties: {
      dealstage: stageId,
    },
  });
}

export async function updateHubSpotDealProperties(dealId: string, properties: Record<string, string>): Promise<void> {
  const client = await getUncachableHubSpotClient();
  await client.crm.deals.basicApi.update(dealId, { properties });
}

export async function createHubSpotDealNote(dealId: string, noteBody: string): Promise<string | null> {
  const client = await getUncachableHubSpotClient();
  try {
    const accessToken = await getAccessToken();
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

export async function getHubSpotDealCompanyAssociations(dealId: string): Promise<{ companyId: string; companyName: string } | null> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotCompanies(limit: number = 100): Promise<HubSpotCompany[]> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotCompanyById(companyId: string): Promise<HubSpotCompany | null> {
  const client = await getUncachableHubSpotClient();
  try {
    const company = await client.crm.companies.basicApi.getById(companyId, COMPANY_PROPERTIES);
    return mapCompany(company);
  } catch {
    return null;
  }
}

export async function searchHubSpotCompanies(query: string): Promise<HubSpotCompany[]> {
  const client = await getUncachableHubSpotClient();
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

export async function updateHubSpotCompany(companyId: string, properties: Record<string, string>): Promise<void> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotDealContacts(dealId: string): Promise<HubSpotContact[]> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotContactById(contactId: string): Promise<HubSpotContact | null> {
  const client = await getUncachableHubSpotClient();
  try {
    const contact = await client.crm.contacts.basicApi.getById(contactId, CONTACT_PROPERTIES);
    return mapContact(contact);
  } catch {
    return null;
  }
}

export async function searchHubSpotContacts(query: string): Promise<HubSpotContact[]> {
  const client = await getUncachableHubSpotClient();
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

export async function getHubSpotCompanyContacts(companyId: string): Promise<HubSpotContact[]> {
  const client = await getUncachableHubSpotClient();
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

export async function isHubSpotConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}
