# Constellation Product Backlog

**Last Updated**: March 1, 2026
**Version**: 4.0 — Cleaned up completed items, reprioritized based on current state.

---

## ✅ Recently Completed (March 1, 2026)

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

### SharePoint Embedded UI
**Status:** Backend complete, UI pending
**Effort:** Medium (3-4 weeks)

- [ ] Container management interface
- [ ] Document metadata templates and custom columns
- [ ] Permission management interface
- [ ] Document search with metadata filtering
- [ ] Bulk document operations
- [ ] Version history viewer
- [ ] Document approval workflow

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
- [ ] MCP server infrastructure with RBAC-enforced AI tools

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
| P2 - Important | 10 items | 24-34 weeks |
| P3 - AI/Automation | 1 item | 8-12 weeks |
| P4 - Platform | 6 items | 30+ weeks |

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
