# Constellation Product Roadmap

**Synozur Consulting Delivery Platform (SCDP)**

Strategic product roadmap outlining planned features, enhancements, and future direction for Constellation.

---

## Table of Contents

1. [Vision & Strategy](#vision--strategy)
2. [Recently Completed](#recently-completed)
3. [Current Focus (Q1 2026)](#current-focus-q1-2026)
4. [Near-Term Priorities (Q2 2026)](#near-term-priorities-q2-2026)
5. [Medium-Term Goals (H2 2026)](#medium-term-goals-h2-2026)
6. [Long-Term Vision (2027+)](#long-term-vision-2027)
7. [Feature Status Legend](#feature-status-legend)

---

## Vision & Strategy

### Our Mission
Constellation empowers consulting organizations to deliver exceptional client value by providing a comprehensive platform that streamlines project delivery, resource management, and financial operations from initial estimation through final billing.

### Strategic Pillars

**1. User Experience Excellence**
- Intuitive workflows that reduce administrative burden
- Mobile-optimized interfaces for field consultants
- Personalized dashboards based on role and responsibilities

**2. Intelligent Automation**
- AI-powered project insights and recommendations
- Automated synchronization with Microsoft 365 ecosystem
- Smart notifications and proactive alerts

**3. Enterprise Integration**
- Seamless Microsoft 365 integration (Teams, Planner, SharePoint)
- QuickBooks Online bidirectional sync
- API-first architecture for extensibility

**4. Multi-Tenant SaaS Platform**
- Scalable architecture supporting multiple organizations
- Flexible service plans (Trial, Team, Enterprise, Unlimited)
- Self-service onboarding and management

### Success Metrics
- **User Adoption:** 95% active user engagement within 30 days
- **Time Savings:** 40% reduction in administrative overhead
- **Accuracy:** 90% estimate accuracy within ±15%
- **Client Satisfaction:** NPS score of 50+
- **Platform Reliability:** 99.5% uptime SLA

---

## Recently Completed

The following major features have been delivered and are live in production. See the [Changelog](/changelog) for detailed release notes.

### ✅ Galaxy Client Portal API
**Completed:** May 2026 (v2.5)
- New external HTTP API mounted at `/api/galaxy/v1/*` for approved client-portal apps to read project artifacts and post sign-offs on behalf of client users
- OAuth2 authorization-code (delegated) and client-credentials grants, tokens issued by Constellation's authorization server and authenticated against Microsoft Entra
- Tenant- and client-scoped tokens — every token carries `tenantId` and `clientId` claims, all data scoped automatically
- Per-app registration UI under **Settings → Galaxy API** (name, redirect URIs, webhook URL, allowed origins, scope ceiling)
- Hashed storage of client secret and webhook signing secret; one-time display on creation with rotation flow
- Document downloads streamed through the portal (no direct SharePoint exposure)
- Signed webhook delivery for project, estimate, sign-off, and document events with retry and audit
- Galaxy admin page (`/admin/galaxy`) for app management, scope review, and webhook delivery inspection
- Client Portal Approvals & Sign-offs surface — payment milestones, status reports, and estimate sign-offs exposed to client users
- Comprehensive test suites for auth, scopes, routes, and webhook delivery
- Documentation at `docs/galaxy-api.md`

### ✅ Notifications System
**Completed:** May 2026 (v2.5)
**Note:** Previously deprioritized after Feb 2026 user feedback; promoted and delivered alongside the Galaxy and digest work in v2.5.
- In-app notification center with bell icon, dropdown, full-page view (`/notifications`), and per-user preferences page (`/notification-preferences`)
- Real-time unread count surfaced in browser tab title for active sessions
- Opt-in browser push notifications via the standard Web Push API
- Weekly digest emails delivered through SendGrid with per-tenant schedule configuration (day/time/timezone)
- Digest open tracking via SendGrid webhook; delivery stats surfaced on the Scheduled Jobs admin page
- Notification hooks expanded across platform events (allocations, milestones, sign-offs, expense approvals, RAIDD updates, status report acknowledgements)
- Granular per-type user preferences with email + in-app channels, fully tenant-scoped

### ✅ Multi-Currency Estimates & Invoicing
**Completed:** May 2026 (v2.5)
- Estimate-level quote currency separate from cost currency, with full schema migration and SOW propagation
- Quote-currency totals shown on invoice batches when they differ from cost currency
- Client-currency amounts on estimate PDFs and Sub-SOW exports (Task #131)
- Currency picker on the expense edit form
- Foundation for international engagements without manual currency translation

### ✅ Excel-Like Time Grid 2.0
**Completed:** May 2026 (v2.5)
- Two-tab time grid (current + prior week) with full Excel-style keyboard navigation
- Drag-fill that extends a series instead of just copying cell values
- Virtualised rendering for large grids (Task #138)
- Clipboard parser with multi-row paste support and unit test coverage (Task #137)
- Project picker now shows and searches by project code
- State-machine row management with covering unit tests

### ✅ Estimate Version History
**Completed:** May 2026 (v2.5)
- Automatic version snapshot on first edit (Task #113) and on every email/send (Task #115)
- History panel showing who saved each snapshot and when (Task #114)
- Side-by-side compare and restore from any prior version
- Backfilled snapshots so existing estimates surface their full history

### ✅ Client Portal Approvals & Sign-offs
**Completed:** May 2026 (v2.5)
- Sign-off badges on estimates and milestone list views (Task #134)
- Inline status report acknowledgement (Task #136)
- Admin sign-offs audit log page (Task #135) capturing actor, target, comment, and source
- Payment milestones exposed to client portal users (Task #89)
- Cascade allocations: shifted-from-milestone indicator (Task #91) and PM "undo" for an applied cascade date shift (Task #90)

### ✅ Payment Milestone Billing Automation
**Completed:** May 2026 (v2.5)
- Auto-generate invoice batch when a payment milestone is marked Invoiced (Task #87)
- Payment milestone billing status surfaced on the portfolio dashboard (Task #88)
- Hours budget status on the project list dashboard (Task #82)
- Project drops below 10% budget alert (Task #83)
- Empty-state callout when a project has no approved estimate hours (Task #84)

### ✅ AI Project Manager Agent
**Completed:** May 2026 (v2.5)
- New conversational agent (Task #143) layered on top of the existing Copilot Agent infrastructure for project-management workflows
- Operates against the MCP read + write surfaces (clients, estimates, HubSpot, Teams) shipped in v2.4
- Final iteration tuned for narrative status updates, cascade triage, and sign-off chase-down

### ✅ Planner Sync Robustness & LWW
**Completed:** May 2026 (v2.5)
- Last-write-wins conflict resolution for bidirectional Planner sync (Task #126)
- Admin alerts on sync failures with actionable context
- Improved retry/backoff on Graph throttling
- Resilience review fixes through round 4 of code review

### ✅ Operational & Performance Improvements
**Completed:** May 2026 (v2.5)
- Persistent in-memory cache across restarts via startup warm-up loader (Task #106)
- Invoice list speed-up using bulk-query approach (Task #105)
- Server-side pagination on the Users page (Task #116)
- Auto-cleanup of old `background_jobs` rows (Task #121)
- Background Jobs link added to admin sidebar
- Financial-comparison report rewritten to use SQL aggregation (Task #117) — major perf win on large tenants
- Global deep-link search across projects, users, and time entries
- Data-quality warnings now expand to show affected items (Task #86)
- Calendar suggestion panel: expandable per-event detail (Task #108)
- "Visible to clients" toggle on RAIDD entries
- Copilot Studio client IDs synced into the Azure app manifest (Task #52)

### ✅ Copilot Agent Write Activities (Phases 0–5)
**Completed:** April 2026 (v2.4)
- See Q2 priority section for full delivery detail. All write phases shipped behind the `MCP_WRITES_ENABLED` flag with idempotency, dry-run, and audit envelope.

### ✅ Multi-Tenancy Architecture
**Completed:** February 2026 (Phases 1-4, 6)
- UUID-based tenant IDs with full data isolation
- Service plans (Trial, Team, Enterprise, Unlimited) with plan management UI
- Self-service signup flow (3-step wizard: org info, admin account, plan selection)
- Plan lifecycle enforcement with 14-day grace period and warning banners
- Scheduled plan expiration job (daily at 2:00 AM)
- Tenant switcher for users with multiple memberships
- Platform admin UI for managing tenants, service plans, and users
- Automatic tenant assignment on login via Azure AD mapping, email domain, or fallback
- Platform roles (`global_admin`, `constellation_admin`) with elevated cross-tenant access
- Tenant-specific settings: company info, branding, invoice footer, email templates
- Tenant-scoped vocabulary customization
- Per-tenant SSO configuration support
- Subdomain routing deferred (requires custom DNS + wildcard SSL)

### ✅ Retainer & Commercial Schemes
**Completed:** January 2026
- Retainer estimate type with creation wizard and auto-generated structure
- Optional multi-rate tiers per month (e.g., Senior at $250/hr for 35hrs + Junior at $150/hr for 20hrs)
- Live retainer month management at project level (independent of locked estimates)
- Add/edit/delete/extend retainer stages with month status indicators
- Auto-generated end-of-month payment milestones from rate tier calculations
- Utilization tracking for retainer engagements
- Project-level billing and cost rate overrides (Contracts > Rate Overrides tab)

### ✅ Resource Management & Capacity Planning
**Completed:** January 2026
- Dual List/Timeline views for resource allocation
- Capacity planning dashboard with utilization metrics
- Conflict detection for over-allocated resources
- Portfolio timeline view (dedicated page) for cross-project visibility
- Project engagement tracking with role, workstream, and hours allocation

### ✅ Per Diem & Expense Automation
**Completed:** December 2025
- GSA Per Diem API integration for CONUS rates (automatic by city/state/zip)
- OCONUS per diem rate database (DoD rates) with admin management
- Travel day calculation (75% rate for partial days)
- Automatic M&IE (Meals & Incidental Expenses) calculation
- Airport code reference database (5,163 IATA codes)
- Comprehensive expense approval workflow with finite state machine
- Contractor expense invoices with PDF and QuickBooks CSV export
- Receipt bundle download for expense reports

### ✅ Financial Reporting
**Completed:** January 2026
- Revenue, cost, profit, and margin reporting by client and project
- KPI summary dashboard with health scoring
- Budget utilization metrics and variance tracking
- Role-based visibility controls for financial data
- Dynamic vocabulary labels in all reports

### ✅ Mobile Web Optimization
**Completed:** December 2025
- Responsive navigation with mobile-optimized sidebar and bottom navigation
- Touch-friendly interfaces across all modules
- Mobile-responsive modals (bottom-sheet design pattern)
- Optimized table views and data displays for smaller screens

### ✅ AI-Powered Features
**Completed:** February 2026
- AI help chat widget accessible from every page
- AI-generated estimate and invoice narratives
- "What's New" changelog modal with AI-generated summaries
- Tenant-level admin toggle for update notifications
- Chat-based report queries

### ✅ Microsoft Planner Integration
**Completed:** January 2026
- Bidirectional sync of project assignments with Planner tasks
- Automatic sync every 30 minutes for enabled projects
- Task creation with bucket mapping based on project stages
- User assignment mapping between Constellation and Azure AD
- Status synchronization and date synchronization
- Scheduled job monitoring with admin UI

### ✅ Scheduled Jobs System
**Completed:** January 2026
- Background job system for expense reminders, time reminders, and Planner sync
- Admin monitoring UI with execution history and statistics
- Manual trigger buttons for on-demand execution
- Multi-tenant scoping for job configuration

### ✅ Program Estimates & Staffing Blocks
**Completed:** March 2026
- New "Program" estimate type with week-based staffing blocks
- Block-level fields: start week, duration (weeks), utilization percent (20/40/60/80/100%)
- Gantt-style timeline view for visualizing staffing blocks across program duration
- PM Wizard for guided program estimate creation
- Program vocabulary mapping (epics displayed as "Programs")
- Seamless integration with existing estimate workflows (conversion to project, milestones, billing)

### ✅ Portfolio Manager Role
**Completed:** March 2026
- New "portfolio-manager" role tier between PM and executive
- Cross-project visibility for assigned portfolio of projects
- Access to portfolio timeline, resource management, and financial reporting
- Role-based sidebar navigation with portfolio-scoped views
- Restricted from platform admin and tenant administration functions
- Tenant-scoped role assignment via user management

### ✅ HubSpot CRM Integration
**Completed:** March 2026
- OAuth2 authentication flow with HubSpot (tenant-scoped CRM connections)
- CRM Deals page for browsing and filtering HubSpot deals above configurable threshold
- Pipeline and deal stage visibility with amount tracking
- Deal-to-estimate linking with bidirectional object mapping
- Contact import from HubSpot deals and companies
- Company association mapping between Constellation clients and HubSpot companies
- Automatic deal notes posted on invoice finalization
- CRM sync status tracking with error reporting
- Company contact search and import capabilities

### ✅ SharePoint Embedded Document Storage
**Completed:** March 2026
- Full SharePoint Embedded (SPE) integration as primary document storage tier
- Per-tenant SPE container provisioning with Azure AD tenant isolation
- Smart storage layer directing files to SPE or Object Storage based on tenant configuration
- Direct file download via Microsoft Graph API (no metadata lookup required)
- File Repository page with intelligent document type inference from folder paths
- Expandable metadata panel and file statistics dashboard with document type breakdown
- File reorganization tools to move files from nested to proper top-level SPE folders
- End-to-end receipt download pipeline for SPE-stored files
- Invoice receipt bundler using direct Graph API downloads
- Container management interface for administrators
- Custom column support with SharePoint-safe naming conventions

### ✅ MCP Server & Constellation Copilot Agent
**Completed:** March 2026
- MCP server with ~24 read-only endpoints under `/mcp` for AI assistant integration
- Power Platform Custom Connector with OpenAPI spec import
- Copilot Studio agent for conversational data access through Teams and M365 Copilot
- Bearer token authentication via JWKS with multi-tenant Entra support
- Persistent status report storage — AI-generated text and PPTX reports saved to database with Status Reports tab in project UI
- GPT-5.4 support via Azure AI Foundry with multi-provider AI architecture

### ✅ Teams Custom Tab Integration
**Completed:** March 2026
- Constellation projects embed directly as Microsoft Teams tabs for in-context project access
- Chromeless layout (no sidebar/header) when running inside Teams
- Tab deep-linking via `?tab=` parameter for all project tabs
- Read-only enforcement — all mutating actions hidden in embed mode
- Teams SSO authentication flow with popup sign-in
- Configurable tab setup page and embed dashboard
- Three-app Entra ID architecture (SCDP-Content, MCP Connector, Copilot Agent)
- Teams app manifest at `teams/manifest.json`

### ✅ Navigation Reorganization
**Completed:** March 2026
- Sidebar navigation reorganized with sub-group labels for improved information architecture
- My Workspace: Daily Work, Time & Expenses, Tracking sub-groups
- Financial: Expenses, Rates sub-groups
- Administration: Users & Organization, System Tools, AI Configuration sub-groups
- Platform: Tenant Management, Reference Data sub-groups
- Disambiguated menu labels (Dashboard → My Dashboard, Time → Timesheets, etc.)
- Mobile navigation updated to match

### ✅ Theme System
**Completed:** March 2026
- Modular CSS variable-based theme architecture
- Three production themes: Aurora, Night Sky, Navigator's Chart
- Theme files at `client/src/themes/`
- Integration guide at `docs/SYNOZUR_THEME_GUIDE.md`

### ✅ Nebula UX Design System
**Completed:** March 2026
- Aurora primary hero background with star particle effects on login and home pages
- Glow utility CSS classes (`.glow-primary`, `.primary-cta-glow`) for interactive elements
- Active sidebar styling with border accent, gradient background, and glow
- Entrance stagger animations on dashboard KPI cards, feature cards, and stat tiles
- Typography weight contrast (font-black values, font-light labels)
- Light mode nebula tint on background
- Animated nebula card borders with conic-gradient rotation (dark mode)
- Nebula skeleton shimmer for loading states
- Reusable `aurora.tsx` component with configurable intensity, theme, and particles

### ✅ Executive Narrative Reporting
**Completed:** March 2026
- AI-generated leadership summaries from project activity, milestones, RAIDD, and financials
- Save and export executive narratives as branded PowerPoint slide decks
- Executive Narratives tab on Reports page for viewing, managing, and re-exporting saved narratives
- Revenue calculation refined to sum only time + milestone invoice lines (excludes expense, tax, discount, no-charge)
- Shared activity aggregation service powering narratives and MCP/Copilot endpoints

### ✅ Teams Channel Provisioning
**Completed:** March 2026
- Teams Channel Provisioning UI for creating Teams and channels from project, estimate, and client detail pages
- Cross-tenant blocking prevents Teams provisioning for multi-tenant projects
- Auto-resolve team owner from the requesting user's Azure AD identity
- Async 202 response handling with Location header polling for team creation
- Duplicate team name detection before creation
- Embedded Teams navigation flyout
- Planner sync fix: bidirectional sync no longer overwrites locally completed task status

### ✅ PowerPoint Status Report Templates
**Completed:** March 2026
- PPTX slide template system with selectable branded templates
- Dynamic text injection (project name, dates, summary data) into slide placeholders
- Branded backgrounds, logos, and design elements on template slides
- Proper layout content handling for empty slides
- Multiple subtitle lines on template title slides

### ✅ Page Analytics
**Completed:** March 2026
- Anonymous page view tracking for public pages (home, login, signup)
- Page Analytics dashboard in System Settings (platform admin only)
- Session-based unique visitor identification
- Configurable date range filtering

### ✅ Client Document Hub
**Completed:** March 2026
- MSA/NDA upload and management from client detail pages
- Document type classification and metadata

### ✅ JIT User Provisioning
**Completed:** March 2026
- Just-In-Time automatic provisioning of new user accounts on Microsoft SSO first login
- No pre-registration required for new users

### ✅ SEO & Splash Page Optimization
**Completed:** March 2026
- Meta tags, Open Graph tags, and structured data on public-facing pages
- Improved search engine and social media visibility

---

## Current Focus (Q1 2026)

> **Priorities informed by February 2026 user feedback session** — Stack ranking (Borda scores), marketplace coin allocation, and 2×2 priority matrix exercises identified clear consensus around accounting integration, AI-driven status reporting, and a high-impact quick-win bug fix.

### ✅ Quick Win: Fix Export PDF Bug for Expense Reports

**Status:** ✅ Complete  
**Completed:** February 2026  
**Priority Matrix:** High Impact / Low Effort  
**User Feedback:** Identified unanimously as the top quick win — a high-impact fix that delivered immediate value with minimal effort.

---

### ✅ Priority: Advanced Resource Management — Phases 1-2

**Status:** ✅ Complete  
**Completed:** April 2026  
**Design Document:** `docs/design/advanced-resource-management.md`  
**Value Proposition:** Multi-role capability mapping and capacity profiles lay the foundation for smart assignment suggestions, cross-project rebalancing, and pipeline-aware capacity planning in later phases.

#### Phase 1: Role Capabilities & Capacity Profiles
- New `user_role_capabilities` table for many-to-many user-role mapping with proficiency levels (primary/secondary/learning)
- Optional per-role cost/billing rate overrides per person
- Per-person `weeklyCapacityHours` (default 40), `capacityNotes`, `capacityEffectiveDate` on users table
- UI: "Capabilities & Capacity" section on user edit dialog, role badges and weekly hours on user list
- API: Full CRUD for role capabilities, capable-users-by-role query, capacity profile fields on user PATCH

#### Phase 2: Planner Sync Protection for Generic Roles
- Generic role allocations (roleId set, no personId) get `[RoleName]` prefix in Planner task title
- `ROLE: RoleName` added to task notes for context
- Sync field whitelist documented: Constellation owns role/person/rates; Planner owns status/dates/percentComplete
- Prevents future bidirectional sync from overwriting role context

**Note:** Phases 3-6 (smart suggestions, workload rebalancing, capacity analytics, bulk import) were completed in April 2026.

---

### ✅ Priority: Enhanced Status Reporting

**Status:** ✅ Complete  
**Completed:** February 2026  
**User Feedback:** Ranked #2 overall in stack ranking with strong marketplace coin support. The cohort expressed high interest in AI-driven efficiency enhancements for project communication.  
**Value Proposition:** Transform existing project activity data into polished, AI-generated status reports that can be viewed, shared, and delivered on a recurring schedule — reducing the manual effort of writing weekly and monthly project updates.

#### Phase 1: Interactive Status Report Generation ✅ Complete

**On-Screen Report Viewer**
- New dialog/modal accessible from the project detail page
- Displays the generated text summary of project activity for a selected time period
- Supports weekly and monthly period selection
- Copy-to-clipboard button for easy pasting into emails or documents
- Download as plain text or formatted document

**AI-Powered Report Processing**
- AI-generated narrative summary from raw activity data (time entries, expenses, assignments, milestones)
- Configurable summary style (executive brief, detailed update, client-facing)
- Editable output — PMs can review and tweak the AI-generated text before sharing
- RAIDD integration — open risks, issues, action items, dependencies, and decisions automatically included
- Critical and overdue items highlighted in reports
- RAIDD counts displayed in the report metadata bar
- Consistent formatting across all projects for uniform reporting

**Export & Sharing**
- Copy-to-clipboard for easy pasting into emails
- Download generated report as formatted text
- PowerPoint (PPTX) export with branded slide deck

**Persistent Report Storage ✅ Complete (v1.7)**
- All generated reports (text and PPTX) automatically saved to `status_reports` database table
- Status Reports tab on project detail page listing all saved reports
- View, finalize, and delete reports from the UI
- Full CRUD API with tenant isolation and project ownership enforcement
- MCP endpoints for Copilot Agent access to saved reports

#### Phase 2: Automated Scheduling (Future Enhancement)

**Scheduled Report Delivery**
- Project-level setting to enable automatic weekly or monthly reports
- Configurable delivery day and recipients (PM, stakeholders, client contacts)
- Reports auto-generated and emailed on schedule
- Report history archive accessible from project detail page
- Admin dashboard for monitoring scheduled report delivery across all projects

---

### ✅ Priority: RAIDD Log

**Status:** ✅ Complete  
**Completed:** February 2026  
**Value Proposition:** Provide project managers with a structured, trackable register for Risks, Action Items, Issues, Dependencies, and Decisions (RAIDD) — improving project governance, accountability, and visibility into items that can impact delivery.

#### Core Features ✅ Complete

**RAIDD Register**
- Dedicated RAIDD tab within the project detail page
- Entry types: Risk, Issue, Action Item, Dependency, Decision
- Fields per entry: title, description, type, status, priority/severity, impact, likelihood, owner, assignee, due date, resolution notes, category, tags, mitigation plan
- Filterable and sortable table view by type, status, priority, owner, or due date
- Status workflow: Open → In Progress → Mitigated/Resolved/Closed/Deferred/Superseded
- Color-coded severity indicators (Critical, High, Medium, Low)
- Governance rules: decisions immutable after status change, risks convert to issues with lineage preserved

**Assignment & Tracking**
- Assign each item to a project team member (owner and assignee)
- Due date tracking with overdue highlighting
- Reference numbering for organized tracking
- Category tagging for classification

**Export & Reporting**
- Export full RAIDD log as Excel spreadsheet
- Filtered export (e.g., only open risks, only decisions)
- Summary view showing counts by type and status

**AI Integration**
- AI-generated summary of open risks and issues included in status reports
- RAIDD data automatically pulled into Enhanced Status Reports
- Critical and overdue warnings highlighted in AI-generated narratives

**Portfolio RAIDD Dashboard ✅ Complete**
- Cross-project RAIDD dashboard at `/portfolio/raidd` for portfolio-level risk visibility
- Summary cards: open risks, issues, action items, dependencies, critical/high counts, overdue items, closed this month
- Filterable by status, type, priority, and project
- Grouping by project, type, priority, or status
- XLSX export for stakeholder reporting
- Role-restricted access (admin, PM, executive)

#### Future Enhancements
- Link RAIDD items to specific project milestones or stages
- Notification triggers when items approach or pass due dates (integrates with Notifications System)
- RAIDD templates with pre-populated common risks by project type

---

## Near-Term Priorities (Q2 2026)

### ☁️ Cloud Deployment Migration: GCP → Azure

**Status:** 📋 Planned — Replit Engineering Task  
**Target Completion:** Q2 2026  
**Value Proposition:** Migrating Constellation's deployment infrastructure from GCP to Azure co-locates the application with its core dependencies (Azure AD, SharePoint Embedded, AI Foundry, Microsoft Graph), reducing latency for API calls, simplifying network architecture, and aligning with Synozur's Microsoft-first strategy.

#### Deliverables
- Coordinate with Replit engineering team for deployment target migration
- Validate all environment variables, secrets, and database connectivity transfer
- Verify SharePoint Embedded and Microsoft Graph API latency improvements (same-cloud advantage)
- Validate AI Foundry endpoint connectivity from Azure-hosted environment
- Smoke test all integrations (HubSpot, SendGrid, Outlook, SharePoint) post-migration
- Update deployment documentation and runbooks

**Note:** This is a Replit engineering task — the Constellation team provides requirements and validates the result, but the infrastructure change is executed by the Replit platform team.

---

### ✅ MCP Server & Copilot Agent

**Status:** ✅ Complete  
**Completed:** March 2026  
**Reference:** Vega MCP server configuration (successful production pattern)  
**Value Proposition:** Expose Constellation's project management, financial, and resource data through a read-only MCP server, enabling AI assistants (Copilot, Claude, etc.) to query and interact with Constellation data directly — matching the architecture already proven with Synozur's Vega product.

#### Delivered
- MCP server with ~24 read-only GET endpoints under `/mcp`
- RBAC-enforced access with tenant-scoped data isolation
- Query endpoints for user profile, assignments, time entries, expenses, projects, deliverables, RAIDD, estimates, invoices, CRM deals, portfolio views, and saved status reports
- Bearer token authentication via JWKS (supports v1 and v2 Entra token issuers)
- Power Platform Custom Connector with OpenAPI spec import
- **Constellation Copilot Agent** in Copilot Studio — conversational access to all MCP data
- Teams channel deployment for chat and channel-based agent interactions
- Multi-tenant authentication (Entra `common` authority)
- Connector setup guide at `docs/MCP_CONNECTOR_SETUP.md`
- Endpoint reference at `docs/MCP_README.md`

---

### 🤖 Copilot Agent Write Activities

**Status:** ✅ Complete — Phases 0-5 shipped (April 2026)
**Target Completion:** Q2 2026 ✅
**Value Proposition:** Extend the Copilot Studio agent beyond read-only queries so it can drive the full early-stage consulting workflow from a conversation: discover clients, create them, generate estimates from narratives or fixed-hour/fixed-price summaries, and wire up HubSpot deals and Teams channels — without leaving Teams or M365 Copilot.

#### Phase 0 — Write Infrastructure ✅ (April 2026)
- Versioned `/mcp/v1/*` write namespace alongside existing read surface
- `mcp_write_audit` table with per-request idempotency, replay cache, request-hash conflict detection
- `MCP_WRITES_ENABLED` feature flag (default off); `X-Idempotency-Key` required on every write; `?dryRun=true` universal preview
- Response envelope extended with `idempotent`, `dryRun`, `auditId`, `correlationId`
- Stricter write role policy (admin, pm, portfolio-manager; dropped executive and billing-admin from writes)
- Diagnostic `POST /mcp/v1/ping` endpoint
- OpenAPI spec bumped to v1.1.0; connector setup doc rewritten to cover the write flow

#### Phase 1-2 — Client Discovery & Creation ✅ (April 2026)
- `GET /mcp/clients` returns linkage signals (`hasHubspotLink`, `hasTeamsLink`, `activeEstimateCount`) so the agent can branch before acting
- `POST /mcp/v1/clients` with near-match duplicate detection (normalized-name + Levenshtein); returns 409 with candidates unless `force: true`

#### Phase 3 — Estimate Creation ✅ (April 2026)
- Three estimate shapes — narrative (AI-generated, ≤8 summary line items), block-of-hours, fixed-price
- Uses existing `aiService.generateEstimateFromNarrative()` with tenant rate catalog
- Prompt-injection sanitization on `narrative` field
- Pre-create duplicate check for active estimates on the same client (409 unless `force: true`)
- Shared `createEstimateCore()` helper + `capEstimateLineItems()` (hard cap 8 items)
- OpenAPI spec bumped to v1.2.0

#### Phase 4 — HubSpot Linkage ✅ (April 2026)
- `GET /mcp/v1/hubspot/search?type=company|deal&query=` — tenant-scoped CRM search
- `POST /mcp/v1/clients/:id/hubspot-link` with `createIfMissing` flag, writes `crm_object_mappings`
- Uses `createHubSpotCompany()` / `createHubSpotDeal()` from existing hubspot-client.ts

#### Phase 5 — Teams Team & Channel Linkage ✅ (April 2026)
- `POST /mcp/v1/clients/:id/teams-link` — ensures `client_teams` row, creates team via Graph when `createIfMissing`
- `POST /mcp/v1/projects/:id/teams-channel` — creates channel via `plannerService.createChannel()`, writes `project_channels` row
- Partial-failure envelope: `warnings[]` preserved; no rollback of prior successful steps

---

### 💹 Priority: QuickBooks Online Integration for Consultants

**Status:** 📋 Planned  
**Target Completion:** Q2 2026  
**User Feedback:** Ranked #1 overall in stack ranking with the highest marketplace coin allocation (94 coins), indicating strong consensus on its importance. Two QuickBooks-related ideas (Accounting Integration and Tool Integrations) collectively dominated the feedback session. The 2×2 priority matrix scored it as high impact but also high effort, so detailed scoping and resource planning is recommended before implementation begins.  
**Value Proposition:** Bidirectional sync with QuickBooks Online eliminates manual data entry and ensures financial accuracy for consultants managing their own books.

#### Deliverables
- OAuth2 authentication with QuickBooks Online
- Client → QBO Customer mapping interface
- Role/Service → QBO Items mapping
- Expense categories → QBO Account mappings
- Automated invoice creation in QBO (draft status)
- Batch ID deduplication to prevent duplicates
- Webhook integration for sync status updates
- QBO sync dashboard with error reporting
- Retry mechanism for failed syncs
- Real-time validation and error handling

**Implementation Note:** Given the high effort rating from user feedback, a detailed scoping and resource allocation plan should be completed before development begins.

---

### 🤝 Priority: Microsoft 365 Teams Integration

**Status:** 🔶 Partially Complete  
**Target Completion:** Q2 2026  
**Value Proposition:** Seamless Microsoft 365 integration enhances team collaboration and centralizes project communications.

#### Delivered (v1.8–v2.0)

**Teams Custom Tab ✅ Complete (v1.8)**
- Constellation projects embed as Microsoft Teams tabs with chromeless layout
- Tab deep-linking, read-only enforcement, SSO authentication
- Configurable tab setup and embed dashboard
- Teams app manifest with three-app Entra architecture

**Teams Channel Provisioning ✅ Complete (v2.0)**
- Teams Channel Provisioning UI from project, estimate, and client detail pages
- Auto-resolve team owner from Azure AD identity
- Async 202 response handling with Location header polling
- Duplicate team name detection
- Cross-tenant blocking for multi-tenant projects
- Embedded Teams navigation flyout

#### Remaining Deliverables

**Microsoft Teams Automation (Phase 2)** ✅ *Completed v2.1 (April 3, 2026)*
- ~~SharePoint site provisioning with Team~~ ✅
- ~~Team member management based on project assignments~~ ✅
- ~~Automated member add/remove on assignment changes~~ ✅
- Guest user invitation workflows (Azure AD B2B) ✅
- Automation audit logging ✅
- ~~SharePoint project overview news post (auto-created on channel provisioning, includes project summary + quick links to Constellation project page and Teams channel)~~ ✅
- ~~"Push to SharePoint" button on project Teams panel for manual re-provision of existing channels~~ ✅

**Microsoft Teams Automation (Phase 3) — SharePoint Living Updates**
- On-demand "Push Project Update" action: publishes a new SharePoint news post reflecting current project health (milestone progress, budget status, recent activity, open risks) at any point in the engagement lifecycle
- Scheduled project status broadcasts: configurable cadence (weekly/monthly) that auto-generates and posts a status snapshot to the team site news feed
- Status post format mirrors the Executive Narrative style — AI-generated prose summary with structured data
- Integration with existing Status Reports: option to cross-post an approved status report as a SharePoint news post
- Re-uses the same Graph API page publishing infrastructure built in Phase 2

**Enhanced Planner Integration (Phase 2)** — 🔶 *Partially shipped (v2.5)*
- ✅ Conflict resolution with last-write-wins (Task #126, May 2026)
- ✅ Admin alerts on sync failures with actionable context (Task #126)
- ✅ Comprehensive audit trail for all sync activities
- [ ] Bidirectional sync via Microsoft Graph webhooks (still polling-based today)
- [ ] Multitenant app registration (so other tenants can consent without creating their own app)

**Project Creation UX Enhancement**
- M365 integration options in project creation dialog
- Smart detection: "First project" vs "Add to existing Team"
- Visual preview of resources to be created
- Checkbox options for Teams, Planner, auto-member management

**External User Support**
- Graceful handling of non-Azure AD consultants
- Guest user invitation workflow
- External collaborator permissions management

**Design Reference:** `docs/design/microsoft-365-project-integration.md`

---

### 💼 Priority: Advanced Commercial Schemes

**Status:** 📋 Planned  
**Target Completion:** May 2026  
**Value Proposition:** Expand billing model support beyond retainers to cover all engagement types.

#### Deliverables

**Milestone Fixed Fee Management**
- Milestone definition with acceptance criteria
- Percentage complete tracking interface
- Milestone payment scheduling
- Partial milestone billing support
- Milestone variance reporting
- Client acceptance workflow with digital sign-off

**Enhanced Time & Materials (T&M)**
- Rate calculation at service date
- Not-to-exceed (NTE) budget tracking with alerts
- T&M profitability analysis
- Progress-to-budget real-time reporting

**Pricing Privacy & Rate Management**
- Separate rack rates (internal) from charge rates (client-facing)
- Rate margin calculations and reporting
- Field-level security to hide cost data from non-admins
- Rate grandfathering for existing engagements

---

### ✅ Notifications System

**Status:** ✅ Complete
**Completed:** May 2026 (v2.5)
**Note:** Previously deprioritized in February — delivered ahead of plan in v2.5. See "Recently Completed" for the full feature inventory. Remaining ideas (admin-broadcast notifications, mobile push) are tracked in the backlog.

---

### 📊 Priority: Advanced Financial Reporting

**Status:** 🚧 In Progress  
**Target Completion:** Q2 2026  
**Value Proposition:** Complete the financial reporting suite with client contribution analysis, estimate-vs-actual accuracy metrics, and revenue forecasting — giving executives and billing admins the data they need for strategic decisions.

#### ✅ Completed (February–May 2026)

**Year-over-Year Invoice Comparison**
- Year-over-year revenue analysis with side-by-side prior/current year view
- Quarter-over-quarter comparison with multi-select Q1-Q4 filtering
- Variance analysis with dollar and percentage change indicators
- Comparison metric summary cards with trend indicators
- Year-over-Year summary table for all financial metrics
- Quick date filters (Prior Year / Current Year buttons)
- Clickable invoice numbers linking to batch details
- Excel export for comparison data
- Client filter on both Report and YoY Comparison views
- Three-year data support for broader historical analysis
- Batch type filtering and improved date handling
- **SQL-aggregation rewrite of financial-comparison report (Task #117, May 2026)** — eliminated in-process aggregation and large memory passes, dramatic speed-up on large tenants

#### Planned Features

**Annual Invoice Reporting (Remaining)**
- Client contribution analysis and rankings
- Service line revenue breakdown
- Growth rate calculations and projections
- Revenue forecasting based on pipeline
- Seasonal trend analysis
- Interactive dashboard with drill-down capabilities

**Estimate vs. Actual Analytics**
- Portfolio-wide accuracy metrics
- Variance analysis by project type, client, team member
- Trend analysis over time with improvement tracking
- Accuracy improvement recommendations
- Lessons learned repository

---

### 🏗️ Priority: Codebase Modularization (Routes & Storage)

**Status:** 📋 Planned  
**Target Completion:** Q2 2026  
**Motivation:** The core backend files `routes.ts` (20,500+ lines, ~396 endpoints) and `storage.ts` (11,600+ lines) have grown to a size that increases maintenance risk, slows developer tooling, and makes isolated testing difficult. Splitting them into domain-focused modules will improve maintainability, reduce merge conflicts, and enable faster development.

#### Current State
- `server/routes.ts` — 20,500+ lines containing all API endpoints
- `server/storage.ts` — 11,600+ lines containing all database operations
- `server/routes/platform.ts` — Already extracted (proof of pattern)

#### Proposed Module Structure

**Phase 1: Route Extraction (Lower Risk)**

Split `server/routes.ts` into domain-focused route files under `server/routes/`:

| Module | Endpoints | Description |
|--------|-----------|-------------|
| `projects.ts` | ~64 | Projects, allocations, assignments, SOWs, change orders, portfolio, capacity, dashboard |
| `estimates.ts` | ~47 | Estimates, epics, stages, line items, milestones |
| `invoicing.ts` | ~50 | Invoice batches, invoice lines, adjustments, billing, payment milestones, reimbursement batches |
| `expenses.ts` | ~60 | Expenses, expense reports, pending receipts, per diem, OCONUS, airports |
| `documents.ts` | ~40 | SharePoint, file management, SharePoint Embedded containers |
| `users.ts` | ~26 | Users, roles, rates, authentication |
| `admin.ts` | ~40 | Scheduled jobs, system settings, vocabulary, changelog |
| `planner.ts` | ~16 | Microsoft Planner integration |
| `time-entries.ts` | ~9 | Time entry CRUD and export |
| `tenant.ts` | ~10 | Tenant settings, email branding |
| `ai.ts` | ~7 | AI chat and narrative generation |
| `reports.ts` | ~6 | Financial reporting |
| `platform.ts` | Existing | Platform admin (already extracted) |

Each module exports a function `registerXxxRoutes(app, storage)` that the main `routes.ts` calls, keeping the entry point as a thin orchestrator.

**Phase 2: Storage Layer Extraction (Higher Risk)**

Split `server/storage.ts` into domain-focused storage modules under `server/storage/`:

| Module | Description |
|--------|-------------|
| `projects.ts` | Project, allocation, and assignment queries |
| `estimates.ts` | Estimate structure and line item queries |
| `invoicing.ts` | Invoice, batch, and payment milestone queries |
| `expenses.ts` | Expense, per diem, and receipt queries |
| `documents.ts` | File and container queries |
| `users.ts` | User, role, and rate queries |
| `admin.ts` | Settings, vocabulary, and job queries |
| `time-entries.ts` | Time entry queries |
| `index.ts` | Re-exports all modules, maintains `IStorage` interface |

The `IStorage` interface remains unified but its implementation is composed from domain modules.

**Phase 3: Shared Middleware & Utilities**

- Extract common middleware (auth, role checks, tenant scoping) into `server/middleware/`
- Consolidate shared utilities (pagination, error handling, validation) into `server/utils/`

#### Implementation Principles
- **Zero functionality changes** — Pure refactor, no new features or API changes
- **Incremental extraction** — One domain at a time, fully tested before moving to the next
- **Backward compatible** — All existing API contracts and response shapes remain identical
- **Route-first** — Extract routes before storage, since routes are the higher-risk surface
- **Test after each domain** — Verify all endpoints for the extracted domain work correctly before proceeding

#### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Breaking existing endpoints | Extract one domain at a time with full API testing |
| Circular dependencies | Clear dependency direction: routes → storage → schema |
| Shared state (middleware, auth) | Extract middleware first as shared utilities |
| Large merge conflicts during transition | Complete each domain extraction in a single focused session |

---

## Medium-Term Goals (H2 2026)

### 🎨 Advanced Vocabulary Features

**Status:** 🔮 Future  
**Target Timeframe:** Q4 2026  
**Note:** Core vocabulary system completed in October 2025

#### Planned Enhancements
- PDF templates with custom terminology
- Email notification templates using client vocabulary
- Excel exports with client-specific column headers
- Multi-language support with user language preferences
- Locale-aware terminology
- Industry preset templates (consulting, IT, professional services)
- One-click vocabulary template application

---

### ✅ Advanced Resource Management — Phases 3-6

**Status:** ✅ Complete  
**Completed:** April 2026  
**Design Document:** `docs/design/advanced-resource-management.md`

#### Phase 3: Smart Assignment Suggestions
- Suggestion engine in project Delivery tab — "Suggest People" button on generic role allocations
- Candidates ranked by role proficiency, availability, cost variance, and salaried status
- Bulk assignment API with per-role rate recalculation and engagement auto-creation

#### Phase 4: Cross-Project Workload & Rebalancing
- Resource Planning page at `/resource-planning` with workload table, utilization bars, and project color-coded breakdown
- Expandable per-person allocation detail with "Reassign" flow for overallocated resources
- Conflicts summary card highlighting overallocated people
- Utilization status filtering (overallocated, at capacity, healthy, underutilized)

#### Phase 5: Capacity Planning Analytics
- Capacity Planning dashboard at `/resource-planning/capacity` with KPI cards (team utilization, bench count, open roles)
- Recharts visualizations: capacity utilization pie chart, role demand vs supply bar chart
- Bench list with role capabilities and available hours
- Demand vs supply gap analysis by role

#### Phase 6: Bulk Import & Polish
- CSV bulk import for role capabilities (email, role, proficiency, rates) with upsert on conflict
- CSV bulk import for capacity profiles (email, weeklyHours, notes, effectiveDate)
- Validation and error reporting with per-row results

---

## Long-Term Vision (2027+)

### 🤖 AI & Intelligent Automation

**Status:** 🔮 Vision  
**Target Timeframe:** 2027

#### Planned Capabilities

**Project Intelligence**
- AI-powered project risk assessment
- Predictive budget overrun warnings
- Automated project health scoring
- Resource optimization recommendations
- Intelligent staffing suggestions based on skills and availability

**Natural Language Interfaces**
- Conversational time entry ("Worked 3 hours on Project Phoenix today")
- Voice-activated expense recording
- AI assistant for project management tasks

**Predictive Analytics**
- Client churn prediction
- Revenue forecasting with ML models
- Project success probability scoring
- Capacity planning optimization
- Price optimization recommendations

---

### 🔗 Platform Capabilities & Integrations

**Status:** 🔮 Vision  
**Target Timeframe:** 2027+

#### Planned Integrations
- Salesforce CRM integration for client management
- Jira integration for technical project tracking
- Slack notifications and bot commands
- Microsoft Power BI embedded analytics
- DocuSign for digital contract execution
- ADP/Workday integration for HR data sync

#### API Ecosystem
- Public REST API with comprehensive documentation
- Webhook support for third-party integrations
- Developer portal with sample code and SDKs
- OAuth2 authentication for external applications
- Rate limiting and usage analytics

---

### 📄 SharePoint Embedded UI Enhancement

**Status:** 🔮 Future  
**Target Timeframe:** 2027  
**Note:** Backend implementation complete (September 2025)

#### Planned UI Features
- Container management interface
- Document metadata templates
- Custom column configuration UI
- Visual permission management
- Container provisioning workflow
- Advanced document search with metadata filtering
- Bulk document operations
- Version history viewer with comparison
- Document approval workflow interface

---

### 💰 Advanced Travel & Expense Features

**Status:** 🔮 Future  
**Target Timeframe:** 2027  
**Note:** Core per diem (GSA CONUS & OCONUS), expense approval workflow, and contractor invoices completed in 2025-2026

#### Planned Enhancements

**Lodging Reimbursement**
- Receipt-based actual cost reimbursement
- Government lodging rate validation
- Hotel tax and fee handling
- Non-standard accommodation support

**Travel Expense Automation**
- Mileage calculation with Google Maps integration
- Rental car rate validation
- Airfare receipt parsing with OCR
- Parking and toll tracking
- Taxi/Uber receipt integration

---

## Feature Status Legend

- 🎯 **In Progress** - Actively being developed
- 📋 **Planned** - Prioritized and scheduled
- 🔮 **Future** - On roadmap, timing flexible
- 🚧 **Design Phase** - Requirements gathering and design
- ✅ **Complete** - Delivered and in production
- 🔄 **Iterating** - Released with ongoing improvements

---

## Roadmap Principles

### Flexibility & Responsiveness
This roadmap represents our current strategic direction but remains flexible to accommodate:
- User feedback and feature requests
- Market opportunities and competitive dynamics
- Technical dependencies and prerequisites
- Organizational priorities and resource availability

### User-Centric Development
- Regular user feedback collection and incorporation
- Beta testing programs for new features
- Iterative releases with continuous improvement
- Documentation and training materials for all releases

### Quality & Reliability
- Comprehensive testing before production releases
- Performance benchmarking and optimization
- Security audits and vulnerability assessments
- Backward compatibility and migration support

---

## Feedback & Influence

### Have Input on the Roadmap?

We welcome feedback from users, administrators, and stakeholders on roadmap priorities and features.

**Ways to Provide Feedback:**
- Contact your system administrator
- Email suggestions to ITHelp@synozur.com
- Participate in user feedback sessions
- Join beta testing programs for early access

**What Makes a Good Feature Request:**
- Clear description of the problem or need
- Explanation of business value and impact
- Examples of current workarounds (if any)
- Similar features in other tools (if applicable)
- Estimated number of users who would benefit

---

## Recent Roadmap Updates

**March 8, 2026 — Cloud Migration & MCP Server**
- Added Cloud Deployment Migration (GCP → Azure) to Near-Term Q2 2026 priorities — Replit engineering task to co-locate hosting with Azure-dependent services (SharePoint, AI Foundry, Graph API)
- Added MCP Server (Model Context Protocol) to Near-Term Q2 2026 priorities — design and deploy a Constellation MCP server matching the successful Vega MCP server architecture for AI assistant integration

**March 1, 2026 — Program Estimates, CRM Integration & Roadmap Advancement**
- Added Program Estimates & Staffing Blocks to Recently Completed (new "Program" estimate type with week-based blocks, Gantt view, PM Wizard)
- Added Portfolio Manager Role to Recently Completed (new role tier with cross-project portfolio visibility)
- Added HubSpot CRM Integration to Recently Completed (OAuth2 connection, deals page, contact import, deal-estimate linking, invoice sync)
- CRM integration moved from Long-Term Vision (Platform Capabilities & Integrations) to Complete — delivered ahead of 2027+ timeline
- Advanced Resource Management Phases 1-2 promoted from Medium-Term (H2 2026) to Current Focus (Q1-Q2 2026) — role capabilities & capacity profiles are foundational for later phases
- Codebase Modularization promoted from Medium-Term (Q3-Q4 2026) to Near-Term (Q2 2026) — unlocks faster development on all other features
- Advanced Financial Reporting promoted from Medium-Term (H2 2026) to Near-Term (Q2 2026) — YoY already complete, remaining work fills executive reporting gaps
- Advanced Resource Management Phases 3-6 remain in Medium-Term (H2 2026), gated on Phases 1-2 completion
- Removed predictive accuracy modeling with ML from estimate analytics (premature)
- Updated version to 1.2026.03.01

**February 13, 2026 — Project Governance & Portfolio Insights**
- Marked Enhanced Status Reporting as ✅ Complete (Phase 1: interactive generation with AI narratives, RAIDD integration, copy/download)
- Marked RAIDD Log as ✅ Complete (full register, governance rules, AI integration, Excel export, portfolio dashboard)
- Added Portfolio RAIDD dashboard to completed RAIDD deliverables (cross-project view with summary cards, filters, grouping, export)
- Updated Advanced Financial Reporting with client filter, three-year data support, and batch type filtering
- Updated Per Diem & Expense Automation with city lookup, airport codes, exchange rates, and improved calculations

**February 12, 2026 — Advanced Resource Management Design**
- Completed detailed design document for Advanced Resource Management (`docs/design/advanced-resource-management.md`)
- Moved from "Future" to "Planned" (Q2-Q3 2026) with 6-phase implementation plan (~7-8 weeks)
- Key additions: multi-role capability mapping, per-person capacity profiles, Planner sync protection for generic roles
- Estimate-to-project conversion stays fast; smart assignment suggestions happen in the project assignment module
- Cost variance analysis drives staffing decisions with budget impact visibility

**February 11, 2026 — User Feedback Session Reprioritization**
- Reprioritized roadmap based on February 2026 user feedback session (stack ranking, marketplace coins, 2×2 priority matrix)
- Elevated QuickBooks Online Integration from H2 2026 to Near-Term Q2 2026 (#1 ranked idea, 94 coins)
- Added user feedback validation to Enhanced Status Reporting (#2 ranked, strong AI-driven efficiency interest)
- Marked expense report PDF export bug fix as completed (quick win from 2×2 high impact / low effort quadrant)
- Deprioritized Notifications System from Q1 Current Focus to Q2–Q3 2026 (lower user ranking)
- Role Definitions noted as lower priority per feedback — revisit in future sessions

**February 10, 2026**
- Added Enhanced Status Reporting to Current Focus (Q1 2026) — AI-powered project status report generation with on-screen viewer, copy/download/email, and future automated scheduling
- Added RAIDD Log to Current Focus (Q1 2026) — structured Risk, Assumption, Issue, Dependency, Decision tracking with assignments, due dates, export, and AI integration into status reports
- Added Codebase Modularization plan to Medium-Term Goals (Q3-Q4 2026)
- Three-phase plan: Route extraction → Storage layer extraction → Middleware/utilities
- 13 domain modules identified for routes, 8 for storage
- Follows existing `platform.ts` extraction pattern

**February 8, 2026**
- Moved completed features to new "Recently Completed" section
- Multi-Tenancy, Retainers, Resource Management, Per Diem, Financial Reporting, Mobile Optimization, AI Features, and Planner Integration all marked as complete
- Updated Current Focus to Notifications System (Q1 2026)
- Refined Near-Term priorities to Teams Integration and Advanced Commercial Schemes
- Updated Medium/Long-Term sections to reflect completed prerequisites

**January 31, 2026**
- Added Project Reporting & Analytics to Q1 2026 focus
- Updated Notifications System timeline to March 2026
- Refined Multi-Tenancy phases based on design completion

**December 15, 2025**
- Moved QBO Integration from P0 to Q3 2026 (prioritizing core UX)
- Promoted Multi-Tenancy to Q2 2026 (strategic importance)
- Updated Microsoft 365 Teams integration target

**October 11, 2025**
- Completed Project Assignment Management and Vocabulary System
- Reprioritized based on user feedback
- Added detailed implementation phases for multi-tenancy

---

**May 7, 2026 — Version 2.5**
- Major release adding the **Galaxy Client Portal API** — external OAuth2 surface for client-portal apps with tenant- and client-scoped tokens, signed webhooks, document streaming, and an admin registration UI
- **Notifications System shipped end-to-end** — bell, full-page view, per-user preferences, browser push, weekly digest emails with per-tenant schedule, SendGrid open tracking; previously-deprioritized item now marked Complete
- **Multi-Currency Estimates & Invoicing** — quote vs cost currency, Sub-SOW propagation, client-currency totals on PDFs and invoice batches
- **Excel-Like Time Grid 2.0** — virtualised two-tab grid, drag-fill series extension, clipboard parser unit tests, project-code search
- **Estimate Version History** — auto-snapshot on edit/send, who-saved-when panel, backfilled snapshots
- **Client Portal Approvals & Sign-offs** — sign-off badges, inline status-report acknowledgement, admin sign-offs audit log, payment milestones exposed
- **Payment Milestone Billing Automation** — auto-generated invoice batches, portfolio billing-status surface, hours-budget alerts and empty-state callouts
- **AI Project Manager Agent** (Task #143) — conversational PM agent on top of v2.4 Copilot write infrastructure
- **Planner Sync Robustness** — last-write-wins, admin alerts, retry/backoff (closes part of Phase 2 Teams Planner work)
- **Operational improvements** — SQL-aggregation rewrite of financial-comparison report, persistent cache, invoice-list speed-up, server-side pagination on Users, background-job auto-cleanup, global deep-link search, data-quality drill-downs
- Notifications System moved from "Deprioritized" Q2–Q3 2026 to ✅ Complete
- Advanced Financial Reporting "Completed" subsection extended with the financial-comparison SQL rewrite
- Microsoft Teams Planner Integration Phase 2 marked Partially Shipped (LWW + audit trail done; webhook delivery and multitenant app registration still open)

**April 1, 2026 — Version 2.0 (Nebula)**
- Major version bump to 2.0
- Added Nebula UX Design System to Recently Completed (Aurora backgrounds, glow utilities, stagger animations, nebula card borders, skeleton shimmer)
- Added Executive Narrative Reporting to Recently Completed (AI-generated leadership summaries, PPTX export, saved narratives tab)
- Added Teams Channel Provisioning to Recently Completed (provisioning UI, auto-owner, async 202 handling, duplicate name guard, cross-tenant blocking)
- Added Azure AI Foundry & Multi-Provider AI to Recently Completed (GPT-5.4 support, configurable model selection, automatic fallback)
- Added SharePoint Embedded Document Storage to Recently Completed (full SPE integration, per-tenant containers, smart storage layer, Graph API downloads, file repository, container management)
- Added PowerPoint Status Report Templates to Recently Completed (branded slide templates, dynamic text, design elements)
- Added Page Analytics to Recently Completed (public page tracking, admin dashboard)
- Added Client Document Hub to Recently Completed (MSA/NDA upload)
- Added JIT User Provisioning to Recently Completed (auto-provisioning on SSO first login)
- Added SEO & Splash Page Optimization to Recently Completed
- Updated Microsoft 365 Teams Integration status — Teams Channel Provisioning marked complete, remaining items scoped to Phase 2
- Multiple bug fixes: My Assignments tenant_id, time entry UTC dates, invoice receipt cross-batch contamination, Planner sync overwrite, expense counts, support ticket defaults

**March 10, 2026**
- Marked MCP Server & Copilot Agent as ✅ Complete (24 endpoints, Power Platform Custom Connector, Copilot Studio agent, Teams channel deployment)
- Added MCP Server & Constellation Copilot Agent to Recently Completed section
- Updated Enhanced Status Reporting with Persistent Report Storage (v1.7)
- Updated version references to 1.7

*Last Updated: May 7, 2026 — Version 2.5*  
*Maintained by: Synozur Product Team*  
*Questions or suggestions? Contact: ITHelp@synozur.com*
