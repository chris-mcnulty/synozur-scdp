# Constellation Changelog

**Synozur Consulting Delivery Platform (SCDP)**

Version history and release notes for Constellation, organized from newest to oldest releases.

---

## Table of Contents

1. [Current Version](#current-version)
2. [Recent Releases](#recent-releases)
3. [Version History](#version-history)
4. [Upgrade Notes](#upgrade-notes)

---

## Current Version

### Version 2.7 (June 5, 2026)

**Release Date:** June 5, 2026
**Status:** Production Release
**Codename:** Realm

Version 2.7 makes QuickBooks Online a true two-way book of record. Building on the A/R invoice sync and A/P bill sync from 2.6.x, this release adds **payroll GL posting** and **live in-app financial reports** — completing the phased QuickBooks integration. Constellation's in-house payroll engine still owns computation, taxes, and NACHA; QuickBooks now receives the accounting impact, and admins can read core financials without leaving the app.

#### Payroll GL → QuickBooks Journal Entries (Phase 3)

- **One-click GL posting** — a finalized payroll run posts to QuickBooks Online as a single balanced **Journal Entry** from the run detail page ("Post GL to QuickBooks").
- **Reuses the existing payroll GL setup** — the journal is built from the same per-tenant payroll GL chart of accounts and category mappings that already drive the GL CSV export (wages, employer tax, taxes withheld, deductions, garnishments, net-pay clearing). Account numbers are matched to QuickBooks accounts by account number (`AcctNum`); if any are unmapped, the push reports exactly which numbers to align.
- **Idempotent & reversible** — one journal entry per run; "Remove QBO Journal" deletes it in QuickBooks and unlocks the run for re-posting after a correction.

#### In-App Financial Reports (Phase 4)

- **Live QuickBooks reports** on the Organization Settings → QuickBooks card: **A/R Aging Summary**, **A/P Aging Summary**, and **Profit & Loss** (with a date range).
- Read-only — pulled on demand from QuickBooks Online and rendered in-app, so finance leads get current aging and profitability without opening QuickBooks.

> Deferred for a later release: an in-app agentic assistant over QuickBooks query tools, inbound QuickBooks webhooks, and posting 1099 contractor pay as Bills (currently a summary journal entry).

---

### Version 2.6 (May 25, 2026)

**Release Date:** May 25, 2026
**Status:** Production Release
**Codename:** Ledger

Version 2.6 closes the loop on contractor cost. Constellation now ingests **inbound contractor invoices** — covering both services (time billed) and reimbursable expenses — runs AI vision extraction over the document, reconciles each line against logged time entries and expenses, and posts the **actual** amount paid as project cost. Every margin and profitability calculation in the platform now prefers actuals from posted vendor invoices over the rate-card estimate.

#### Contractor Invoice Ingestion (Accounts Payable)

- **Inbound AP Workflow** — new `Financial → Accounts Payable → Vendor Invoices` inbox at `/vendor-invoices` with a "Needs Review" tab badge, status filter, and per-row reconcile progress
- **AI Vision Extraction** — uploaded invoice images are sent to the configured AI provider (gpt-4o / gpt-5 family) with a strict JSON output schema; vendor name, invoice number, date, total, currency, and per-line `kind` / quantity / rate / amount are extracted with per-line confidence scores
- **Split-Pane Reviewer Screen** — source document on the left (PDF iframe / image / SharePoint link), extracted header plus collapsible line items on the right; each unreconciled line shows ranked match suggestions with one-click accept
- **Reconciliation Engine** — weighted candidate scoring (amount 0.5 / date 0.2 / category 0.2 / vendor 0.1); ≥0.85 auto-matches, 0.6–0.85 surfaces as a suggestion; service lines greedily fill against billed quantity, producing `matched` / `partial` / `variance` / `unmatched` per line
- **State Machine** — `draft → extracted → in_review → reconciled → approved → posted → paid` with `disputed` and `void` side states; Approve is gated until every line is reconciled or overridden
- **Transactional Posting** — Post writes `project_cost_postings` rows and back-fills `actualCostAmount` on every matched time entry and expense in a single transaction; Void reverses the back-fill atomically
- **Profit Reads Now Prefer Actuals** — Project Variance, Portfolio Financials, weekly digest cost rollup, and the Financial Reports actual-cost tile all read `actualCostAmount` first, falling back to `hours × costRate` only when no vendor invoice has been posted
- **Vendor Self-Service** — new `/my-vendor-invoices` page under My Workspace → Tracking shows each contractor a read-only view of invoices billed to them, with vendor-friendly status labels, source-document links, and a timeline
- **Permissions** — `pm` / `billing-admin` / `admin` can review and match; only `billing-admin` and `admin` can approve, post, mark paid, or void
- **Known v1 limitation** — PDF inputs land in *Draft* with no extracted lines (the shared receipt normalizer renders PDFs as placeholder PNGs in production); image uploads (PNG / JPG / HEIC) extract end-to-end. Email ingest, vendor stub promotion UI, and GL bill export are planned for v2.6.x follow-ups.

---

### Version 2.5 (May 7, 2026)

**Release Date:** May 7, 2026
**Status:** Production Release
**Codename:** Galaxy

Version 2.5 is a major release headlined by the new **Galaxy Client Portal API**, a fully-shipped **Notifications System**, **multi-currency estimates**, an Excel-grade **Time Grid 2.0**, **estimate version history**, **client portal approvals & sign-offs**, **payment-milestone billing automation**, an **AI Project Manager Agent**, and Planner sync robustness with last-write-wins. The release also lands the v2.4 **Copilot Agent Write Activities** Phases 0–5 (April 12) under one umbrella for the public release notes.

#### Galaxy Client Portal API

- **External `/api/galaxy/v1/*` API** — new externally-consumable HTTP API that lets approved client-portal apps read project artifacts and post sign-offs on behalf of a client user, running alongside (and independent of) the internal A2A and MCP APIs
- **OAuth2 Grants** — authorization-code (delegated, end-user) and client-credentials (machine-to-machine) flows
- **Tenant + Client Scoping** — every token carries `tenantId` and `clientId` claims, all data automatically scoped server-side
- **Microsoft Entra Authentication** — tokens are issued by Constellation's own authorization server and authenticated against Entra
- **Signed Webhooks** — optional webhook URL receives signed event payloads (project, estimate, sign-off, document); HMAC signing secret displayed once at registration with rotation flow
- **App Registration UI** — new **Settings → Galaxy API** page (and platform admin `/admin/galaxy`) for registering apps with name, description, redirect URIs, webhook URL, allowed origins (CORS allow-list), and scope ceiling
- **Hashed Secret Storage** — client secret and webhook signing secret stored hashed; one-time display on creation, rotation flow if lost
- **Document Streaming** — Galaxy v1 streams document downloads through the portal so SharePoint Embedded URLs are never exposed to client apps
- **Client Portal Approvals & Sign-offs** — payment milestones, status reports, and estimate sign-offs all reachable through Galaxy
- **Comprehensive Test Coverage** — automated test suites for auth, scopes, routes, and webhook delivery (Tasks #127, #142)
- **Documentation** — full API reference at `docs/galaxy-api.md`

#### Notifications System (Promoted from Deprioritized → Shipped)

- **In-App Notification Center** — bell icon with dropdown unread feed, dedicated full-page view at `/notifications`
- **Per-User Preferences** — preferences page at `/notification-preferences` with channel selection (email + in-app + push) and granular per-event-type toggles
- **Real-Time Tab Title Count** — unread notification count surfaced in the browser tab title for active sessions (Task #110)
- **Browser Push Notifications** — opt-in Web Push subscription with permission flow (Task #111)
- **Weekly Digest Emails** — SendGrid-delivered weekly digest with per-tenant schedule configuration (day, time, timezone) (Tasks #101, #129)
- **Digest Open Tracking** — SendGrid webhook integration to track digest email opens, surfaced as delivery stats on the Scheduled Jobs admin page (Tasks #128, #130)
- **Expanded Notification Hooks** — events now fire for allocations, milestones, sign-offs, expense approvals, RAIDD updates, status report acknowledgements, and budget alerts (Task #112)

#### Multi-Currency Estimates & Invoicing

- **Quote vs Cost Currency** — estimates now carry a quote currency that is independent of the cost currency, with full schema migration (Task #102)
- **Sub-SOW Propagation** — currency selection propagates through Sub-SOW exports
- **Quote-Currency Invoice Totals** — invoice batches show quote-currency totals when they differ from the cost currency
- **Client-Currency PDFs** — estimate PDFs and Sub-SOW exports display amounts in the client's currency (Task #131)
- **Expense Currency Picker** — currency selector added to the expense edit form

#### Excel-Like Time Grid 2.0

- **Two-Tab Grid** — current week + prior week tabs with full Excel-style keyboard navigation (Task #125)
- **Series Drag-Fill** — drag-fill now extends a series instead of just copying cell values
- **Virtualised Rendering** — large grids render via virtualisation for smooth scrolling (Task #138)
- **Clipboard Parser Tests** — multi-row paste handling backed by unit tests for the parser and row state machine (Task #137)
- **Project-Code Search** — project picker shows and searches by project code in addition to name

#### Estimate Version History

- **Auto-Snapshot on First Edit** — backfilled snapshots so legacy estimates surface their full history (Task #113)
- **Snapshot on Send** — every email/send creates a version snapshot for audit (Task #115)
- **History Panel** — shows who saved each snapshot and when, with side-by-side compare and restore (Task #114)

#### Client Portal Approvals & Sign-offs

- **Sign-Off Status Badges** — visible on estimates and milestone list views (Task #134)
- **Inline Status Report Acknowledgement** — clients can acknowledge a status report directly from the report view (Task #136)
- **Admin Sign-Offs Audit Log** — new audit log page capturing actor, target, comment, and source for every sign-off (Task #135)
- **Client Portal Approvals & Sign-offs Workflow** — end-to-end approval flow exposed through Galaxy (Task #104)
- **Payment Milestones in Client Portal** — clients can view and acknowledge their payment milestones (Task #89)
- **Cascade Allocation Improvements** — shifted-from-milestone indicator (Task #91) and PM "undo" for an applied cascade date shift (Task #90)

#### Payment Milestone Billing Automation

- **Auto-Generated Invoice Batch** — when a payment milestone is marked Invoiced, the corresponding invoice batch is created automatically (Task #87)
- **Portfolio Billing Status** — payment milestone billing status surfaced on the portfolio dashboard (Task #88)
- **Hours Budget Status** — project list dashboard table now shows budget consumption status (Task #82)
- **Low-Budget Alerts** — alert sent when a project drops below 10% of its budgeted hours (Task #83)
- **Empty-State Callout** — projects with no approved estimate hours now show a callout instead of an empty pane (Task #84)

#### AI Project Manager Agent

- **Conversational PM Agent** — new AI agent (Task #143) layered on top of the v2.4 Copilot Agent Write Activities infrastructure
- Tuned for narrative status updates, cascade triage, and sign-off chase-down using the MCP read + write surfaces

#### Copilot Agent Write Activities (v2.4 — April 12, 2026)

- **`/mcp/v1/*` Write Namespace** — alongside the existing read surface, with feature flag (`MCP_WRITES_ENABLED`), required `X-Idempotency-Key` header, replay-cache, request-hash conflict detection, and universal `?dryRun=true`
- **Audit Envelope** — every write response carries `idempotent`, `dryRun`, `auditId`, and `correlationId`
- **`mcp_write_audit` Table** — per-request idempotency, request hash, response body, resource, dry-run flag
- **Stricter Write Roles** — admin, pm, portfolio-manager only (executive and billing-admin dropped from write paths)
- **Client Discovery & Creation** — `GET /mcp/clients` with linkage signals (`hasHubspotLink`, `hasTeamsLink`, `activeEstimateCount`); `POST /mcp/v1/clients` with near-match duplicate detection (normalized + Levenshtein, 409 with candidates unless `force: true`)
- **Estimate Creation (3 variants)** — `POST /mcp/v1/estimates/from-narrative` (AI-generated, ≤8 line items), `POST /mcp/v1/estimates/block-hours`, `POST /mcp/v1/estimates/fixed-price`, with prompt-injection sanitization on `narrative` and pre-create duplicate check
- **HubSpot Linkage** — `GET /mcp/v1/hubspot/search?type=company|deal&query=` and `POST /mcp/v1/clients/:id/hubspot-link` with `createIfMissing` flag
- **Teams Team & Channel Linkage** — `POST /mcp/v1/clients/:id/teams-link` and `POST /mcp/v1/projects/:id/teams-channel` with partial-failure envelope (`warnings[]` preserved)
- **OpenAPI Spec** — bumped to v1.2.0; connector setup doc rewritten to cover the write flow

#### Planner Sync Robustness

- **Last-Write-Wins Conflict Resolution** — bidirectional sync now resolves simultaneous edits deterministically (Task #126)
- **Admin Alerts** — failures surface to admins with actionable context (project, task, error class)
- **Improved Retry/Backoff** — Graph throttling handled with exponential backoff
- **Audit Trail** — every sync action logged

#### Operational & Performance Improvements

- **Persistent Cache** — startup warm-up loader rebuilds the in-memory cache after restarts (Task #106)
- **Invoice List Speed-Up** — bulk-query approach replaces N+1 lookups (Task #105)
- **User Page Pagination** — server-side pagination on the Users page (Task #116)
- **Background Job Cleanup** — auto-cleanup of old `background_jobs` rows (Task #121); admin sidebar link added
- **Financial-Comparison SQL Rewrite** — major rewrite to use SQL aggregation instead of in-process processing (Task #117); dramatic speed-up on large tenants
- **Global Deep-Link Search** — search across projects, users, and time entries from the global search bar
- **Actionable Data Quality Warnings** — warnings now expand to show affected items (Task #86)
- **Calendar Suggestions Detail** — expandable per-event detail in the calendar suggestions panel (Task #108)
- **RAIDD Visibility** — "Visible to clients" toggle on RAIDD entries
- **Copilot Studio Manifest Sync** — Copilot Studio client IDs synced into the Azure app manifest (Task #52)

#### Bug Fixes

- Fixed "Set Up Teams Channel" button incorrectly showing on estimates that already had a channel
- Fixed three Teams channel setup bugs on the project detail page
- Fixed TimeGrid project picker so it shows and searches by project code

#### Database Schema

- New tables for Galaxy: `galaxy_apps`, `galaxy_tokens`, `galaxy_webhook_deliveries`, plus auth-code and refresh-token storage (migration `0009_galaxy_client_portal_api.sql`)
- New tables for Notifications: `notifications`, `notification_preferences`, `push_subscriptions`, `digest_schedules`, `digest_deliveries`
- New tables for Estimate Version History: `estimate_versions` with snapshot payload + actor metadata
- New tables for Sign-Offs Audit: `sign_off_audit_log`
- New columns on `estimates` for quote currency separate from cost currency
- New columns on `payment_milestones` for portal-visibility flags

#### Documentation

- New `docs/galaxy-api.md` covering OAuth flows, scope catalog, webhook signing, and rate limits
- Updated user guide and admin guide for Galaxy Client Portal, Notifications, Multi-Currency Estimates, Time Grid 2.0, Estimate Version History, Client Portal Approvals & Sign-offs, and Payment Milestone Billing Automation
- Roadmap and backlog updated for v2.5

---

### Version 2.1 (April 3, 2026)

**Release Date:** April 3, 2026
**Status:** Production Release

Version 2.1 delivers Microsoft Teams Automation Phase 2, adding automated member management, SharePoint site provisioning, and guest user invitation workflows.

#### Microsoft Teams Automation (Phase 2)

- **Automatic Member Sync** — team membership automatically stays in sync with project assignments; when users are allocated to a project, they are added to the associated Microsoft Team; optional auto-removal when unassigned (disabled by default, owners never removed)
- **SharePoint Site Provisioning** — retrieve and link the SharePoint site associated with a Team; create project-specific document libraries with configurable folder structure (Deliverables, SOW & Contracts, Meeting Notes, Status Reports, Working Documents)
- **Guest User Invitation Workflows** — invite external collaborators via Azure AD B2B invitations directly from the project Teams panel; track invitation status (pending, sent, accepted, failed); resend expired invitations
- **Per-Project Sync Configuration** — configure member sync settings per project: auto-add, auto-remove, and auto-invite guests, with independent toggles for each
- **Automation Audit Logs** — comprehensive audit trail for all Teams automation actions (member add/remove, SharePoint provisioning, guest invitations) with success/failure tracking
- **Fire-and-Forget Integration Hooks** — allocation create, update, bulk-update, and role reassignment routes automatically trigger member sync when enabled, without blocking the primary operation
- **Teams Automation Panel UI** — new tabbed panel component for project detail pages with Members, SharePoint, Guests, and Logs tabs

#### Database Schema

- New tables: `teams_automation_logs`, `guest_invitations`, `teams_member_sync_state`
- Full audit trail for all automated Teams operations
- Guest invitation lifecycle tracking with Azure AD B2B integration

---

### Version 2.0 (April 1, 2026)

**Release Date:** April 1, 2026  
**Status:** Production Release  
**Codename:** Nebula

Version 2.0 is a major milestone for Constellation. March 2026 delivered a sweeping set of enhancements across executive reporting, Microsoft Teams provisioning, the Nebula visual design system, AI-powered features, page analytics, and dozens of quality-of-life improvements and bug fixes.

#### Executive Narrative & Leadership Reporting

- **Executive Narrative Reporting** — AI-generated leadership summaries that distill project activity, milestones, RAIDD items, and financials into a concise narrative for stakeholders
- **Save & Export as PowerPoint** — Save executive narratives and export them as branded PPTX slide decks
- **Executive Narratives Tab** on the Reports page for viewing, managing, and re-exporting saved narratives
- **Revenue Calculation Refined** — Total revenue now sums only `time` and `milestone` invoice line types, correctly excluding expense reimbursements, sales tax, discounts, and no-charge lines
- **Activity Aggregation Service** — shared service powering both executive narratives and MCP/Copilot endpoints with consistent data

#### Microsoft Teams Channel Provisioning

- **Teams Channel Provisioning UI** — create Microsoft Teams and channels directly from project detail, estimate detail, and client detail pages
- **Cross-Tenant Blocking** — Teams provisioning is automatically blocked for projects that span multiple Azure AD tenants
- **Auto-Resolve Team Owner** — the requesting user's Azure AD identity is automatically resolved and set as the team owner (fixes "owner required" error)
- **Async Team Creation** — proper handling of Microsoft's 202 Accepted response with Location header polling
- **Duplicate Name Detection** — team name is checked against existing teams before creation to prevent conflicts
- **Embedded Teams Navigation Flyout** — in-app navigation added to the embedded Teams view
- **Planner Sync Fix** — bidirectional sync no longer overwrites locally completed task status

#### Nebula UX Design System

- **Aurora Primary Background** — Aurora is now the primary hero background with reduced hero image opacity, dark base, and star particle effects on login and home pages
- **Glow Utilities** — `.glow-primary` and `.primary-cta-glow` CSS classes for hover and focus effects on buttons and interactive elements
- **Active Sidebar Styling** — border-l-2 accent, gradient background, and glow on the active sidebar item
- **Entrance Stagger Animations** — `animate-fade-in-up` with stagger delays applied to dashboard KPI cards, login/home feature cards, portfolio RAIDD stat tiles, and portfolio report summary cards
- **Typography Weight Contrast** — font-black (900) for values and font-light (300) for labels across KPI cards and stat tiles; cosmic-text gradient on hero headings
- **Light Mode Nebula Tint** — subtle purple tint on the light mode background
- **Nebula Card Borders** — animated conic-gradient border rotation on KPI cards, stat tiles, and feature cards (dark mode)
- **Nebula Skeleton Shimmer** — purple/magenta shimmer on loading skeleton components in both light and dark modes
- **Aurora Component** — reusable `aurora.tsx` component with configurable intensity, theme detection, and particle effects

#### Azure AI Foundry & Multi-Provider AI

- **Azure AI Foundry Integration** — GPT-5.4 model support via Azure AI Foundry as primary AI provider
- **Multi-Provider AI Architecture** — configurable model selection between Replit AI and Azure AI Foundry with automatic fallback
- **AI Estimate Week Assignment** — AI-powered sequential week assignment for program estimate staffing blocks
- **MCP Activity Summary Endpoint** — new `/mcp/activity-summary` endpoint for Copilot agent narration covering time entries, expenses, RAIDD items, and assignment status
- **Expanded MCP Coverage** — RAIDD, assignments, and improved type safety added to existing MCP endpoints

#### SharePoint Embedded Document Storage

- **Full SPE Integration** — SharePoint Embedded as the primary document storage tier for tenants with Azure AD tenant isolation
- **Per-Tenant Container Provisioning** — API endpoints for creating and configuring SPE containers per tenant, with dev/prod container ID management
- **Smart Storage Layer** — automatically directs files to SPE or legacy Object Storage based on tenant `speStorageEnabled` configuration
- **Direct Graph API Downloads** — file download via Microsoft Graph without metadata lookup, including receipt download pipeline for SPE-stored files
- **File Repository** — intelligent document type inference from folder paths, expandable metadata panel, and file statistics dashboard
- **File Reorganization** — tools to move files from nested paths to proper top-level SPE folders
- **Invoice Receipt Bundler** — direct Graph API downloads for reliable receipt inclusion in generated invoice PDFs
- **Container Management** — admin interface for SPE container types, custom columns with SharePoint-safe naming, and tenant-level enable/disable toggle

#### Page Analytics

- **Public Page Tracking** — anonymous page view tracking for home, login, and signup pages with session-based unique visitor identification
- **Page Analytics Dashboard** — new "Page Analytics" tab in System Settings (platform admin only) showing visits and unique sessions per page with configurable date range

#### User Authentication & Assignment Fixes

- **Just-In-Time Provisioning** — new Microsoft SSO users are automatically provisioned on first login without requiring pre-registration
- **My Assignments Fix** — resolved production bug where My Assignments appeared empty due to NULL `tenant_id` on `project_allocations` records; query now scopes via `projects.tenantId` through the join
- **Person-Scoped Assignment Dropdown** — time entry assignment dropdown now shows only the selected person's assignments, preventing cross-user assignment contamination

#### PowerPoint Status Report Templates

- **PPTX Slide Template System** — selectable branded slide templates for PowerPoint status report export
- **Dynamic Text Injection** — project name, dates, and summary data populate slide placeholders automatically
- **Background & Design Elements** — branded backgrounds, logos, and design elements inserted into template slides
- **Layout Content Handling** — empty slides now pull content from their layout master correctly
- **Multiple Subtitle Lines** — template title slides support multiple subtitle lines for additional context

#### Client & Document Management

- **Client Document Hub** — MSA/NDA upload and management from the client detail page
- **Orphaned Invoice PDF Cleanup** — utility to identify and remove orphaned invoice PDF files from storage

#### Platform & Architecture

- **M365 Integration Architecture Diagram** — dedicated page visualizing the three-app Entra ID architecture and data flows
- **Splash Page SEO Optimization** — meta tags, Open Graph tags, and structured data for better search engine and social media visibility
- **Calendar Date Validation** — report date range inputs now validate for proper date ordering
- **Support Ticket Defaults** — support tickets default to the pending view with working filter query parameters
- **API Documentation Updates** — expanded operations in the OpenAPI spec

#### Expense & Billing Fixes

- **Reimbursement Status Tracking** — reimbursement status column added to the expense management view
- **Currency Selection** — currency picker added to the expense editing form
- **Invoice Receipt Bundling Fix** — resolved cross-batch contamination when bundling receipts
- **Expense Count & Recipient Fix** — correct counts and reimbursement recipient names on the batch list
- **Time Entry Date Fix** — date picker in the Log Time dialog no longer shifts dates due to UTC conversion
- **Log Time Dialog Fields** — missing fields restored in the project-tab Log Time dialog

#### Documentation

- Updated user guide, admin guide, changelog, and roadmap for v2.0
- Added M365 architecture diagram documentation
- Updated revenue calculation documentation in AI grounding

---

## Recent Releases

### Version 1.8 (March 15, 2026)

**Release Date:** March 15, 2026  
**Status:** Production Release  
**Codename:** Teams Integration & Navigation Refresh

This release adds Microsoft Teams Custom Tab integration for embedded project access, a reorganized sidebar navigation with sub-group labels, a modular theme system with three visual themes, and comprehensive delivery tracking improvements.

#### New Features

**Microsoft Teams Custom Tab Integration**
- Constellation projects now embed directly as **Microsoft Teams tabs** for seamless in-context access
- Chromeless layout automatically applied when running inside Teams — no sidebar, header, or navigation chrome
- Tab deep-linking via `?tab=` parameter supports all project tabs: overview, contracts, delivery, time, invoices, raidd, deliverables, status-reports, and analytics
- **Read-only enforcement** in embed mode — all mutating actions (SOW upload/approve/edit/delete, epic/milestone/workstream buttons, team membership, assignment status, payment milestones, rate overrides, retainer management, Quick Milestone Invoice) are hidden
- Teams SSO authentication flow with popup sign-in and token exchange
- Configurable tab setup page for selecting which project to display
- Embed dashboard route for static tab landing page
- Teams app manifest with complete tab configuration at `teams/manifest.json`
- Three-app Entra ID architecture: SCDP-Content (Teams SSO), MCP Connector, Copilot Studio Agent

**Sidebar Navigation Reorganization**
- Navigation menu reorganized with **sub-group labels** for improved information architecture
- My Workspace section now grouped into: **Daily Work** (My Dashboard, Assignments, My Projects), **Time & Expenses** (Timesheets, Expenses, Expense Reports), and **Tracking** (My Reimbursements, My RAIDD)
- Financial section grouped into billing items, **Expenses** sub-group, and **Rates** sub-group
- Administration section grouped into **Users & Organization**, **System Tools**, and **AI Configuration**
- Platform section grouped into **Tenant Management** and **Reference Data**
- Disambiguated menu labels: "Dashboard" → "My Dashboard", "Time" → "Timesheets", "Projects" → "My Projects", "RAIDD" → "My RAIDD", "Reimbursements" → "My Reimbursements" / "Reimbursement Batches", "AI Grounding" → "Platform AI Grounding"
- Mobile navigation updated to match desktop reorganization

**Theme System**
- Modular theme architecture with CSS variable-based theming
- Three production themes available: **Aurora** (warm earth tones with lighthouse motif), **Night Sky** (deep navy with star navigation), **Navigator's Chart** (clean professional teal)
- Theme CSS files at `client/src/themes/` with documented variable mapping
- Theme integration guide at `docs/SYNOZUR_THEME_GUIDE.md`
- Foundation for planned tenant-level theme selection (Task #18)

#### Bug Fixes
- Fixed CSS import order — theme `@import` must precede `@tailwind` directives in index.css
- Fixed font application — Avenir Next LT Pro now consistently applied across all themes
- Restored schema definitions lost during Task #17 merge (M365 columns on tenants, sharepointSiteUrl on clients, clientTeams/projectChannels/teamsFolderTemplates tables)
- Fixed post-merge setup script to use `--force` flag preventing interactive prompts

#### Documentation
- Updated user guide, admin guide, changelog, and roadmap for v1.8
- Added Teams Custom Tab setup documentation
- Added theme system integration guide
- Updated navigation documentation to reflect sub-group labels and renamed items

---

### Version 1.7 (March 10, 2026)

**Release Date:** March 10, 2026  
**Status:** Production Release  
**Codename:** Copilot Agent & AI Report Persistence

This release introduces the Constellation Copilot Agent for Microsoft 365, enabling conversational access to project data through Microsoft Teams and Copilot Studio. It also adds persistent status report storage, so AI-generated text and PPTX reports are saved to the database with full lifecycle management, and expands the MCP server to ~24 endpoints. AI model support is upgraded to GPT-5.4 via Azure AI Foundry, and SharePoint Embedded document storage is now fully integrated.

#### ✨ New Features

**Constellation Copilot Agent**
- New **Copilot Studio agent** for querying Constellation data conversationally through Microsoft Teams and Microsoft 365 Copilot
- Power Platform Custom Connector backed by the Constellation MCP server (~24 read-only endpoints)
- OAuth 2.0 bearer token authentication with JWT validation via JWKS against Entra ID app registration
- Multi-tenant support — users from any Entra directory can authenticate
- Natural language queries for assignments, time entries, expenses, projects, RAIDD, deliverables, estimates, invoices, CRM deals, and status reports
- Role-based access control enforced server-side — the agent only surfaces data the user is authorized to see
- Teams channel deployment for chat and channel-based interactions
- Connector setup guide at `docs/MCP_CONNECTOR_SETUP.md`

**Persistent Status Reports**
- AI-generated status reports (text and PPTX) are now automatically saved to the `status_reports` database table
- New **Status Reports** tab on the project detail page listing all saved reports
- Each report tracks type (text/pptx), style (executive brief, detailed update, client-facing), period, content, status (draft/final), and who generated it
- View report content in a dialog, mark reports as final, or delete them
- Full CRUD API at `/api/projects/:projectId/status-reports` with project ownership and tenant isolation enforcement
- MCP endpoints at `/mcp/projects/:projectId/status-reports` for Copilot Agent access to saved reports

**MCP Server Expansion**
- MCP server expanded to ~24 read-only endpoints (up from 16)
- Added endpoints: individual expenses, estimate detail with line items, reimbursement batches and detail, project status report data aggregation, saved status reports list and detail
- Bearer token authentication via `server/auth/mcp-bearer-auth.ts` supporting both v1 and v2 Entra token issuers
- OpenAPI spec updated at `docs/constellation-mcp-openapi.json`

**AI Model Upgrade**
- Azure AI Foundry integration with GPT-5.4 support
- Multi-provider AI architecture (Replit AI + Azure AI Foundry) with configurable model selection
- Usage logging and cost tracking per tenant with token budget alerts

**SharePoint Embedded Document Storage**
- Full **SharePoint Embedded (SPE)** integration as the primary document storage tier for tenants
- Per-tenant SPE container provisioning with Azure AD tenant isolation
- Smart storage layer that directs files to SPE or legacy Object Storage based on tenant configuration (`speStorageEnabled` flag)
- Direct file download via Microsoft Graph API (`downloadFileDirect`) — no metadata lookup required

**File Repository Enhancements**
- New **File Repository** page with intelligent document type inference from folder paths (e.g., `/receipts/invoices/` → "invoice")
- Expandable metadata panel in file table for viewing SharePoint document properties
- File statistics dashboard with document type breakdown and storage metrics
- **Reorganize Files** feature (`/api/files/reorganize`) to move files from nested paths to proper top-level SPE folders

**Receipt & Invoice Pipeline**
- End-to-end receipt download pipeline using `downloadFileDirect` for SPE-stored files
- Expense "View Receipt" and invoice receipt bundler both use direct Graph API downloads
- Reliable receipt inclusion in generated invoice PDFs from SPE storage

**SPE Container Management**
- Container management interface for administrators
- Custom column support with SharePoint-safe naming (`ReceiptStatus`, `FileDescription` to avoid reserved names)
- Proper decimal format handling for SharePoint number columns

#### 🐛 Bug Fixes
- Fixed file stats counts that showed `[object Object]` instead of numbers (byDocumentType object vs number mismatch)
- Fixed nested file paths (`/receipts/receipts/`) — files now stored in correct top-level folders after reorganization
- Fixed SPE upload `driveId` field set to `receipt-storage` for proper download routing
- Fixed IDOR vulnerability in status report API routes — all endpoints now enforce project ownership and tenant isolation

#### 📚 Documentation
- New `docs/MCP_CONNECTOR_SETUP.md` — step-by-step guide for Power Platform Custom Connector and Copilot Studio agent setup
- New `docs/MCP_README.md` — MCP endpoint reference with RBAC matrix
- Updated OpenAPI spec with all ~24 MCP endpoints
- Updated user guide, roadmap, backlog, and changelog for v1.7

---

### Version 1.2026.03.05 (March 5, 2026)

**Release Date:** March 5, 2026  
**Status:** Production Release  
**Codename:** Deliverable Tracking

This release introduces the Deliverable Tracking system for managing project deliverables through their full lifecycle, from identification through client acceptance, with AI-powered extraction from proposal narratives and integration into status reports.

#### ✨ New Features

**Deliverable Tracking**
- New **Deliverables** tab on the project detail page for tracking project deliverables
- Full lifecycle status workflow: Not Started → In Progress → In Review → Accepted / Rejected
- Every deliverable requires an assigned owner for clear accountability
- Optional linking to Epics and Stages for traceability to the project plan
- Target date and delivered date tracking
- Automatic status history audit trail — every status change is recorded with timestamp and user
- Sort order support for organizing deliverables by priority

**AI Narrative Extraction**
- **Extract from Narrative** feature: paste proposal or SOW text and let AI identify candidate deliverables
- Review and select candidates before adding, with owner assignment during bulk creation
- Existing deliverables are automatically filtered out to prevent duplicates

**Status Report Integration**
- Deliverables are now included in AI-generated markdown status reports
- Deliverable data feeds into the PPTX status report generation
- New **Deliverables Tracker** slide in PowerPoint reports with a color-coded status table showing name, owner, status, target date, and delivered date
- Summary bar at top of slide shows counts by status (Accepted, In Review, In Progress, etc.)

---

### Version 1.2026.03.01 (March 1, 2026)

**Release Date:** March 1, 2026  
**Status:** Production Release  
**Codename:** Program Estimates & CRM Integration

This release introduces the Program estimate type with staffing blocks and Gantt visualization, the Portfolio Manager role for cross-project oversight, HubSpot CRM integration for deal pipeline management, estimate sharing with read-only access, user management improvements, estimate fixes, and financial reporting enhancements.

#### ✨ New Features

**Program Estimate Type**
- New "Program" estimate type for large multi-workstream engagements
- Staffing blocks with resource name, role, epic/workstream, weekly allocation, and duration
- Gantt-style timeline visualization of staffing blocks with drag-and-resize support
- Automatic cost and amount calculation based on block hours and rates
- Filtering by epic, resource, and free-text search within the program view
- Sort order management for organizing blocks within the estimate
- PM Wizard dialog for guided program estimate creation and configuration

**Portfolio Manager Role**
- New "portfolio-manager" role as the sixth tier in the role hierarchy
- Cross-project visibility for portfolio-level oversight without full admin access
- Access to portfolio dashboards, timelines, RAIDD, and resource views
- Scoped permissions — cannot modify system settings or manage users
- Integrated into role-based access control across all API endpoints

**HubSpot CRM Integration**
- New CRM Deals page at `/crm/deals` for viewing and managing HubSpot deal pipeline
- Tenant-level HubSpot connection configuration in Organization Settings
- Deal list with stage, amount, close date, and associated company details
- Create estimate directly from a CRM deal with pre-populated fields
- Link existing estimates to CRM deals for pipeline tracking
- Unlink estimates from deals when engagement changes
- Contact import from HubSpot companies and deals
- Pipeline and deal stage visibility for sales-to-delivery handoff
- Threshold-based deal filtering for high-value opportunity focus
- Company search and association management via HubSpot API

**User Management Improvements**
- Enhanced user list with improved filtering and sorting capabilities
- Portfolio Manager role available in user role assignment
- Improved role hierarchy enforcement for user creation and editing

**Estimate Sharing**
- Share estimates with individual users for read-only access via the Share button on estimate detail
- Shared viewers see line items and Gantt but cost rates and margin data are hidden
- Users with higher roles (admin, billing-admin, PM, portfolio-manager) retain full access when shared
- "Shared" badge displayed on the estimates list for shared estimates
- Read-only banner shown to shared viewers on the estimate detail page
- Only admins, billing admins, PMs, and portfolio managers can grant or revoke shares

**Financial Reporting Enhancements**
- Client revenue report with detailed breakdown by project and time period
- Improved financial report filtering and export options
- Enhanced report formatting for cleaner presentation

#### 🐛 Bug Fixes
- Fixed estimate total calculations for program-type estimates with staffing blocks
- Fixed edge cases in rate resolution when project-level and client-level overrides conflict
- Resolved issue where estimate detail page could show stale data after block edits
- Fixed mobile layout issues on the estimates list page
- Improved error handling for HubSpot API connection failures

#### 📚 Documentation
- Updated changelog, roadmap, and user guide for new version
- Added HubSpot CRM integration documentation
- Updated role hierarchy documentation to include Portfolio Manager
- Added estimate sharing documentation to user guide

---

## Recent Releases

### Version 1.2026.02.13 (February 13, 2026)

**Release Date:** February 13, 2026  
**Status:** Production Release  
**Codename:** Project Governance & Portfolio Insights

This release introduces the RAIDD Log for structured project governance, AI-powered status reports with RAIDD integration, a cross-project Portfolio RAIDD dashboard, enhanced invoice reporting with client filtering, and improvements to billing workflow and expense management.

#### ✨ New Features

**RAIDD Log (Risks, Action Items, Issues, Dependencies, Decisions)**
- New RAIDD tab within each project detail page for structured governance tracking
- Five entry types: Risk, Issue, Action Item, Dependency, Decision
- Full lifecycle management with status workflow (Open → In Progress → Mitigated/Resolved/Closed)
- Color-coded priority indicators (Critical, High, Medium, Low)
- Impact and likelihood assessment for risk entries
- Owner and assignee tracking with due date management
- Overdue highlighting for action items past their due date
- Category tagging and reference numbering for organized tracking
- Governance rules: decisions become immutable after status change, action items require parent entries, risks convert to issues with lineage preserved
- Filterable and sortable table view by type, status, priority, owner, or due date
- Export full RAIDD log as Excel spreadsheet with all fields

**AI-Powered Project Status Reports**
- New status report generation accessible from the project detail page
- AI-generated narrative summaries of project activity for selected time periods
- Supports weekly and monthly period selection
- Includes time entry summaries, expense totals, assignment status, and milestone progress
- RAIDD integration: automatically includes open risks, issues, action items, dependencies, and recent decisions in the AI prompt
- Critical and overdue items highlighted in the generated report
- RAIDD counts displayed in the report metadata bar
- Copy-to-clipboard for easy pasting into emails or documents
- Download as formatted text
- Configurable summary style (executive brief, detailed update, client-facing)

**Portfolio RAIDD Dashboard**
- New cross-project RAIDD view at `/portfolio/raidd` under Portfolio in the sidebar
- Summary cards showing open risks, issues, action items, dependencies, critical/high priority counts, overdue items, and items closed this month
- Filterable by status, type, priority, and project
- Grouping options: group entries by project, type, priority, or status with count headers
- Clickable project links for drill-down to individual project RAIDD tabs
- XLSX export of filtered data for offline analysis and stakeholder sharing
- Role-restricted access (admin, PM, executive only)
- Tenant-scoped data isolation for multi-tenant security

**Invoice Report: Client Filter**
- New client dropdown filter on both the Report view and YoY Comparison view
- Client list automatically populated from loaded invoice data
- All totals, summaries, and comparison metrics recalculate when a client filter is applied
- Enables focused financial analysis for individual client portfolios

**Invoice Report: Three-Year Data Support**
- Extended invoice report to support three years of financial data
- Enables broader historical trend analysis

**Billing & Invoice Improvements**
- Enhanced batch detail page with improved layout, action buttons, and filtering options
- Client filtering and default sorting on the billing invoices list page
- Improved invoice review and finalize state management
- Condensed payment details display for cleaner invoice layouts
- Removed cents from invoice report summary amounts for cleaner presentation
- Fixed invoice PDF generation error caused by incorrect Handlebars import

**Expense Management Improvements**
- Updated expense report calculations to use item-level amounts for more accurate totals
- Enhanced per diem city lookup with improved GSA API integration
- Airport code reference data (5,163 IATA codes) for travel location selection in expense forms
- OCONUS per diem rate support with DoD-sourced data for international travel
- Exchange rate integration for multi-currency expense reporting
- Improved expense filtering and receipt download capabilities

**Estimate Enhancements**
- Added ability to apply and remove margin overrides on estimates
- Increased AI narrative generation token limit for longer, more detailed content
- Improved AI prompt size limits for better narrative quality

#### 🐛 Bug Fixes
- Fixed invoice PDF generation error caused by incorrect Handlebars import
- Fixed React Fragment key warning in grouped invoice report table rows
- Resolved edge cases in expense report calculations using item amounts
- Removed unsupported temperature settings from AI requests for better compatibility

#### 📚 Documentation
- Added project governance document for best practices
- Updated roadmap with advanced resource management design details
- Updated backlog with completed status for RAIDD and status reporting features

---

### Version 1.2026.02.11 (February 11, 2026)

**Release Date:** February 11, 2026  
**Status:** Production Release  
**Codename:** Year-over-Year Analytics

This release adds powerful year-over-year comparison capabilities to the Invoice Report, enabling side-by-side financial analysis of current and prior year performance with quarter-level granularity.

#### ✨ New Features

**Invoice Report: Year-over-Year Comparison View**
- New "YoY Comparison" tab alongside the existing Invoice Report
- Side-by-side comparison of prior year vs current year financial metrics
- Quarter-over-Quarter breakdown table with selectable quarters (Q1-Q4 multi-select)
- Year-over-Year summary table showing all financial metrics with variance analysis
- Comparison metric cards showing Total Invoiced, Pre-Tax Amount, Amount Paid, and Outstanding with delta indicators
- Color-coded variance indicators (green for growth, red for decline) with dollar and percentage changes
- Export comparison data to Excel for offline analysis

**Invoice Report: Quick Date Filters**
- "Prior Year" button instantly sets the date range to the previous full calendar year
- "Current Year" button resets to January 1 through today
- Faster navigation between reporting periods

**Invoice Report: Clickable Invoice Numbers**
- Invoice numbers in the report table are now clickable links
- Clicking navigates directly to the full invoice batch detail page for review

---

### Version 1.2026.02.08 (February 8, 2026)

**Release Date:** February 8, 2026  
**Status:** Production Release  
**Codename:** Portfolio & Documentation Refresh

This release adds a dedicated Portfolio Timeline page, fixes a potential start date input bug, and brings the public roadmap and changelog up to date with all completed features.

#### ✨ New Features

**Portfolio Timeline Page**
- Dedicated `/portfolio/timeline` page under Portfolio Management in the sidebar
- Cross-project Gantt-style timeline for visualizing project schedules
- Accessible from both desktop sidebar and mobile navigation

#### 🐛 Bug Fixes
- Fixed potential start date input on projects — typing no longer wipes out the field mid-edit
- Fixed multiple API routes that could fail tenant isolation checks under certain conditions
- Improved deployment reliability for changelog version detection and error handling
- Fixed "What's New" modal not appearing in certain deployment configurations

#### 📚 Documentation
- Updated Roadmap to reflect all completed features (multi-tenancy, retainers, resource management, per diem, reporting, mobile optimization, AI features, Planner integration)
- Cleaned up outdated planning sections that showed completed work as "Planned" or "Future"
- Updated Changelog with comprehensive release history

---

### Version 1.2026.02.07 (February 7, 2026)

**Release Date:** February 7, 2026  
**Status:** Production Release  
**Codename:** Communication & Transparency

This release introduces AI-powered help chat, a "What's New" update notification system, in-app documentation, and improvements to expense management and per diem calculations.

#### ✨ New Features

**AI-Powered Help Chat**
- Added a floating help chat widget accessible from every page
- AI assistant answers questions about Constellation features and navigation
- Provides contextual navigation suggestions with direct links
- Understands platform capabilities including time tracking, expenses, invoicing, and reporting
- Conversation history maintained within each session

**"What's New" Update Notifications**
- Users are automatically notified about platform updates on login
- AI-generated summaries of release notes presented in a friendly, non-technical format
- Grouped highlights with emoji icons for quick scanning
- Mobile-responsive bottom-sheet design on smaller screens
- Tenant-level admin toggle to enable or disable notifications
- Per-user tracking so dismissed updates don't reappear

**In-App Documentation System**
- Added User Guide, Changelog, and Roadmap pages accessible from the sidebar
- Markdown-based content rendered with full formatting, tables, and code blocks
- Dark mode support for all documentation pages
- Navigation links from the sidebar and About page

**Contractor Expense Invoice Improvements**
- Improved expense filtering and receipt download capabilities
- Enhanced per diem rate calculations with better error handling
- More accurate GSA and OCONUS rate lookups

#### 🐛 Bug Fixes
- Fixed expense report filtering for receipt bundles
- Improved per diem calculation accuracy for edge cases
- Fixed error handling in automated client payment tracking

#### 📚 Documentation
- Created comprehensive User Guide with feature walkthroughs
- Added platform Roadmap with current priorities and future plans
- Established documentation maintenance process with versioning

---

### Version 1.2026.01.31 (January 31, 2026)

**Release Date:** January 31, 2026  
**Status:** Production Release  
**Codename:** Foundation Strengthening

This release focuses on scheduled job monitoring, automated Microsoft Planner synchronization, and enhanced QuickBooks Online export capabilities.

#### ✨ New Features

**Scheduled Jobs Monitoring System**
- Created comprehensive monitoring system for all automated jobs
- Admin UI at `/admin/scheduled-jobs` showing job execution history
- Overview cards displaying job statistics (total runs, success rate, failures)
- Run history with filtering by job type and status
- Manual trigger buttons for each scheduled job type
- Three tracked job types:
  - Expense Reminders (tenant-configurable, weekly)
  - Time Entry Reminders (system-wide, weekly)
  - Microsoft Planner Sync (automatic, every 30 minutes)

**Microsoft Planner Automatic Synchronization**
- Automatic sync every 30 minutes for all projects with `syncEnabled=true`
- Handles deleted Planner tasks by automatically recreating them
- Task creation with proper bucket mapping based on project stages
- User assignment mapping between Constellation and Azure AD users
- Bidirectional status synchronization (open/in_progress/completed ↔ percent complete)
- Date synchronization for planned start and end dates
- Task notes include Constellation project link and hours allocation
- Comprehensive error handling and logging
- Manual trigger endpoint for on-demand synchronization
- Job run history visible in scheduled jobs admin UI

**QuickBooks Online Export Enhancements**
- Enhanced to 13-column QBO Invoice IIF format
- Added support for Payment Terms, Billing Address, and Service Date
- Hierarchical Product/Service format: `Project:Type:Category`
- Improved descriptions matching printed invoice format
- Custom transaction number support (requires QBO settings enabled)

#### 🐛 Bug Fixes
- Fixed TypeScript errors in server storage layer (schema alignment issues)
- Improved error handling in Planner sync for missing Azure AD mappings
- Fixed race conditions in scheduled job execution

#### 📚 Documentation
- Updated admin documentation for scheduled jobs monitoring
- Added Microsoft Planner sync troubleshooting guide
- Enhanced QBO export format documentation

---

### Version 1.2026.01.15 (January 15, 2026)

**Release Date:** January 15, 2026  
**Status:** Production Release  
**Codename:** Multi-Tenant SaaS Platform

This major release transforms Constellation from a single-tenant application into a full multi-tenant SaaS platform, enabling multiple organizations to operate independently on shared infrastructure.

#### ✨ New Features

**Multi-Tenancy Architecture**
- UUID-based tenant IDs with complete data isolation across all tables
- Service plans: Trial, Team, Enterprise, and Unlimited tiers
- Subdomain routing for tenant-specific access
- Automatic tenant assignment on login via Azure AD tenant ID mapping, email domain matching, or default fallback
- Platform roles (`global_admin`, `constellation_admin`) for cross-tenant management
- Regular `admin` role scoped to own tenant

**Platform Administration**
- Platform admin UI at `/platform/tenants` for managing all tenants
- Service plan management at `/platform/service-plans`
- Platform-wide user management at `/platform/users`
- Airport code reference data management at `/platform/airports`
- OCONUS per diem rate management at `/platform/oconus`

**Tenant Settings & Branding**
- Tenant-specific company info and branding configuration
- Configurable invoice footer and email notification branding
- Tenant-scoped vocabulary customization
- Separate platform-wide settings (default rates, estimation factors)

**Retainer Estimate & Management**
- New retainer estimate type for monthly hour-block engagements
- Creation wizard with auto-generated monthly structure
- Optional multi-rate tiers per month (e.g., Senior at $250/hr for 35hrs + Junior at $150/hr for 20hrs)
- Rate tiers stored in `retainerRateTiers` JSONB on project stages
- Live retainer month management at project level (independent of locked estimates)
- CRUD for retainer stages via `/api/projects/:id/retainer-stages`
- UI in Contracts > Retainer tab with add/edit/delete/extend capabilities
- Month status indicators and auto-generated end-of-month payment milestones
- Utilization tracking for retainer engagements

**Project Rate Overrides**
- Project-level billing and cost rate overrides
- Accessible from Contracts > Rate Overrides tab
- Hierarchical rate precedence: project → client → role

**Resource Management & Capacity Planning**
- Dual List and Timeline views for resource allocation
- Capacity planning dashboard with utilization metrics
- Conflict detection for over-allocated resources
- Portfolio timeline for cross-project schedule visibility

#### 🔧 Improvements
- Enhanced project detail page with consolidated Contracts tab (retainers, rate overrides)
- Improved data isolation with tenant-scoped queries across all API endpoints
- Better role-based access control with five-tier hierarchy (admin, billing-admin, pm, employee, executive)

#### 📚 Documentation
- Multi-tenancy architecture documentation
- Retainer management user guide
- Platform administration guide

---

### Version 1.2025.12.15 (December 15, 2025)

**Release Date:** December 15, 2025  
**Status:** Production Release  
**Codename:** Travel & Expense Automation

This release delivers comprehensive per diem automation, advanced expense management, and mobile-optimized interfaces for field consultants.

#### ✨ New Features

**GSA Per Diem Integration (CONUS)**
- Real-time GSA API integration for per diem rates by city, state, and zip code
- Automatic rate determination across all CONUS tiers
- FY 2025/2026 rate support with automatic updates
- Travel day calculation (75% rate for partial days)
- Automatic M&IE (Meals & Incidental Expenses) calculation

**OCONUS Per Diem Support**
- Department of Defense OCONUS rate database
- Admin management interface for OCONUS locations and rates
- Integration with expense calculations for international travel

**Airport Code Reference Data**
- Database of 5,163 IATA airport codes for global airports
- Used in expense forms for travel location selection
- Managed by platform admins

**Expense Approval Workflow Enhancements**
- Comprehensive finite state machine for expense status transitions
- Role-based approval access (PM, executive, admin levels)
- Automated per diem calculation in expense entry
- Contractor expense invoices with PDF and QuickBooks-compatible CSV export
- Receipt bundle download for expense reports

**Mobile Web Optimization**
- Responsive navigation with mobile sidebar and bottom navigation
- Touch-friendly interfaces across all modules
- Mobile-responsive modals using bottom-sheet design pattern
- Optimized table views and data displays for smaller screens

**Financial Reporting**
- Revenue, cost, profit, and margin reports by client and project
- KPI summary dashboard with project health scoring
- Budget utilization metrics and variance tracking
- Role-based visibility controls for financial data
- Dynamic vocabulary labels in all report outputs

#### 🔧 Improvements
- Enhanced expense forms with location autocomplete
- Improved mobile layout for time entry and expense submission
- Better responsive design for data-heavy pages (estimates, invoices)

---

### Version 1.2025.10.11 (October 11, 2025)

**Release Date:** October 11, 2025  
**Status:** Production Release  
**Codename:** Assignment Management & Vocabulary

This major release introduces comprehensive project assignment management, organization-wide vocabulary customization, and establishes the foundation for resource management.

#### ✨ New Features

**Project Assignment Management**
- Backend API endpoints for complete assignment CRUD operations
- Assignment status workflow: open → in_progress → completed → cancelled
- Manual assignment UI integrated into Project Detail page
- Add/Edit/Delete assignments with comprehensive dialog interface
- Assign people with role, workstream, epic, and hours allocation
- Set pricing mode (billable, non-billable, internal) and billing rates
- Define assignment start/end dates with notes
- "My Assignments" page for employees to view all project allocations
- Inline status updates for assignments
- Multiple views: List and Kanban board with filtering capabilities

**Vocabulary Customization System**
- Organization-level vocabulary defaults with admin UI
- Client-level vocabulary overrides
- Project-level vocabulary overrides
- Vocabulary context API with React Provider/Hook pattern
- Cascading hierarchy: Project → Client → Organization → System defaults
- Complete integration across all modules:
  - Estimates module (55 dynamic vocabulary references)
  - Projects module with automatic inheritance on creation
  - Time entry module
  - Invoice module
  - Expense module

**Code Quality & Organization**
- Fixed 11 TypeScript errors in server/storage.ts
- Created test.md for test backlog tracking and sprint management
- Archived 29 legacy files (PowerShell scripts, recovery scripts, corrupted files)
- Merged development commands to replit.md
- Established organized archive structure

#### 🔧 Improvements
- Enhanced project detail page layout with assignments section
- Improved resource allocation visibility across projects
- Better role-based pricing and billing rate management

#### 📚 Documentation
- Comprehensive vocabulary system documentation
- Assignment management user guide
- Updated replit.md with current development practices

---

### Version 1.2025.09.15 (September 15, 2025)

**Release Date:** September 15, 2025  
**Status:** Production Release  
**Codename:** SharePoint Integration

This release introduces Microsoft SharePoint integration for document management and establishes the foundation for Microsoft 365 ecosystem connectivity.

#### ✨ New Features

**SharePoint Document Storage**
- SharePoint container creation for projects and clients
- Automated folder structure generation
- Document upload with metadata tagging
- Document retrieval and listing APIs
- Permission management for secure access
- Integration with existing project and client workflows

**Microsoft Authentication**
- Microsoft Single Sign-On (SSO) support via Azure AD
- OAuth2 authentication flow
- Secure token management
- User profile synchronization

#### 🔧 Improvements
- Enhanced security with Azure AD integration
- Improved document organization and access control
- Better enterprise compliance capabilities

---

### Version 1.2025.08.20 (August 20, 2025)

**Release Date:** August 20, 2025  
**Status:** Production Release  
**Codename:** Financial Management

This release focuses on comprehensive financial management capabilities including invoicing, expense tracking, and reporting.

#### ✨ New Features

**Invoice Management**
- Invoice batch creation from time entries and expenses
- Support for billable hours, expenses, and fixed-fee line items
- QuickBooks Online IIF export (11-column format)
- Invoice preview and PDF generation
- Batch approval workflow
- Payment tracking and reconciliation

**Expense Management**
- Expense report creation with receipt uploads
- Multi-level approval workflow (PM → Executive)
- Expense categorization and project allocation
- Reimbursement batch processing
- Expense approval dashboard
- Receipt image storage and retrieval

**Financial Reporting**
- Project profitability analysis
- Revenue recognition tracking
- Expense analytics by category and project
- Budget vs. actual reporting
- Client financial summaries

#### 🔧 Improvements
- Enhanced rate management with project-specific overrides
- Better handling of billable vs. non-billable time
- Improved expense approval notifications

---

## Version History

### Version 1.2025.07.10 (July 10, 2025)
- **Core Platform Launch**
- Initial production release
- Project management with stages and milestones
- Client management and organization
- User management with role-based access control
- Time tracking with approval workflows
- Basic rate management
- Dashboard with project overview

### Version 1.2025.06.15 (June 15, 2025)
- **Beta Release**
- Feature complete for initial pilot
- Testing and bug fixes
- Performance optimizations

### Version 1.2025.05.01 (May 1, 2025)
- **Alpha Release**
- Core functionality implementation
- Database schema finalization
- Initial UI development

---

## Upgrade Notes

### Upgrading to 1.2026.01.31

**Database Changes:**
- New table: `scheduled_job_runs` for job execution tracking
- Ensure database migrations are run before deployment

**Configuration Updates:**
- Review scheduled job configuration in admin settings
- Verify Microsoft Graph API permissions for Planner sync
- Update QuickBooks Online export settings if using custom transaction numbers

**Breaking Changes:**
- None in this release

**Recommended Actions:**
1. Back up database before upgrading
2. Test Planner sync on a single project first
3. Verify scheduled jobs are running correctly in admin UI
4. Review QBO export format with accounting team

---

### Upgrading to 1.2025.10.11

**Database Changes:**
- New table: `project_assignments` for assignment tracking
- New table: `vocabulary_overrides` for custom terminology
- Schema updates for existing tables to support vocabulary

**Configuration Updates:**
- Set up organization-level vocabulary defaults in admin settings
- Review and configure assignment workflow settings

**Breaking Changes:**
- None, but new assignment features require user training

**Recommended Actions:**
1. Configure vocabulary defaults before rolling out to users
2. Train project managers on assignment management features
3. Migrate any existing assignment data to new schema

---

### Upgrading to 1.2025.09.15

**Database Changes:**
- New SharePoint integration tables
- Azure AD authentication tables

**Configuration Updates:**
- Azure AD application registration required
- SharePoint permissions configuration
- Update authentication environment variables

**Breaking Changes:**
- None, new features are opt-in

**Recommended Actions:**
1. Complete Azure AD app registration
2. Configure SharePoint permissions
3. Test SSO with pilot group before full rollout

---

## Release Schedule

Constellation follows a continuous delivery model with regular feature releases:

- **Major Releases:** Quarterly (includes significant new features)
- **Minor Releases:** Monthly (includes enhancements and bug fixes)
- **Patch Releases:** As needed (critical bug fixes and security updates)

Version numbers follow the format: `Major.YYYY.MM.DD`
- **Major:** Increments for significant platform changes (currently 1)
- **YYYY:** Four-digit year
- **MM:** Two-digit month
- **DD:** Two-digit day of release

---

## Support & Feedback

### Getting Help
- **Documentation:** [User Guide](/docs/user-guide/SCDP-User-Guide.md)
- **Administrator Guide:** [Admin Guide](/docs/user-guide/SCDP-Administrator-Guide.md)
- **IT Support:** ITHelp@synozur.com

### Reporting Issues
When reporting issues, please include:
- Version number (check About page)
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if applicable
- Browser type and version

### Feature Requests
Have ideas for improving Constellation? Contact your administrator or reach out to the Synozur team to discuss potential enhancements.

---

*Last Updated: March 1, 2026*  
*Maintained by: Synozur IT Team*
