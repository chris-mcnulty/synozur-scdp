# Constellation MCP Server (v0 — Read-Only)

## Purpose

The MCP (Model Context Protocol) surface provides read-only access to Constellation data for Microsoft 365 Copilot and Copilot Studio agents. It exposes a set of GET endpoints under `/mcp` that wrap existing Constellation services without reimplementing business logic.

This is **v0 — read-only**. No create, update, delete, or approval operations are available through these endpoints. Write operations will be introduced in a future version under a separate prefix or version namespace.

## Authentication

All `/mcp` endpoints support two authentication methods:

- **Session-based auth** via the `x-session-id` header (for browser / Constellation UI calls)
- **Bearer token auth** via `Authorization: Bearer <JWT>` header (for Power Platform Custom Connectors / Copilot Studio). JWTs are validated against the Constellation Entra app registration using JWKS. Implemented in `server/auth/mcp-bearer-auth.ts`.

Tenant isolation is enforced automatically — users only see data for their active tenant.

## RBAC (Role-Based Access Control)

Existing Constellation roles are honored. Each endpoint is gated to the minimum required role(s):

| Role | Access |
|------|--------|
| Employee | Own assignments, time entries, expense reports, expenses, reimbursements |
| Project Manager (pm) | All personal data + projects, deliverables, RAIDD, estimates, CRM deals |
| Portfolio Manager | All PM access + portfolio views + estimates |
| Billing Administrator | Financial/invoice endpoints + estimates |
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
| GET | `/mcp/expenses` | `personId?`, `projectId?`, `from?`, `to?`, `status?`, `category?`, `billable?` | Individual expense items with category summary | All (own); PM+ (any user) |
| GET | `/mcp/reimbursements` | `status?`, `from?`, `to?`, `userId?` | Reimbursement batches | All (own); PM+ (any user) |
| GET | `/mcp/reimbursements/:batchId` | — | Reimbursement batch detail with line items | All (own); PM+ (any user) |

### Projects

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/projects` | `search?`, `clientId?`, `health?` | Search/list projects. Health: `OnTrack`, `AtRisk`, `OverBudget` | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId` | — | Project overview (client, dates, budget vs actual) | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/deliverables` | `status?` | Deliverables. Status: `NotStarted`, `InProgress`, `InReview`, `Accepted`, `Rejected` | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/raidd` | `type?`, `status?`, `priority?` | RAIDD log entries | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/status-report-data` | `startDate?`, `endDate?` | Aggregated status report data (hours, expenses, team, RAIDD, milestones, deliverables, allocations). Defaults to last 14 days. | PM, Admin, Portfolio, Exec |
| GET | `/mcp/projects/:projectId/m365-context` | — | Teams/Planner info for the project | PM, Admin, Portfolio, Exec |

### Estimates

| Method | Path | Filters | Description | Roles |
|--------|------|---------|-------------|-------|
| GET | `/mcp/estimates` | `search?`, `status?`, `clientId?`, `projectId?`, `estimateType?`, `includeArchived?` | List estimates with summary fields | PM, Admin, Portfolio, Exec, Billing |
| GET | `/mcp/estimates/:estimateId` | — | Estimate detail with structure (epics, stages) and milestones | PM, Admin, Portfolio, Exec, Billing |
| GET | `/mcp/estimates/:estimateId/line-items` | `epicId?`, `stageId?` | Line item breakdown with hours, rates, costs, margin. Includes totals. | PM, Admin, Portfolio, Exec, Billing |

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
- Tenant isolation is enforced by bearer token or session middleware which resolves tenant context from the authenticated user.
- Bearer token auth is implemented in `server/auth/mcp-bearer-auth.ts` using `jsonwebtoken` + `jwks-rsa`.
- The `status-report-data` endpoint aggregates live project data (hours, expenses, RAIDD, milestones, deliverables, allocations) for a given period — the same data that feeds the AI-generated status reports.

## Microsoft Copilot Studio Integration

To connect these endpoints to a Copilot Studio agent:

1. Create a Custom Connector in Power Platform using the OpenAPI spec at `docs/constellation-mcp-openapi.json`
2. Configure OAuth 2.0 using the Constellation Entra app registration (see `docs/MCP_CONNECTOR_SETUP.md`)
3. The connector automatically passes the user's bearer token, ensuring proper RBAC and tenant scoping
4. Add actions as tools in your Copilot Studio agent — all operations are available
