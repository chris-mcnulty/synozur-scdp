# Constellation MCP Server (v0 — Read-Only)

## Purpose

The MCP (Model Context Protocol) surface provides read-only access to Constellation data for Microsoft 365 Copilot and Copilot Studio agents. It exposes a set of GET endpoints under `/mcp` that wrap existing Constellation services without reimplementing business logic.

This is **v0 — read-only**. No create, update, delete, or approval operations are available through these endpoints. Write operations will be introduced in a future version under a separate prefix or version namespace.

## Authentication

All `/mcp` endpoints require the same authentication used by the rest of Constellation:

- **Session-based auth** via the `x-session-id` header
- **SSO** via Azure AD / Microsoft Entra ID
- Tenant isolation is enforced automatically — users only see data for their active tenant

## RBAC (Role-Based Access Control)

Existing Constellation roles are honored. Each endpoint is gated to the minimum required role(s):

| Role | Access |
|------|--------|
| Employee | Own assignments, time entries, expense reports |
| Project Manager (pm) | All personal data + projects, deliverables, RAIDD, CRM deals |
| Portfolio Manager | All PM access + portfolio views |
| Billing Administrator | Financial/invoice endpoints |
| Executive | All endpoints |
| Administrator | All endpoints |

Platform admins (`global_admin`, `constellation_admin`) inherit admin-level access across all endpoints.

## Endpoints

### User Profile

| Method | Path | Description | Roles |
|--------|------|-------------|-------|
| GET | `/mcp/me` | Current user profile and Constellation roles | All authenticated |

### Personal Data

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/assignments` | `assigneeId?`, `from?`, `to?` | List assignments (defaults to current user) | All (own); PM+ (any user) |
| GET | `/mcp/time-entries` | `assigneeId?`, `from?`, `to?`, `status?` | Time entries | All (own); PM+ (any user) |
| GET | `/mcp/expenses/reports` | `submitterId?`, `status?` | Expense reports | All (own); PM+ (any user) |

### Projects

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/projects` | `search?`, `clientId?`, `health?` | Search/list projects. Health: `OnTrack`, `AtRisk`, `OverBudget` | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId` | — | Project overview (client, dates, budget vs actual) | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/deliverables` | `status?` | Deliverables. Status: `NotStarted`, `InProgress`, `InReview`, `Accepted`, `Rejected` | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/raidd` | `type?`, `status?`, `priority?` | RAIDD log entries | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/status-reports` | `from?`, `to?` | Previously generated status reports (stub — not yet stored) | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/m365-context` | — | Teams/Planner info for the project | PM, Admin, Portfolio, Exec |

### Portfolio

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/portfolio/raidd` | `status?`, `type?`, `priority?` | RAIDD aggregated across all projects | Portfolio, Admin, Exec |
| GET | `/mcp/portfolio/timeline` | `clientId?`, `endingBefore?` | Project timeline view | Portfolio, Admin, Exec |

### Financial

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/financial/invoices` | `from?`, `to?`, `clientId?` | Invoice batches | Billing, Admin, Exec |
| GET | `/mcp/financial/invoices/aggregate` | `from?`, `to?`, `groupBy?` | Aggregate analytics. GroupBy: `Month`, `Quarter`, `Client`, `Project` | Billing, Admin, Exec |

### CRM (HubSpot)

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/crm/deals` | `search?`, `stage?` | HubSpot deals (requires tenant HubSpot connection) | PM, Admin, Exec |
| GET | `/mcp/crm/deals/:dealId/linked-projects` | — | Projects linked to a HubSpot deal | PM, Admin, Exec |

## Response Format

All endpoints return JSON with a consistent structure:

```json
{
  "data": [ ... ]
}
```

For single-item responses (e.g., `/mcp/me`, `/mcp/projects/:id`):

```json
{
  "data": { ... }
}
```

Empty results return `200` with an empty array:

```json
{
  "data": []
}
```

Errors return the appropriate HTTP status code with:

```json
{
  "error": "Description of the error"
}
```

## Implementation Notes

- All endpoints are defined in `server/routes/mcp.ts` and registered via `registerMcpRoutes()` in `server/routes.ts`.
- Endpoints delegate to existing storage methods and service classes — no business logic is duplicated.
- Tenant isolation is enforced by the existing `requireAuth` middleware which resolves tenant context from the session.
- The `status-reports` endpoint is a stub that returns an empty array. Status reports are currently generated on-demand via AI and are not persisted. This will be implemented when a `status_reports` table is added.

## Microsoft Copilot Studio Integration

To connect these endpoints to a Copilot Studio agent:

1. Create a Custom Connector in Power Platform pointing to the Constellation base URL
2. Configure OAuth 2.0 authentication using the same Azure AD app registration
3. Add actions for each GET endpoint as Tools in your Copilot Studio agent
4. The connector will pass the authenticated user's session, ensuring proper RBAC and tenant scoping
