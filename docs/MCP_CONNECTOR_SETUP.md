# Constellation MCP — Power Platform Connector & Copilot Studio Agent Setup

This guide walks through creating a Custom Connector in Power Platform and wiring it into a Copilot Studio agent so Microsoft 365 Copilot can query Constellation's read-only MCP endpoints.

---

## App Registration Architecture

Three Entra ID app registrations are involved:

| App | Purpose | Status |
|-----|---------|--------|
| **Constellation (SCDP-Content)** `198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` | The API — owns the MCP endpoints, exposes the `access_as_user` scope | Exists |
| **Constellation MCP Connector** | The OAuth client — used by the Power Platform Custom Connector to obtain tokens | Create in Part 1 |
| **Constellation Copilot Agent** | The Copilot Studio agent — calls the connector actions on behalf of users | Create in Part 3 |

**Token flow:** User → Copilot Agent → Connector (obtains token via OAuth using Connector app's Client ID) → Constellation API (validates token against its own `access_as_user` scope)

## Prerequisites

- Constellation deployed and accessible at `https://constellation.synozur.com`
- Admin access to Azure Entra ID for the Synozur tenant (`b4fbeaf7-1c91-43bb-8031-49eb8d4175ee`)
- A Power Platform environment with Copilot Studio access
- Admin or Maker role in the Power Platform environment

---

## Part 1: Azure AD App Registrations

### 1.1 Expose an API on the Constellation app registration (do this FIRST)

The Constellation app must declare itself as an API before other apps can request permission to call it:

1. Go to **Azure Portal → Entra ID → App registrations**
2. Open the **Constellation app registration** (`198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` / SCDP-Content)
3. Go to **Expose an API**
4. Click **Set** next to Application ID URI → set it to: `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6`
5. Click **Add a scope** with these values:
   - Scope name: `access_as_user`
   - Who can consent: **Admins and users**
   - Admin consent display name: `Access Constellation MCP as signed-in user`
   - Admin consent description: `Allows the Copilot connector to access Constellation MCP endpoints on behalf of the signed-in user`
   - User consent display name: `Access Constellation on your behalf`
   - User consent description: `Allows Copilot to read your Constellation project data`
   - State: **Enabled**
6. Click **Add scope**

### 1.2 Register the Connector app

1. Go to **Azure Portal → Entra ID → App registrations → New registration**
2. Name: `Constellation MCP Connector`
3. Supported account types: **Accounts in any organizational directory** (multi-tenant — matches Constellation's `common` authority so users from any Entra tenant that has Constellation accounts can authenticate)
4. Redirect URI: Leave blank for now (added in step 1.5)
5. Click **Register**
6. Note the **Client ID** — this is the Connector app's Client ID (different from Constellation's)

### 1.3 Grant the Connector app permission to call the Constellation API

On the **Connector app** you just created:

1. Go to **API permissions → Add a permission**
2. Select the **APIs my organization uses** tab
3. Search for `SCDP-Content` (or the Constellation app's display name) — if it doesn't appear, search by Client ID: `198aa0a6-d2ed-4f35-b41b-b6f6778a30d6`
4. Select it → choose **Delegated permissions** → check **access_as_user**
5. Click **Add permissions**
6. Click **Grant admin consent for Synozur**

### 1.4 Create a client secret on the Connector app

Still on the **Connector app**:

1. Go to **Certificates & secrets → New client secret**
2. Description: `Power Platform Connector`
3. Expiration: 24 months
4. Copy the **Value** immediately (you won't see it again)

### 1.5 Add the Power Platform redirect URI to the Connector app

Still on the **Connector app**:

1. Go to **Authentication → Add a platform → Web**
2. Redirect URI: `https://global.consent.azure-apim.net/redirect`
3. Check **Access tokens** and **ID tokens** under Implicit grant
4. Save

### 1.6 Pre-authorize the Connector app on the Constellation registration

Go back to the **Constellation app** (`198aa0a6-...`):

1. Go to **Expose an API**
2. Scroll down to **Authorized client applications**
3. Click **Add a client application**
4. Enter the **Connector app's Client ID** (from step 1.2)
5. Check the `access_as_user` scope
6. Click **Add application**

This pre-authorizes the connector so users won't see a separate consent prompt when the connector acquires tokens.

---

## Part 2: Create the Custom Connector

### 2.1 Open Power Platform Custom Connectors

1. Go to **make.powerapps.com** → your environment
2. Navigate to **Data → Custom Connectors → New custom connector → Import an OpenAPI file**
3. Name: `Constellation MCP`
4. Upload: [`docs/constellation-mcp-openapi.json`](constellation-mcp-openapi.json)
5. Click **Import** — this pre-populates the General, Definition, and Security tabs

### 2.2 General tab

| Field | Value |
|-------|-------|
| Scheme | HTTPS |
| Host | `constellation.synozur.com` (your production domain) |
| Base URL | `/mcp` |

### 2.3 Security tab

Select **OAuth 2.0** as the authentication type, then fill in:

| Field | Value |
|-------|-------|
| Identity Provider | Azure Active Directory |
| Client ID | The **Connector app's** Client ID (from step 1.2 — NOT the Constellation app's ID) |
| Secret options | **Use client secret** |
| Client secret | The **Connector app's** client secret (from step 1.4) |
| Authorization URL | `https://login.microsoftonline.com` (just the base URL — Power Platform appends `/{Tenant ID}/oauth2/authorize` automatically. Do NOT include the full path or it will be duplicated) |
| Tenant ID | `common` (multi-tenant — matches Constellation's authority so users from any Entra directory can authenticate) |
| Resource URL | `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6` (the **Constellation app's** Application ID URI — tells Azure which API the token is for) |
| Enable on-behalf-of login | `false` |
| Scope | `api://198aa0a6-d2ed-4f35-b41b-b6f6778a30d6/access_as_user` (the **Constellation app's** exposed scope from step 1.1) |
| Redirect URL | Auto-generated after saving — copy this value and add it to the **Connector app's** Authentication redirect URIs in Entra (in addition to the `global.consent.azure-apim.net` URI from step 1.5) |

### 2.4 Definition tab — Import from OpenAPI file

Instead of creating each action manually, import the OpenAPI definition:

1. When creating the connector, choose **New custom connector → Import an OpenAPI file** (instead of "Create from blank")
2. Name: `Constellation MCP`
3. Upload the file: [`docs/constellation-mcp-openapi.json`](constellation-mcp-openapi.json)
4. Click **Import** — all 16 actions will be created automatically with correct operation IDs, parameters, and response schemas

After import, review the **Definition** tab to confirm all actions are listed:

| Operation ID | Endpoint | Parameters |
|-------------|----------|------------|
| `GetMyProfile` | `GET /me` | — |
| `GetAssignments` | `GET /assignments` | assigneeId, from, to |
| `GetTimeEntries` | `GET /time-entries` | assigneeId, from, to, status |
| `GetExpenseReports` | `GET /expenses/reports` | submitterId, status |
| `GetProjects` | `GET /projects` | search, clientId, health |
| `GetProjectById` | `GET /projects/{projectId}` | projectId |
| `GetProjectDeliverables` | `GET /projects/{projectId}/deliverables` | projectId, status |
| `GetProjectRaidd` | `GET /projects/{projectId}/raidd` | projectId, type, status, priority |
| `GetProjectStatusReports` | `GET /projects/{projectId}/status-reports` | projectId, from, to |
| `GetProjectM365Context` | `GET /projects/{projectId}/m365-context` | projectId |
| `GetPortfolioRaidd` | `GET /portfolio/raidd` | type, status, priority |
| `GetPortfolioTimeline` | `GET /portfolio/timeline` | clientId, endingBefore |
| `GetInvoices` | `GET /financial/invoices` | from, to, clientId |
| `GetInvoiceAggregate` | `GET /financial/invoices/aggregate` | groupBy, from, to |
| `GetCrmDeals` | `GET /crm/deals` | search, stage |
| `GetCrmDealLinkedProjects` | `GET /crm/deals/{dealId}/linked-projects` | dealId |

> **Note:** The OpenAPI file includes the OAuth security definition, but the Security tab values from step 2.3 (Client ID, Client Secret) still need to be filled in manually after import — Power Platform does not auto-populate secrets from the swagger file.

### 2.5 Test tab

1. Click **Create connector**
2. Click **New connection** — sign in with your Entra ID credentials
3. Test the `GetMyProfile` action — you should see your user profile with role and tenant info
4. If it works, test `GetProjects` and `GetAssignments`

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
- GetExpenses: Show individual expense items. Supports filtering by project, date range, approval status, category, and billable flag. Returns category-level totals.
- GetReimbursements: Show reimbursement batches. Supports status and date filtering.
- GetReimbursementDetail: Show full detail for a reimbursement batch including all line items and associated expenses.

PROJECT DATA (PM, Admin, Portfolio Manager, Executive):
- GetProjects: Search and list projects. Can filter by client, health status (OnTrack, AtRisk, OverBudget).
- GetProjectById: Get detailed project information including budget vs actual.
- GetProjectDeliverables: List deliverables with status filtering.
- GetProjectRaidd: Show risks, actions, issues, dependencies, and decisions.
- GetProjectStatusReportData: Get aggregated status report data for a project — hours, expenses, team breakdown, RAIDD summary, milestones, deliverables, and allocations. Defaults to last 14 days. Use this to summarize project health or generate status updates.
- GetProjectM365Context: Show Teams and Planner integration info.

ESTIMATE DATA (PM, Admin, Portfolio Manager, Executive, Billing Admin):
- GetEstimates: List all estimates. Supports filtering by status (draft/final/approved/rejected), client, project, estimate type (detailed/block/retainer/program), and text search.
- GetEstimateDetail: Get full estimate detail including epics, stages, and payment milestones.
- GetEstimateLineItems: Get the detailed line item breakdown — hours, rates, costs, margin per line. Can filter by epic or stage. Includes summary totals.

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
- When asked about estimates, show key metrics: name, status, total hours, total fees, margin, and type.
- For estimate line items, group by epic/stage when possible and highlight the totals.
- For expenses, use the category summary to give a quick breakdown before showing details.
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
- "List all approved estimates for this quarter"
- "What's the margin on the Contoso estimate?"
- "Show me the line item breakdown for estimate X"
- "What are my expenses this month?"
- "How much have I spent on travel this year?"
- "What's the status of my reimbursements?"
- "Give me a status report summary for project X"

### 3.6 Publish

1. Click **Publish** in Copilot Studio
2. To make the agent available in Microsoft 365 Copilot (M365 Chat), go to **Channels** → enable **Microsoft 365 Copilot**
3. The agent will appear as a plugin in M365 Copilot for users in your organization

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 401 on all requests | Check that the OAuth scope matches the Entra app's Expose an API scope |
| 403 "Tenant context could not be resolved" | The user's Entra OID isn't mapped to a Constellation user/tenant. Ensure they've logged into Constellation at least once via SSO |
| 403 "Insufficient permissions" | The user's Constellation role doesn't have access to that endpoint. Check the RBAC table in `docs/MCP_README.md` |
| Empty results | Check date filters and confirm the user has data in the active tenant |
| HubSpot endpoints return empty | The tenant hasn't connected HubSpot in Constellation's Organization Settings |
