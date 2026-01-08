import { Client } from '@microsoft/microsoft-graph-client';
import { TenantMicrosoftIntegration } from '@shared/schema';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCaches: Map<string, TokenCache> = new Map();

export interface PlannerCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

async function getClientCredentialsToken(credentials: PlannerCredentials): Promise<string> {
  const cacheKey = `${credentials.tenantId}:${credentials.clientId}`;
  const cached = tokenCaches.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams();
  params.append('client_id', credentials.clientId);
  params.append('client_secret', credentials.clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PLANNER-AUTH] Token request failed:', errorText);
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  tokenCaches.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  });

  return data.access_token;
}

export function getSystemPlannerCredentials(): PlannerCredentials | null {
  const tenantId = process.env.PLANNER_TENANT_ID;
  const clientId = process.env.PLANNER_CLIENT_ID;
  const clientSecret = process.env.PLANNER_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return { tenantId, clientId, clientSecret };
}

export function getCredentialsFromIntegration(integration: TenantMicrosoftIntegration): PlannerCredentials | null {
  if (integration.integrationType === 'publisher_app') {
    return getSystemPlannerCredentials();
  }
  
  if (integration.integrationType === 'byoa' && integration.clientId && integration.clientSecretRef) {
    return {
      tenantId: integration.azureTenantId,
      clientId: integration.clientId,
      clientSecret: integration.clientSecretRef,
    };
  }

  return null;
}

export async function getPlannerGraphClient(credentials?: PlannerCredentials): Promise<Client> {
  const creds = credentials || getSystemPlannerCredentials();
  
  if (!creds) {
    throw new Error(
      'Planner integration not configured. Please set PLANNER_TENANT_ID, PLANNER_CLIENT_ID, and PLANNER_CLIENT_SECRET environment variables.'
    );
  }

  const accessToken = await getClientCredentialsToken(creds);

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken,
    },
  });
}

export function isPlannerConfigured(): boolean {
  return getSystemPlannerCredentials() !== null;
}

export async function testPlannerCredentials(credentials?: PlannerCredentials): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getPlannerGraphClient(credentials);
    await client.api('/organization').select('id').get();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
