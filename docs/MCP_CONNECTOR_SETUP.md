# Constellation MCP — Power Platform Connector & Copilot Studio Agent Setup

This guide walks through creating a Custom Connector in Power Platform and wiring it into a Copilot Studio agent so Microsoft 365 Copilot can query Constellation's read-only MCP endpoints.

---

## Prerequisites

- Constellation deployed and accessible at its production URL (e.g. `https://constellation.synozur.com`)
- The existing Azure AD (Entra ID) app registration used by Constellation (`198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` / SCDP-Content) — or a dedicated app registration for the connector
- A Power Platform environment with Copilot Studio access
- Admin or Maker role in the Power Platform environment

---

## Part 1: Azure AD App Registration (if using a dedicated registration)

If reusing Constellation's existing Entra app registration, skip to step 1.5.

### 1.1 Register a new app (optional — dedicated connector app)

1. Go to **Azure Portal → Entra ID → App registrations → New registration**
2. Name: `Constellation MCP Connector`
3. Supported account types: **Accounts in any organizational directory** (multi-tenant, matching Constellation's `common` authority)
4. Redirect URI: Leave blank for now (added in step 1.4)
5. Click **Register**

### 1.2 Configure API permissions

1. Go to **API permissions → Add a permission**
2. Select **My APIs** → find the Constellation app registration
3. Add the delegated permission scope (e.g. `user_impersonation` or `access_as_user`)
4. If no custom scope exists, add one:
   - Go to the Constellation app registration → **Expose an API**
   - Set Application ID URI: `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` (or your app's client ID)
   - Add a scope: `access_as_user` (Admin and user consent, display name: "Access Constellation as signed-in user")
5. Grant admin consent for your organization

### 1.3 Create a client secret

1. Go to **Certificates & secrets → New client secret**
2. Description: `Power Platform Connector`
3. Expiration: 24 months
4. Copy the **Value** immediately (you won't see it again)

### 1.4 Add the Power Platform redirect URI

1. Go to **Authentication → Add a platform → Web**
2. Redirect URI: `https://global.consent.azure-apim.net/redirect`
3. Check **Access tokens** and **ID tokens** under Implicit grant
4. Save

### 1.5 If reusing the existing Constellation app registration

1. Go to the existing app registration (`198aa0a6-d2ed-4f35-b41b-b6f6778a30d6`)
2. Under **Authentication**, add the redirect URI: `https://global.consent.azure-apim.net/redirect`
3. Ensure **Expose an API** has an Application ID URI and at least one delegated scope (e.g. `access_as_user`)
4. Create a client secret if one doesn't already exist for the connector use case
5. Note the **Client ID**, **Tenant ID** (use `common` for multi-tenant), and **Client Secret**

---

## Part 2: Create the Custom Connector

### 2.1 Open Power Platform Custom Connectors

1. Go to **make.powerapps.com** → your environment
2. Navigate to **Data → Custom Connectors → New custom connector → Create from blank**
3. Name: `Constellation MCP`

### 2.2 General tab

| Field | Value |
|-------|-------|
| Scheme | HTTPS |
| Host | `constellation.synozur.com` (your production domain) |
| Base URL | `/mcp` |

### 2.3 Security tab

| Field | Value |
|-------|-------|
| Authentication type | OAuth 2.0 |
| Identity Provider | Azure Active Directory |
| Client ID | Your app registration's Client ID |
| Client Secret | The secret from step 1.3 or 1.5 |
| Authorization URL | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| Refresh URL | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| Scope | `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6/access_as_user` |
| Resource URL | `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` |

### 2.4 Definition tab — Add Actions

Create one action per MCP endpoint. For each action:

#### Action: GetMyProfile
| Field | Value |
|-------|-------|
| Summary | Get my Constellation profile |
| Operation ID | `GetMyProfile` |
| Method | GET |
| URL | `/me` |
| Response | Import from sample: `{"data":{"id":"","email":"","name":"","role":"","platformRole":null,"tenantId":"","tenantName":"","tenantSlug":""}}` |

#### Action: GetAssignments
| Field | Value |
|-------|-------|
| Summary | Get assignments |
| Operation ID | `GetAssignments` |
| Method | GET |
| URL | `/assignments` |
| Query parameters | `assigneeId` (optional, string), `from` (optional, string), `to` (optional, string) |

#### Action: GetTimeEntries
| Field | Value |
|-------|-------|
| Summary | Get time entries |
| Operation ID | `GetTimeEntries` |
| Method | GET |
| URL | `/time-entries` |
| Query parameters | `assigneeId` (optional), `from` (optional), `to` (optional), `status` (optional) |

#### Action: GetExpenseReports
| Field | Value |
|-------|-------|
| Summary | Get expense reports |
| Operation ID | `GetExpenseReports` |
| Method | GET |
| URL | `/expenses/reports` |
| Query parameters | `submitterId` (optional), `status` (optional) |

#### Action: GetProjects
| Field | Value |
|-------|-------|
| Summary | Search and list projects |
| Operation ID | `GetProjects` |
| Method | GET |
| URL | `/projects` |
| Query parameters | `search` (optional), `clientId` (optional), `health` (optional — OnTrack, AtRisk, OverBudget) |

#### Action: GetProjectById
| Field | Value |
|-------|-------|
| Summary | Get project details |
| Operation ID | `GetProjectById` |
| Method | GET |
| URL | `/projects/{projectId}` |
| Path parameters | `projectId` (required, string) |

#### Action: GetProjectDeliverables
| Field | Value |
|-------|-------|
| Summary | Get project deliverables |
| Operation ID | `GetProjectDeliverables` |
| Method | GET |
| URL | `/projects/{projectId}/deliverables` |
| Path parameters | `projectId` (required) |
| Query parameters | `status` (optional — NotStarted, InProgress, InReview, Accepted, Rejected) |

#### Action: GetProjectRaidd
| Field | Value |
|-------|-------|
| Summary | Get project RAIDD entries |
| Operation ID | `GetProjectRaidd` |
| Method | GET |
| URL | `/projects/{projectId}/raidd` |
| Path parameters | `projectId` (required) |
| Query parameters | `type` (optional), `status` (optional), `priority` (optional) |

#### Action: GetProjectStatusReports
| Field | Value |
|-------|-------|
| Summary | Get project status reports |
| Operation ID | `GetProjectStatusReports` |
| Method | GET |
| URL | `/projects/{projectId}/status-reports` |
| Path parameters | `projectId` (required) |
| Query parameters | `from` (optional), `to` (optional) |

#### Action: GetProjectM365Context
| Field | Value |
|-------|-------|
| Summary | Get project Microsoft 365 context |
| Operation ID | `GetProjectM365Context` |
| Method | GET |
| URL | `/projects/{projectId}/m365-context` |
| Path parameters | `projectId` (required) |

#### Action: GetPortfolioRaidd
| Field | Value |
|-------|-------|
| Summary | Get portfolio RAIDD across all projects |
| Operation ID | `GetPortfolioRaidd` |
| Method | GET |
| URL | `/portfolio/raidd` |
| Query parameters | `status` (optional), `type` (optional), `priority` (optional) |

#### Action: GetPortfolioTimeline
| Field | Value |
|-------|-------|
| Summary | Get portfolio timeline |
| Operation ID | `GetPortfolioTimeline` |
| Method | GET |
| URL | `/portfolio/timeline` |
| Query parameters | `clientId` (optional), `endingBefore` (optional) |

#### Action: GetInvoices
| Field | Value |
|-------|-------|
| Summary | Get invoices |
| Operation ID | `GetInvoices` |
| Method | GET |
| URL | `/financial/invoices` |
| Query parameters | `from` (optional), `to` (optional), `clientId` (optional) |

#### Action: GetInvoiceAggregate
| Field | Value |
|-------|-------|
| Summary | Get invoice aggregate analytics |
| Operation ID | `GetInvoiceAggregate` |
| Method | GET |
| URL | `/financial/invoices/aggregate` |
| Query parameters | `from` (optional), `to` (optional), `groupBy` (optional — Month, Quarter, Client, Project) |

#### Action: GetCrmDeals
| Field | Value |
|-------|-------|
| Summary | Get CRM deals from HubSpot |
| Operation ID | `GetCrmDeals` |
| Method | GET |
| URL | `/crm/deals` |
| Query parameters | `search` (optional), `stage` (optional) |

#### Action: GetCrmDealLinkedProjects
| Field | Value |
|-------|-------|
| Summary | Get projects linked to a CRM deal |
| Operation ID | `GetCrmDealLinkedProjects` |
| Method | GET |
| URL | `/crm/deals/{dealId}/linked-projects` |
| Path parameters | `dealId` (required, string) |

### 2.5 Test tab

1. Click **Create connector**
2. Click **New connection** — sign in with your Entra ID credentials
3. Test the `GetMyProfile` action — you should see your user profile with role and tenant info
4. If it works, test `GetProjects` and `GetAssignments`

### 2.6 Important: Session header

Constellation uses `x-session-id` header-based auth. The connector's OAuth token needs to be translated to a session. You have two options:

**Option A — Add a token-to-session policy (recommended)**
Add a policy in the connector definition or an Azure API Management layer that:
1. Takes the OAuth bearer token from the connector
2. Calls Constellation's `/api/auth/sso/token-exchange` endpoint to get a session ID
3. Passes the session ID as `x-session-id` header on MCP requests

**Option B — Modify MCP routes to accept bearer tokens directly**
Add middleware to `server/routes/mcp.ts` that accepts an `Authorization: Bearer <token>` header, validates the JWT against the Entra app registration, resolves the user, and creates/reuses a session. This is the cleaner long-term approach and matches the Vega pattern.

---

## Part 3: Create the Copilot Studio Agent

### 3.1 Create a new agent

1. Go to **copilotstudio.microsoft.com**
2. Click **Create** → **New agent**
3. Name: `Constellation Assistant`
4. Description: `Queries Constellation project delivery data — assignments, time entries, projects, RAIDD, financials, and CRM deals.`

### 3.2 Add the connector as a data source

1. In the agent, go to **Actions** → **Add an action**
2. Select **Custom connector** → find `Constellation MCP`
3. This imports all 16 operations as available tools

### 3.3 Configure topics / instructions

Add the following to the agent's **Instructions** (system prompt):

```
You are a Constellation assistant that helps users query their consulting delivery data. You have access to the Constellation MCP connector with the following capabilities:

IDENTITY:
- Always start by calling GetMyProfile to understand who the user is, their role, and their tenant.
- Use the user's role to determine what data they can access.

PERSONAL DATA (all roles):
- GetAssignments: Show the user's project assignments. Supports date range filtering.
- GetTimeEntries: Show time entries. Supports date range and status filtering.
- GetExpenseReports: Show expense reports. Supports status filtering.

PROJECT DATA (PM, Admin, Portfolio Manager, Executive):
- GetProjects: Search and list projects. Can filter by client, health status (OnTrack, AtRisk, OverBudget).
- GetProjectById: Get detailed project information including budget vs actual.
- GetProjectDeliverables: List deliverables with status filtering.
- GetProjectRaidd: Show risks, actions, issues, dependencies, and decisions.
- GetProjectStatusReports: Retrieve previously generated status reports.
- GetProjectM365Context: Show Teams and Planner integration info.

PORTFOLIO DATA (Portfolio Manager, Admin, Executive):
- GetPortfolioRaidd: Aggregate RAIDD across all projects.
- GetPortfolioTimeline: Portfolio timeline view with date and client filtering.

FINANCIAL DATA (Billing Admin, Admin, Executive):
- GetInvoices: List invoice batches with date and client filtering.
- GetInvoiceAggregate: Aggregate invoice analytics by Month, Quarter, Client, or Project.

CRM DATA (PM, Admin, Executive):
- GetCrmDeals: Search HubSpot deals.
- GetCrmDealLinkedProjects: Find Constellation projects linked to a deal.

GUIDELINES:
- Always check the user's role before calling role-restricted endpoints.
- Format financial amounts as currency.
- When showing RAIDD items, group by type (Risk, Action, Issue, Dependency, Decision) and highlight open/critical items.
- For date parameters, use ISO format (YYYY-MM-DD).
- If an endpoint returns an empty array, tell the user no data was found for their filters.
- This is READ-ONLY access. If the user asks to create, update, or approve anything, explain that Constellation MCP is currently read-only and direct them to the Constellation web application.
```

### 3.4 Configure authentication

1. In agent settings → **Authentication**
2. Select **Authenticate with Microsoft**
3. This ensures the user's identity flows through to the connector

### 3.5 Test the agent

In the Copilot Studio test pane, try these prompts:
- "Who am I in Constellation?"
- "What are my assignments this week?"
- "Show me all at-risk projects"
- "What are the open risks across the portfolio?"
- "Show me invoice totals by quarter for this year"
- "Find deals in the negotiation stage"

### 3.6 Publish

1. Click **Publish** in Copilot Studio
2. To make the agent available in Microsoft 365 Copilot (M365 Chat), go to **Channels** → enable **Microsoft 365 Copilot**
3. The agent will appear as a plugin in M365 Copilot for users in your organization

---

## Part 4: Auth Bridge (Option B — Bearer Token Support)

To avoid the session-translation complexity, the recommended approach is to add bearer token support directly to the MCP routes. This is a code change in `server/routes/mcp.ts`:

1. Add middleware that checks for `Authorization: Bearer <token>` header
2. Validate the JWT against the Constellation Entra app registration (using `@azure/msal-node` or `jsonwebtoken` with JWKS)
3. Extract the user's `oid` (object ID) and `tid` (tenant ID) from the token claims
4. Look up the user in Constellation's database by their Entra `oid`
5. Attach `req.user` and `req.tenantContext` just like `requireAuth` does with sessions
6. Fall through to the existing `requireAuth` if no bearer token is present (backward compatible)

This is the same pattern used by Vega and is the cleanest path for Copilot Studio integration.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 401 on all requests | Check that the OAuth scope matches the Entra app's Expose an API scope |
| 403 "Tenant context could not be resolved" | The user's Entra OID isn't mapped to a Constellation user/tenant. Ensure they've logged into Constellation at least once via SSO |
| 403 "Insufficient permissions" | The user's Constellation role doesn't have access to that endpoint. Check the RBAC table in `docs/MCP_README.md` |
| Empty results | Check date filters and confirm the user has data in the active tenant |
| HubSpot endpoints return empty | The tenant hasn't connected HubSpot in Constellation's Organization Settings |
