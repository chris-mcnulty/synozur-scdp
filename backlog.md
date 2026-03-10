# Constellation Product Backlog

**Last Updated**: March 10, 2026
**Version**: 5.0 — Added Copilot Agent, Persistent Status Reports, MCP Server v1.7 items.

---

## ✅ Recently Completed (March 10, 2026)

### MCP Server & Constellation Copilot Agent ✅ COMPLETE
- [x] MCP server with ~24 read-only GET endpoints under `/mcp`
- [x] Bearer token authentication via JWKS (v1 + v2 Entra token issuers)
- [x] Multi-tenant support (Entra `common` authority)
- [x] RBAC-enforced access with tenant-scoped data isolation
- [x] Power Platform Custom Connector with OpenAPI spec import
- [x] Copilot Studio agent for conversational access through Teams and M365 Copilot
- [x] Teams channel deployment for chat and channel-based interactions
- [x] Connector setup guide (`docs/MCP_CONNECTOR_SETUP.md`)
- [x] Endpoint reference (`docs/MCP_README.md`)

### Persistent Status Reports ✅ COMPLETE
- [x] `status_reports` table migrated to database
- [x] AI-generated text reports auto-saved on generation
- [x] PPTX export creates "final" status report record
- [x] Status Reports tab on project detail page with list view
- [x] View report content, mark as final, delete reports
- [x] Full CRUD API at `/api/projects/:projectId/status-reports`
- [x] MCP endpoints for saved status reports (list + detail)
- [x] Project ownership and tenant isolation enforcement on all routes

### AI Model Upgrade ✅ COMPLETE
- [x] Azure AI Foundry integration with GPT-5.4 support
- [x] Multi-provider AI architecture (Replit AI + Azure AI Foundry)
- [x] Configurable model selection per request
- [x] Usage logging and cost tracking per tenant

### SharePoint Embedded Document Storage ✅ COMPLETE
- [x] Full SharePoint Embedded (SPE) integration as primary document storage tier
- [x] Per-tenant SPE container provisioning with Azure AD tenant isolation
- [x] Smart storage layer directing files based on tenant `speStorageEnabled` flag
- [x] Direct file download via Microsoft Graph API (`downloadFileDirect`)
- [x] File Repository page with document type inference from folder paths
- [x] Expandable metadata panel and file statistics dashboard
- [x] Reorganize Files endpoint to move files from nested to top-level SPE folders
- [x] End-to-end receipt download pipeline for SPE-stored files
- [x] Expense "View Receipt" and invoice receipt bundler using direct Graph API
- [x] Container management interface for administrators
- [x] Custom column support with SharePoint-safe naming conventions
- [x] File stats and document type breakdown fixes

### Program Estimate Type ✅ COMPLETE
- [x] New "Program" estimate type for large-scale engagements
- [x] Week-based staffing blocks (role x weeks x utilization %)
- [x] Gantt timeline view for program blocks
- [x] PM Wizard for guided block creation
- [x] Accordion-based block editor with compact data entry
- [x] Weekly subtotals and totals display
- [x] Auto-populate rates from role catalog
- [x] CSV/Excel import and export for program blocks
- [x] Three-factor contingency system (size, complexity, confidence)
- [x] Week 0 support for pre-project activities

### Portfolio Manager Role ✅ COMPLETE
- [x] New "portfolio-manager" role (6th tier in hierarchy)
- [x] PM-level access to ALL projects (not scoped to assigned projects)
- [x] View-only expense access
- [x] External resource cost rates hidden

### HubSpot CRM Integration ✅ COMPLETE
- [x] Per-tenant OAuth 2.0 connection
- [x] CRM Deals page with date range and deal stage filters
- [x] Estimate-to-deal linking with client names and stages
- [x] Won/Lost deal linking
- [x] Contact search and import from HubSpot
- [x] Company-to-client linking
- [x] Auto-refresh tokens with 5-minute buffer

### Estimate Bug Fixes ✅ COMPLETE
- [x] Cost rate resolution: full precedence chain (manual override → estimate → client → user → role default)
- [x] Copied estimates inherit tenant ID (fixes orphaned estimates)
- [x] Estimate name editing regardless of status
- [x] Stable sort order: week first, then sort order as tiebreaker

---

## ✅ Previously Completed (February 13, 2026)

### RAIDD Log ✅ COMPLETE
- [x] Dedicated RAIDD tab within project detail page
- [x] Five entry types: Risk, Issue, Action Item, Dependency, Decision
- [x] Full lifecycle management, governance rules, Excel export
- [x] AI integration in status reports

### Portfolio RAIDD Dashboard ✅ COMPLETE
- [x] Cross-project RAIDD view with summary cards, filters, grouping, XLSX export

### AI-Powered Project Status Reports ✅ COMPLETE
- [x] AI-generated narrative summaries, weekly/monthly periods, RAIDD integration, copy/download

### "What's New" Changelog Modal ✅ COMPLETE
- [x] AI-generated summaries on login, per-user dismiss tracking, tenant admin toggle, mobile responsive

### Per Diem & Expense Automation ✅ COMPLETE
- [x] GSA Per Diem API (CONUS), OCONUS DoD rates, airport codes, exchange rates, travel day calculations

### Invoice Report Enhancements ✅ COMPLETE
- [x] Client filter, three-year data, YoY comparison, batch type filtering

### Expense Report PDF Export ✅ COMPLETE (Quick Win)

---

## ✅ Previously Completed (January 2026)

### Multi-Tenancy Architecture ✅ COMPLETE (Phases 1-4, 6)
- [x] UUID-based tenant IDs, data isolation, service plans, self-service signup
- [x] Plan lifecycle enforcement, grace periods, scheduled expiration
- [x] Platform admin UI, tenant switcher, automatic assignment
- [ ] Phase 5: Subdomain routing — DEFERRED (needs custom DNS + wildcard SSL)
- [ ] Phase 7: Security audit, data retention enforcement — ONGOING

### Retainer Estimates & Rate Overrides ✅ COMPLETE
### Resource Management & Capacity Planning ✅ COMPLETE
### Financial Reporting ✅ COMPLETE
### Microsoft Planner Integration (Phase 1) ✅ COMPLETE
### Scheduled Jobs System ✅ COMPLETE
### Mobile Web Optimization ✅ COMPLETE
### AI Help Chat & In-App Docs ✅ COMPLETE

---

## 🚨 P1 - HIGH PRIORITY

### Estimate-Level Sharing (Read-Only ACL)
**Status:** Complete
**Effort:** Medium (2-3 days)

- [x] "Share" button on estimates for PMs to invite specific users with read-only access
- [x] New `estimate_shares` table (estimate_id, user_id, granted_by, granted_at)
- [x] Shared estimates appear in the user's estimate list (read-only badge)
- [x] API-level permission checks: shared users can GET estimate data but not POST/PATCH/DELETE
- [x] Cost/chargeback rate columns hidden from shared viewers (API response filtering)
- [x] Share management UI: grant, revoke, view current shares
- [x] Shared viewer sees estimate detail, line items, totals, and Gantt — but not cost rates or margin data
- [x] Read-only banner shown to shared viewers on estimate detail page

### QuickBooks Online Integration
**Status:** Planned — #1 user-requested feature (94 marketplace coins, Feb 2026 feedback)
**Effort:** High (8-12 weeks)

- [ ] OAuth2 authentication with QuickBooks Online
- [ ] Client → QBO Customer mapping interface
- [ ] Role/Service → QBO Items mapping
- [ ] Expense categories → QBO Account mappings
- [ ] Invoice Batch → QBO Invoice (Draft) creation
- [ ] Batch ID deduplication to prevent duplicates
- [ ] Webhook integration for sync status
- [ ] QBO sync dashboard with error reporting
- [ ] Retry mechanism for failed syncs

### Advanced Resource Management
**Status:** Planned — Design complete (`docs/design/advanced-resource-management.md`)
**Effort:** High (~7-8 weeks, 6 phases)

- [ ] Phase 1: Multi-role capability mapping & per-person capacity profiles (~1 week)
- [ ] Phase 2: Planner sync protection for generic roles (~2-3 days)
- [ ] Phase 3: Smart assignment suggestions with cost variance (~2 weeks)
- [ ] Phase 4: Cross-project workload view & rebalancing dashboard (~2 weeks)
- [ ] Phase 5: Capacity planning analytics & KPIs (~1-2 weeks)
- [ ] Phase 6: Bulk import & polish (~1 week)

### Microsoft 365 Teams Integration
**Status:** Partially complete — Planner done, Teams pending
**Effort:** Medium (4-6 weeks remaining)

- [x] Planner one-way sync ✅
- [x] Database schema for Teams/Channels/Planner ✅
- [ ] Automatic Team creation for new clients
- [ ] Channel creation for subsequent projects
- [ ] SharePoint site provisioning with Team
- [ ] Team member management (add/remove from assignments)
- [ ] Planner Phase 2: Bidirectional sync via Graph webhooks
- [ ] Project creation UI with M365 options

### Codebase Modularization
**Status:** Planned — Pattern established with `platform.ts` extraction
**Effort:** Medium (4-6 weeks)

- [ ] Phase 1: Route extraction (13 domain modules from routes.ts)
- [ ] Phase 2: Storage layer extraction (8 domain modules from storage.ts)
- [ ] Phase 3: Shared middleware & utilities extraction

---

## 📊 P2 - IMPORTANT FEATURES

### Advanced Financial Reporting
**Status:** Partially complete — YoY and client filter done
**Effort:** Medium (4-6 weeks)

- [x] Year-over-year revenue analysis ✅
- [x] Client filter on reports ✅
- [ ] Client contribution analysis and rankings
- [ ] Service line revenue breakdown
- [ ] Revenue forecasting based on pipeline
- [ ] Estimate vs Actual accuracy metrics (portfolio-wide)
- [ ] Variance analysis by project type, client, team member
- [ ] Interactive dashboard with drill-down

### Commercial Schemes: Milestone Fixed Fee
**Status:** Planned
**Effort:** Medium (3-4 weeks)

- [ ] Milestone definition with acceptance criteria
- [ ] Percentage complete tracking
- [ ] Milestone payment scheduling & partial billing
- [ ] Client acceptance workflow with digital sign-off
- [ ] Milestone variance reporting

### Commercial Schemes: Enhanced T&M
**Status:** Planned
**Effort:** Medium (2-3 weeks)

- [ ] Rate calculation at service date
- [ ] Not-to-exceed (NTE) budget tracking with alerts
- [ ] T&M profitability analysis
- [ ] Progress-to-budget real-time reporting

### Pricing Privacy & Rate Management
**Status:** Planned
**Effort:** Medium (2-3 weeks)

- [ ] Separate rack rates (internal) from charge rates (client-facing)
- [ ] Rate margin calculations and reporting
- [ ] Field-level security to hide cost data from non-admin roles
- [ ] Rate grandfathering for existing engagements

### Notifications System
**Status:** Deprioritized per Feb 2026 user feedback
**Effort:** Medium (4-6 weeks)

- [ ] In-app notification center (bell icon, dropdown, full page)
- [ ] Email notifications via SendGrid
- [ ] User preferences with granular per-type controls
- [ ] Time entry reminders, expense approvals, budget alerts, deadline reminders

### Estimate Adjustment Factors - System Defaults
**Status:** Planned
**Effort:** Low (1 week)

- [ ] Admin UI for default Size, Complexity, and Confidence factors
- [ ] Estimate-level override toggle (inherit vs custom)
- [ ] Impact preview before applying changes

### SharePoint Embedded UI ✅ COMPLETE
**Status:** Complete (March 10, 2026)
**Effort:** Medium (3-4 weeks)

- [x] Container management interface
- [x] Document metadata templates and custom columns
- [x] File Repository with document type inference and metadata panel
- [x] Document search with metadata filtering
- [x] File reorganization tools
- [ ] Permission management interface — DEFERRED
- [ ] Bulk document operations — DEFERRED
- [ ] Version history viewer — DEFERRED
- [ ] Document approval workflow — DEFERRED

### Document Management Enhancements
**Status:** Planned
**Effort:** Medium (3-4 weeks)

- [ ] MSA/NDA document tracking with expiration alerts
- [ ] Contract document repository with versioning
- [ ] Document templates library
- [ ] E-signature integration (DocuSign)

### Advanced Dashboard Features
**Status:** Planned
**Effort:** Medium (2-3 weeks)

- [ ] Customizable dashboard widgets
- [ ] Executive dashboard view
- [ ] Drill-down capabilities
- [ ] Scheduled dashboard emails

### Time Tracking UX Improvements
**Status:** Planned
**Effort:** Low (1-2 weeks)

- [ ] User-scoped default view (my time vs all time)
- [ ] Timer-based tracking with start/stop
- [ ] Missing entry detection
- [ ] Persist view preferences per user

---

## 🤖 P3 - AI & AUTOMATION

### AI-Enhanced Workflows
**Status:** Future
**Effort:** High (8-12 weeks)

- [ ] Receipt OCR with auto-extraction and category prediction
- [ ] Weekly time entry suggestions based on patterns
- [ ] Anomaly and duplicate detection
- [ ] Estimate intelligence: similar project suggestions, risk identification

### MCP Server (Model Context Protocol) ✅ COMPLETE
**Completed:** March 2026 (v1.7) — See "Recently Completed" section above.

### Persistent Status Reports ✅ COMPLETE
**Completed:** March 2026 (v1.7) — See "Recently Completed" section above.

**Future Enhancements (not yet started):**
- [ ] SPE file storage for PPTX reports (currently saved to DB only)
- [ ] Bulk delete option for cleaning up older drafts
- [ ] Auto-archive reports older than N months
- [ ] Scheduled automatic report generation and email delivery

---

## 🔗 P4 - PLATFORM CAPABILITIES (2026+)

### Accounts Payable (AP) - Contractor Payment Management
**Status:** Planned
**Effort:** Very High (8-13 weeks, 6 phases)

- [ ] Contractor invoice submission, matching, and payment tracking
- [ ] Finance menu restructure (AR + AP)
- [ ] PDF upload with SharePoint storage
- [ ] Split-view invoice matching interface
- [ ] Cost rate validation with variance alerts
- [ ] Approval and payment workflow
- [ ] AP reporting (payment history, pending invoices, aging)

### Cloud Deployment Migration: GCP → Azure
**Status:** Planned — Replit engineering task
**Effort:** Medium (coordination with Replit engineering)

- [ ] Migrate Constellation hosting from GCP to Azure infrastructure
- [ ] Coordinate with Replit engineering team for deployment target change
- [ ] Validate all environment variables and secrets transfer correctly
- [ ] Verify database connectivity and performance on Azure
- [ ] Test SharePoint Embedded and Microsoft Graph API latency improvements (same-cloud advantage)
- [ ] Validate AI Foundry endpoint connectivity from Azure-hosted environment
- [ ] Update deployment documentation and runbooks
- [ ] Smoke test all integrations (HubSpot, SendGrid, Outlook, SharePoint) post-migration

### SPE File Lifecycle & Orphan Cleanup
**Status:** Design Required
**Effort:** Medium (3-5 weeks)

- [ ] Design cleanup strategy for SharePoint Embedded files tied to draft or deleted invoices, deleted expenses, and other transient artifacts
- [ ] Identify and catalog all SPE file creation points (invoice PDFs, expense receipts, SOW documents, deliverable attachments, etc.)
- [ ] Define retention policies: which files should be soft-deleted, hard-deleted, or archived when their parent record is removed
- [ ] Build orphan detection service: find SPE files with no matching database record (e.g., invoice PDF exists but batch was deleted, receipt uploaded but expense was removed)
- [ ] Implement periodic cleanup job (scheduled task) to flag or remove orphaned files based on retention rules
- [ ] Consider discoverability impact: ensure deleted/draft artifacts are excluded from MCP and Copilot queries so AI assistants don't surface stale data
- [ ] Add admin UI for reviewing orphaned files before permanent deletion (safety net)
- [ ] Handle edge cases: files referenced by multiple records, files in tenant-specific vs shared containers, migration-era files with null tenantId

### Extended Integrations
**Status:** Future

- [ ] Salesforce CRM integration
- [ ] Xero / NetSuite accounting
- [ ] Slack notifications and commands
- [ ] Jira / Azure DevOps linking

### API Platform
**Status:** Future

- [ ] Public REST API v2 with OpenAPI docs
- [ ] API key management and rate limiting
- [ ] Webhook management
- [ ] Developer portal with SDKs

### Internationalization & Localization
**Status:** Future

- [ ] Multi-language support (Spanish, French, German)
- [ ] Multi-currency with real-time FX
- [ ] Regional compliance (GDPR, local tax)

### Advanced Security & Compliance
**Status:** Future

- [ ] SOC 2 Type II preparation
- [ ] Data retention policies and right-to-be-forgotten
- [ ] Passwordless / FIDO2 authentication

### Client Portal
**Status:** Deprioritized

- [ ] Client project dashboard, invoice viewing, document sharing
- [ ] Change request submission, secure messaging

---

## 📋 SUMMARY

### Active Backlog by Priority

| Priority | Items | Est. Effort |
|----------|-------|-------------|
| P1 - High | 4 items | 24-32 weeks |
| P2 - Important | 9 items | 20-30 weeks |
| P3 - AI/Automation | 2 items | 11-16 weeks |
| P4 - Platform | 7 items | 34+ weeks |

### Notes on Already Implemented Features (NOT in backlog)
- ✅ Expense bulk upload with CSV/Excel
- ✅ MFA via Azure Entra ID
- ✅ Project and estimate milestones
- ✅ Basic burn rate tracking
- ✅ Estimate accuracy reporting
- ✅ Portfolio metrics
- ✅ Time/expense import templates
- ✅ Change order management
- ✅ SOW management
- ✅ Invoice batch PDF generation
- ✅ Financial reports API endpoints
- ✅ Dashboard KPIs
- ✅ Program estimates with Gantt view
- ✅ HubSpot CRM integration
- ✅ Portfolio Manager role
- ✅ Per Diem (CONUS + OCONUS)
- ✅ "What's New" changelog modal
- ✅ AI status reports with RAIDD
- ✅ SharePoint Embedded document storage with File Repository
