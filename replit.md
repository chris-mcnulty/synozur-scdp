# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform designed to manage the entire consulting project lifecycle, from estimation and resource allocation to time tracking, expense management, and automated invoice generation. It aims to enhance efficiency, streamline operations, and support data-driven consulting practices through features like AI-powered narrative generation and automated expense calculations. The platform prioritizes improved file management, transparent quote displays, advanced resource capacity planning, and milestone-based invoice generation.

## User Preferences
Preferred communication style: Simple, everyday language.
User management should be consolidated into a single, unified view (like Vega) rather than separate admin pages.
Prefer scope-based filtering over separate "Platform Users" vs "Tenant Users" pages.
Multi-tenant user model: A user in one tenant can be a client in another tenant, so NO separate client_contacts table. Use the existing users table for all people across tenants.
**CRITICAL**: `attached_assets/` is ONLY for temporary scratch files. NEVER store application assets (logos, images, etc.) there. All permanent assets must live in the source tree (e.g., `client/src/assets/logos/`) so they survive cleanup and are included in published builds.
**CRITICAL FONT RULE**: The ONLY font allowed in the application is the **Avenir Next Lt Pro** family. NEVER use Inter, system-ui, or any other font. Font files are in `client/public/fonts/`. The CSS `@font-face` declarations and Tailwind `fontFamily` config must always point to `'Avenir Next LT Pro'`.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **UI/UX Decisions**: Refactored estimate tables, mobile optimization, responsive navigation, user persona-based navigation, prominent quote totals, dark/light mode, and advanced project list/detail views with consolidated tabs and deep linking. Standardized project selectors.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas.

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses, Invoices, Payment Milestones, Rate overrides, Project Engagements.

### Project Structure
- **Monorepo**: Organized into `/client`, `/server`, and `/shared`.

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID).
- **Development Auth**: Local email/password.
- **Roles**: Six-tier hierarchy with feature-based permissions.

### Document Storage
- **Strategy**: Multi-tier using SharePoint Embedded (primary) and Replit Object Storage (legacy fallback). A smart storage layer directs document types based on tenant configuration (`speStorageEnabled` flag).
- **Tenant SPE Opt-in**: Tenants can configure individual SharePoint Embedded containers for document storage, with a migration service to move existing files.
- **Per-Tenant Azure AD Isolation**: All file operations and container management are tenant-scoped, ensuring data isolation using each tenant's Azure AD tenant ID.
- **SPE Billing**: All SharePoint Embedded storage costs are billed to Synozur, not directly to customers.

### Core Features
- **AI Integration**: Multi-provider AI (Replit AI, Azure AI Foundry) with configurable model selection, usage logging, and cost tracking. Includes usage alerts for token budgets.
- **Estimate Management**: Supports Excel/CSV import/export, AI-driven text export, status-based locking, and hierarchical rate precedence. Includes detailed, program, block, and retainer estimate types. AI-powered generation of structured estimates from narrative text.
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, and expense receipt inclusion.
- **Expense Approval Workflow**: Comprehensive system with finite state machine and role-based access.
- **Resource Management**: Dual List/Timeline views, capacity planning, and conflict detection.
- **Assignment Baselines**: Snapshot current assignments as frozen baselines for future slip/impact analysis. Baselines are excluded from all normal views, status reports, dashboards, and Planner sync. Created automatically during "Remove and Replace" imports (opt-in) or manually via "Save Baseline" button. Multiple baselines can accumulate per project. Schema: `project_baselines` table + `isBaseline`/`baselineId` fields on `project_allocations`. API: `GET/POST /api/projects/:projectId/baselines`, `GET /api/projects/:projectId/baselines/:baselineId/allocations`.
- **Slippage Analytics Engine**: Composite slippage scoring (0–100) per project from 5 weighted signals: Schedule Position (30%, SPI-based), Assignment Health (25%, overdue allocations), Milestone Health (20%, overdue/at-risk deliverables), RAIDD Signals (15%, open critical/high risks+issues), Velocity Lag (10%, days since last time entry). Levels: on-track/watch/at-risk/critical. Predictive slip-day projection using trailing 4-week burn rate. Portfolio dashboard at `/api/portfolio/slippage` (2-min server cache, concurrency-limited). User alerts at `/api/dashboard/slippage-alerts`. Frontend: `portfolio-slippage.tsx` with sortable table, level filters, Excel export. All allocation queries exclude baseline records.
- **Microsoft Planner Integration**: Bidirectional sync of project assignments with Microsoft Planner tasks.
- **Scheduled Jobs**: Background system for reminders and Planner sync.
- **Financial Reporting**: Comprehensive reports on revenue, cost, profit, and margins.
- **Contractor Expense Invoices**: Contractors can generate invoices from expense reports.
- **Project Rate Overrides**: Project-level billing and cost rate overrides.
- **Deliverable Tracking**: Management of project deliverables with status workflows, AI narrative extraction, and integration into reports.
- **Persistent Status Reports**: AI-generated status reports (text + PPTX) are automatically saved to `status_reports` table. CRUD API at `/api/projects/:projectId/status-reports`. Reports track reportType (text/pptx), reportStyle, period, content, status (draft/final), SPE file references, and generation metadata. Frontend "Status Reports" tab on project detail page. MCP endpoints at `/mcp/projects/:projectId/status-reports` and `/mcp/projects/:projectId/status-reports/:reportId`.
- **MCP Server (v0 — Read-Only)**: Read-only API surface under `/mcp` for Microsoft 365 Copilot / Copilot Studio integration. ~24 GET endpoints covering user profile, assignments, time entries, expenses, projects, deliverables, RAIDD, portfolio views, financials, CRM deals, and saved status reports. Supports both session-based auth (`x-session-id`) and OAuth bearer tokens (JWT validated against Entra app registration via JWKS). Bearer auth implemented in `server/auth/mcp-bearer-auth.ts` using `jsonwebtoken` + `jwks-rsa`. OpenAPI definition at `docs/constellation-mcp-openapi.json`. Connector setup guide at `docs/MCP_CONNECTOR_SETUP.md`. Endpoint reference at `docs/MCP_README.md`.
- **Copilot Studio Agent**: Conversational AI agent deployed in Copilot Studio for Teams and M365 Copilot. Uses Power Platform Custom Connector to invoke all MCP endpoints. Multi-tenant Entra authentication. Read-only access to all Constellation data with RBAC enforcement.
- **Teams Custom Tab**: Embeddable project detail pages at `/embed/projects/:id` for Microsoft Teams Custom Tab integration. Chromeless layout (no sidebar/header/nav). Teams SDK v2 SSO authentication via `POST /api/auth/teams-sso` (validates JWT, creates Constellation session). CSP `frame-ancestors` headers set on all `/embed/*` routes for Teams/Office/SharePoint domains. Supports query params: `tab`, `theme` (light/dark/contrast), `readonly`. Teams app manifest at `teams/manifest.json` (v1.16 schema, references SCDP-Content app registration). Auth fallback shows clean "Sign In Required" UI instead of redirect loops.
- **Teams App Package Self-Service**: Organization Settings > Integrations tab includes a self-service card for downloading or publishing the Teams app manifest package. Backend at `server/routes/teams-app.ts` generates a ZIP (manifest.json + icons) with dynamic URL/domain/Entra App ID substitution. Supports direct publish to tenant app catalog via Graph API (`AppCatalog.ReadWrite.All`). Download fallback for manual upload to Teams Admin Center. Input validation for domain, UUID, and app name length. Catalog status indicator shows whether app is published and ready for auto-tab.
- **Teams Tab Auto-Install**: When a project channel is created via `POST /api/planner/teams/:teamId/channels` with a `projectId`, the system automatically: (1) looks up the Constellation app in the tenant's Teams app catalog, (2) adds a project dashboard tab pointing at `/embed/projects/:id`, and (3) persists the project-channel link to the `project_channels` table with tenant isolation validation. Standalone endpoint `POST /api/planner/teams/:teamId/channels/:channelId/constellation-tab` for adding tabs to existing channels. Catalog status check at `GET /api/teams/catalog-status`. Auto-tab is non-blocking — channel creation succeeds even if tab add fails (e.g., app not in catalog).
- **Theme System**: Modular CSS variable-based theming with three production themes: Aurora (warm earth tones), Night Sky (deep navy), Navigator's Chart (clean teal). Theme files at `client/src/themes/`. Active theme imported in `client/src/index.css` (must precede `@tailwind` directives). Guide at `docs/SYNOZUR_THEME_GUIDE.md`.
- **Navigation Sub-Groups**: Sidebar sections use `SubGroupLabel` component for grouping related items. My Workspace (Daily Work, Time & Expenses, Tracking), Financial (Expenses, Rates), Administration (Users & Org, System Tools, AI Config), Platform (Tenant Management, Reference Data).

### Multi-Tenancy
- **Architecture**: UUID-based tenant IDs, data isolation, service plans, and subdomain routing.
- **Automatic Tenant Assignment**: Users are auto-assigned to tenants on login.
- **Platform Roles**: `global_admin` and `constellation_admin` roles for managing all tenants.
- **Settings Separation**: Tenant-specific settings in Organization Settings; platform-wide settings in System Settings.
- **User Management**: Tenant-isolated user listings and platform admin tools for managing user memberships across tenants.
- **Branding & Vocabulary**: Configurable tenant-level branding and tenant-scoped vocabulary.
- **Multi-Tenant Identity**: Uses a global `users` table and `tenant_users` for tenant-specific access and roles.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React, Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form. **`apiRequest` pattern**: `apiRequest(url, options?)` — NOT the 3-arg form `apiRequest(method, url, body)`. Queries should use the default `queryFn` (configured in `queryClient.ts`) which auto-injects the `x-session-id` header — never use raw `fetch()` in custom `queryFn` for authenticated endpoints (causes 401 → session recovery → reload loop).
- **PDF Generation**: Puppeteer.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client.
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI, Azure AI Foundry.
- **Per Diem Rates**: GSA Per Diem API (CONUS) and DoD OCONUS rates database.
- **Airport Codes**: IATA 3-letter code database.
- **Exchange Rates**: Open Exchange Rates API.
- **HubSpot CRM Integration**: HubSpot API with per-tenant OAuth 2.0 for Deals, Companies, Contacts, and activity logging.