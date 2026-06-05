# Constellation Product Backlog

**Last Updated**: May 25, 2026
**Version**: 7.3 — Added Contractor Invoice Ingestion (Accounts Payable) v1 to Recently Completed: full inbound AP workflow with AI vision extraction, candidate-based reconciliation against logged time and expenses, and atomic posting of actual cost to project margin. Profit reads across the platform now prefer `actualCostAmount` (from posted vendor invoices) over rate-card estimates. v7.2 carried Status reconciliation on Teams Integration Phase 2 and Project Creation UX Enhancement.

---

## ✅ Recently Completed (v2.5 — May 2026)

### Galaxy Client Portal API ✅ COMPLETE
- [x] External `/api/galaxy/v1/*` API mounted alongside (and independent of) the internal A2A and MCP APIs
- [x] OAuth2 authorization-code (delegated) and client-credentials grants
- [x] Token issuance against Microsoft Entra with `tenantId` + `clientId` claims for automatic scoping
- [x] Per-app registration UI under Settings → Galaxy API (redirect URIs, webhook URL, allowed origins, scope ceiling)
- [x] Hashed storage of client secret + webhook signing secret with one-time display and rotation
- [x] Document download streaming through the portal (no direct SharePoint exposure)
- [x] Signed webhook delivery with retry/audit
- [x] Admin Galaxy page (`/admin/galaxy`)
- [x] Test suites for auth, scopes, routes, webhook delivery (Tasks #127, #142)
- [x] Schema migration `0009_galaxy_client_portal_api.sql`
- [x] `docs/galaxy-api.md`

### Notifications System ✅ COMPLETE
- [x] In-app notification center (bell, dropdown, full-page `/notifications`)
- [x] Per-user preferences page (`/notification-preferences`) with channel + per-type controls
- [x] Real-time unread count in browser tab title (Task #110)
- [x] Opt-in browser push notifications (Task #111)
- [x] Weekly digest emails via SendGrid (Task #101)
- [x] Per-tenant digest schedule configuration (Task #129)
- [x] Digest delivery stats on Scheduled Jobs page (Task #128)
- [x] SendGrid webhook open tracking (Task #130)
- [x] Notification hooks added to more platform events (Task #112)

### Multi-Currency Estimates & Invoicing ✅ COMPLETE
- [x] Quote currency separate from cost currency on estimates (Task #102)
- [x] Schema migration + SOW propagation
- [x] Quote-currency totals on invoice batches when they differ from cost currency
- [x] Client-currency amounts on estimate PDFs and Sub-SOW exports (Task #131)
- [x] Currency picker on expense edit form

### Excel-Like Time Grid 2.0 ✅ COMPLETE
- [x] Two-tab grid (current + prior week) with full keyboard nav (Task #125)
- [x] Drag-fill extends a series instead of just copying values
- [x] Virtualised rendering for large grids (Task #138)
- [x] Clipboard parser + row state machine unit tests (Task #137)
- [x] Project picker shows and searches by project code

### Estimate Version History ✅ COMPLETE
- [x] Backfill snapshots on first edit (Task #113)
- [x] Snapshot on every email/send (Task #115)
- [x] Who saved each snapshot in History panel (Task #114)
- [x] Side-by-side compare and restore from any prior version

### Client Portal Approvals & Sign-offs ✅ COMPLETE
- [x] Client Portal Approvals & Sign-offs (Task #104)
- [x] Sign-off status badges on estimates and milestone list views (Task #134)
- [x] Inline status report acknowledgement (Task #136)
- [x] Admin sign-offs audit log page (Task #135)
- [x] Payment milestones exposed to client portal users via Galaxy (Task #89)
- [x] Cascade allocation: shifted-from-milestone indicator (Task #91)
- [x] Cascade allocation: PM "undo" for applied date shift (Task #90)

### Payment Milestone Billing Automation ✅ COMPLETE
- [x] Auto-generate invoice batch when payment milestone marked Invoiced (Task #87)
- [x] Payment milestone billing status on portfolio dashboard (Task #88)
- [x] Hours budget status on project list dashboard table (Task #82)
- [x] Alert when project drops below 10% of budgeted hours (Task #83)
- [x] Empty-state callout for projects with no approved estimate hours (Task #84)

### AI Project Manager Agent ✅ COMPLETE
- [x] Conversational PM agent (Task #143) layered on v2.4 Copilot write infrastructure

### Planner Sync Robustness ✅ COMPLETE
- [x] Last-write-wins conflict resolution (Task #126)
- [x] Admin alerts on sync failures with actionable context
- [x] Improved retry/backoff on Graph throttling

### Operational & Performance Improvements ✅ COMPLETE
- [x] Persistent in-memory cache via startup warm-up loader (Task #106)
- [x] Invoice list speed-up via bulk-query approach (Task #105)
- [x] Server-side pagination on Users page (Task #116)
- [x] Auto-cleanup of old `background_jobs` rows (Task #121)
- [x] Background Jobs link in admin sidebar
- [x] Financial-comparison report rewritten to use SQL aggregation (Task #117)
- [x] Global deep-link search across projects, users, and time entries
- [x] Actionable data quality warnings with affected-item lists (Task #86)
- [x] Expandable event detail in calendar suggestions panel (Task #108)
- [x] "Visible to clients" toggle on RAIDD entries
- [x] Sync Copilot Studio client IDs to Azure manifest (Task #52)

### v2.5 Bug Fixes ✅ COMPLETE
- [x] Teams channel setup on project detail (3 bugs)
- [x] "Set Up Teams Channel" hidden on estimates that already have one
- [x] TimeGrid project picker shows and searches by project code

---

## 🆕 Recently Completed (v2.6 — May 2026)

### Contractor Invoice Ingestion (Accounts Payable) — v1 ✅ COMPLETE

**Why.** Until now Constellation generated *outbound* contractor invoices from approved expense reports (the `contractorInvoices` PDF flow). Inbound invoices from subcontractors — covering both *services* (time billed) and *expenses* — had no home: they lived in inboxes and ad-hoc folders, and project margin numbers reflected the firm's rate-card cost estimates instead of the actual amount paid to contractors. This shipped the inbound side of AP so margin reads now reflect real cost.

**Schema (additive).** Five new tables in `shared/schema.ts`:
- [x] `vendor_invoice_uploads` — raw ingested artifacts (PDF / PNG / JPEG / HEIC) staged before LLM extraction; SHA-256 dedupe; SPE storage refs
- [x] `vendor_invoices` — canonical inbound AP invoice with full FSM (`draft → extracted → in_review → reconciled → approved → posted → paid`, plus `disputed`/`void` side states)
- [x] `vendor_invoice_lines` — per-line items kind-discriminated as `service` / `expense` / `tax` / `discount` / `other`; carries AI extraction confidence + raw JSON for audit
- [x] `vendor_invoice_line_matches` — many-to-many junction onto source `time_entries` / `expenses` with allocated amount + quantity + auto/manual provenance
- [x] `project_cost_postings` — actual-cost ledger consumed by profit reports; optionally attributed to a client `invoice_batches.batchId` for per-batch margin
- [x] Additive columns: `time_entries.vendor_invoice_line_id` + `actual_cost_amount`, same on `expenses`, `users.vendor_ingest_email`
- [x] Zod insert schemas + `vendorInvoiceExtractionSchema` defining the LLM output contract

**Backend services.**
- [x] Storage module `server/storage/vendor-invoices.ts` — CRUD plus transactional `postVendorInvoice` (writes posting rows + back-fills `vendorInvoiceLineId` + `actualCostAmount` on every matched time entry / expense) and `voidVendorInvoice` (reverses postings, clears FKs)
- [x] AI extractor `server/services/vendor-invoice-extractor.ts` — extends `ChatMessage.content` to support OpenAI-style vision content parts (text + image_url); calls the configured provider via existing `getAIProviderAsync`; validates output against the Zod schema; logs to `aiUsageLogs` under feature key `VENDOR_INVOICE_EXTRACTION`
- [x] Reconciler `server/services/vendor-invoice-reconciler.ts` — weighted candidate scoring (amount 0.5 / date 0.2 / category 0.2 / vendor 0.1); ≥0.85 auto-matches, 0.6–0.85 surfaces as a suggestion; service lines greedily fill against billed quantity; produces `matched` / `partial` / `variance` / `unmatched` per line
- [x] Routes `server/routes/vendor-invoices.ts` — every endpoint the UI calls (list, detail, multipart upload with SHA-256 dedupe + SPE storage + extraction + auto-reconcile in a single request, preview stream, per-line match candidates, accept/remove match, override, approve/post/mark-paid/void) plus `/api/my-vendor-invoices*` for vendor self-service

**UI surfaces.** All under Financial → Accounts Payable and My Workspace → Tracking:
- [x] `/vendor-invoices` — inbox with "Needs Review" tab badge, search, status filter, per-row reconcile progress, inline upload dialog
- [x] `/vendor-invoices/:id` — split-pane reviewer screen: source PDF / image on the left, header + collapsible line items with one-click match suggestions on the right; top-bar Approve → Post → Mark Paid chain follows the FSM; Void side action with required reason
- [x] `/my-vendor-invoices` — vendor self-service read-only view with vendor-friendly status labels, source-document link, line items, and timeline
- [x] Sidebar: new "Accounts Payable" subgroup under Financial; My Workspace gets "My Vendor Invoices"

**Profit impact (the payoff).** Every cost aggregation that previously read `hours * costRate` now prefers `actualCostAmount` when present:
- [x] `getProjectVarianceData` (project detail margin tile)
- [x] `getPortfolioMetrics` (financial reports portfolio table)
- [x] `getDetailedProjectAnalytics` (project drill-in)
- [x] `/reports/portfolio-analysis` billable labor cost + team cost + expense aggregation
- [x] Weekly digest `totalCost` rollup
- [x] Financial Reports "Actual Cost" tile copy notes when actuals are sourced

**Permissions.** `pm`, `billing-admin`, `admin` can review / match / override; only `billing-admin` and `admin` can approve, post, mark paid, or void. Vendors only see invoices billed to them.

### Contractor Invoice Ingestion (AP) — v1 known limitations & next iterations

- [ ] **PDF extraction.** The shared `receipt-normalizer` renders PDFs to placeholder PNGs in production (Puppeteer is disabled), so PDF invoices currently land in `draft` status with no extracted lines and need manual line entry. Fix path: enable a hosted Puppeteer service or add a parallel provider method that uses Claude's native PDF document content type.
- [ ] **Email ingest channel.** `users.vendor_ingest_email` is plumbed but no Graph shared-mailbox poller exists yet. Manual web upload is the only channel.
- [ ] **Vendor stub promotion UI.** Unknown vendors land as stub users (`canLogin = false`). No UI yet to merge a stub into a real contractor record.
- [ ] **Dispute workflow UI.** Status exists, no reviewer/vendor flow to enter dispute details and resolve.
- [ ] **GL / QuickBooks bill export.** `glBillNumber` column is plumbed; no export job.
- [ ] **Three-way match against SOW commitments.** Would tie a vendor invoice to an estimate / sub-SOW for commitment-based AP.
- [ ] **Reconciler tests.** Vitest cases against fixture rows for the scoring engine.

---

## 🆕 Previously In Progress — Copilot Agent Write Activities

**Status:** Phases 0–5 ✅ shipped (April 2026). Phase 6 (docs/rollout) partial — staging flag + USER_GUIDE write-up still open.
**Effort:** High (6 phases total, ~8–10 weeks to full scope)
**Design:** `/root/.claude/plans/recursive-squishing-tower.md` (planning artifact) + this backlog section

### Why
The MCP server and Copilot Studio agent are currently read-only. Users asking the agent "start an estimate for Acme Corp — block of 120 hours" get routed back to the web UI. Adding a narrow, safe write surface unlocks conversational productivity for the highest-frequency consulting workflow: estimation.

### Phase 0 — Write Infrastructure ✅ COMPLETE (April 12, 2026)
- [x] `mcp_write_audit` table (tenant, user, endpoint, idempotency key, request hash, response body, resource, dry-run flag, correlation ID)
- [x] `mcpWriteGuard` middleware: `MCP_WRITES_ENABLED` feature flag, `X-Idempotency-Key` header requirement with replay-cache, request-hash conflict detection, `?dryRun=true` universal short-circuit, envelope wrapper (`idempotent`, `auditId`, `correlationId`, `dryRun`)
- [x] New `/server/routes/mcp-write.ts` module, `/mcp/v1/*` namespace registered in `server/routes.ts`
- [x] Write role constants stricter than read (admin, pm, portfolio-manager only — dropped executive and billing-admin for writes)
- [x] `POST /mcp/v1/ping` diagnostic endpoint for the full write stack
- [x] OpenAPI spec updated to v1.1.0 with write paths and `X-Idempotency-Key` header
- [x] `MCP_CONNECTOR_SETUP.md` — removed READ-ONLY language; added Part 4 (write activities) covering feature flag, idempotency, dry-run, envelope, role policy, canonical agent flow

### Phase 1 — Client Discovery ✅ COMPLETE (April 12, 2026)
- [x] `GET /mcp/clients?search=&limit=` — case-insensitive substring match on name + shortName
- [x] Linkage signals in response: `hasHubspotLink` (from `crm_object_mappings`), `hasTeamsLink` (from `client_teams` or legacy `clients.microsoftTeamId`), `activeEstimateCount` (draft/sent/approved estimates)
- [x] Scoped to caller's tenant, role-gated via `ESTIMATE_ROLES`

### Phase 2 — Client Creation ✅ COMPLETE (April 12, 2026)
- [x] `POST /mcp/v1/clients` with Zod validation, tenant from auth context (body `tenantId` ignored)
- [x] Near-match duplicate detection (normalize + substring + Levenshtein) against existing clients in tenant — returns 409 with candidates unless `force: true`
- [x] Shared `insertClientSchema` validation consistent with `/api/clients`

### Phase 3 — Estimate Creation (3 variants) ✅ COMPLETE
**Effort:** Medium (2–3 weeks)
- [x] `POST /mcp/v1/estimates/from-narrative` — AI-generated 3–8 summary line items (hard cap)
- [x] `POST /mcp/v1/estimates/block-hours` — single line item, blended rate via role catalog lookup
- [x] `POST /mcp/v1/estimates/fixed-price` — `estimateType: fixed`, one line per phase
- [x] Uses existing `aiService.generateEstimateFromNarrative()` in `server/services/ai-service.ts`
- [x] Pre-create duplicate check for active estimates on the same client (409 unless `force: true`)
- [x] `createEstimateCore()` helper in `server/routes/mcp-write.ts`
- [x] Prompt-injection sanitization on the `narrative` field (`sanitizeNarrative()`)

### Phase 4 — HubSpot Linkage ✅ COMPLETE
**Effort:** Small-Medium (1–2 weeks)
- [x] `GET /mcp/v1/hubspot/search?type=company|deal&query=`
- [x] `POST /mcp/v1/clients/:clientId/hubspot-link` with `createIfMissing` flag — writes `crm_object_mappings`, uses `createHubSpotDeal()` / `createHubSpotCompany()` from `hubspot-client.ts`

### Phase 5 — Teams Team + Channel Linkage ✅ COMPLETE
**Effort:** Medium (2 weeks)
- [x] `POST /mcp/v1/clients/:clientId/teams-link` — ensures `client_teams` row (creates team via Graph when `createIfMissing`)
- [x] `POST /mcp/v1/projects/:projectId/teams-channel` — ensures `project_channels` row via `plannerService.createChannel()`
- [x] Partial-failure envelope: `warnings[]` preserved; no rollback of prior successful steps

### Phase 6 — Docs, Agent Instructions, Rollout
- [x] OpenAPI spec updated for each phase (bumped to v1.2.0 for Phase 3-5)
- [x] Connector setup doc updated with write-flow agent instructions (Phase 0)
- [ ] `USER_GUIDE.md` — new "Conversational Estimate Creation" section (gated on Phase 3)
- [ ] Enable `MCP_WRITES_ENABLED=true` in staging for pilot tenant(s) after Phase 3

### Explicit Non-Goals for v1
Estimate approval/status transitions, invoice generation, line-item-level edits (would defeat the agent metaphor), project creation (use existing approve-estimate flow), user/role management, expense submission.

---

## ✅ Recently Completed (March 15, 2026)

### Teams Custom Tab Integration ✅ COMPLETE
- [x] Embed routes (`/embed/*`) with chromeless layout
- [x] Tab deep-linking via `?tab=` for all project tabs
- [x] Read-only enforcement — all mutating actions hidden in embed mode
- [x] Teams SSO authentication with popup sign-in flow
- [x] Configurable tab setup page and embed dashboard
- [x] Teams app manifest (`teams/manifest.json`)
- [x] Three-app Entra architecture (SCDP-Content, MCP Connector, Copilot Agent)

### Navigation Reorganization ✅ COMPLETE
- [x] Sub-group labels in sidebar (Daily Work, Time & Expenses, Tracking, etc.)
- [x] Disambiguated menu labels (Dashboard → My Dashboard, Time → Timesheets, etc.)
- [x] Mobile navigation updated to match desktop
- [x] Reordered items for better workflow grouping

### Theme System ✅ COMPLETE
- [x] Modular CSS variable-based theme architecture
- [x] Aurora theme (warm earth tones)
- [x] Night Sky theme (deep navy with star navigation)
- [x] Navigator's Chart theme (clean professional teal)
- [x] Theme integration guide at `docs/SYNOZUR_THEME_GUIDE.md`

---

## ✅ Previously Completed (March 10, 2026)

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
**Status:** 🟢 Phases 0–4 shipped — #1 user-requested feature (94 marketplace coins, Feb 2026 feedback)
**Effort:** Medium-High, phased (reduced from original 8-12 wks via QuickBooks MCP Bundle)
**Plan:** `docs/design/quickbooks-integration-plan.md` (reworked around the QuickBooks MCP Bundle, which removes the bespoke Intuit OAuth2/REST client work)

Approach: mirror the HubSpot integration pattern (per-tenant OAuth, `quickbooks_connections` / `quickbooks_entity_mappings` / `quickbooks_sync_log` tables, settings-page card, sync audit log). Reuse dormant plumbing (`invoice_batches.glInvoiceNumber/exportedToQBO`, `vendor_invoices.glBillNumber/exportedToQBO`).

- [x] **Phase 0 — Foundation:** OAuth + connection/mapping/log schema, settings card, token refresh, mapping manager (Customers/Items/Accounts), sandbox flag
- [x] **Phase 1 — Invoicing / A/R:** push finalized invoice batch → QBO Invoice (tax, currency, `billedAmount` w/ adjustments); write-back `glInvoiceNumber`/`exportedToQBO`; CDC payment-status pull-back; cancel-and-reissue void path. Manual `export-qbo-csv` kept as fallback
- [x] **Phase 2 — Contractor/Vendor A/P:** vendor match-or-create; push approved vendor & contractor invoices → QBO Bills; cancel/delete path. Activates dormant `glBillNumber` plumbing
- [x] **Phase 3 — Payroll GL:** finalized payroll run → QBO Journal Entry built from the existing payroll GL export (`buildGlExport`; accounts resolved by `AcctNum`); idempotent push + cancel. `POST /api/payroll/runs/:id/push-qbo` + `.../qbo-cancel`
- [x] **Phase 4 — In-app financial reports:** read-only A/R Aging, A/P Aging, and Profit & Loss surfaced on the QuickBooks settings card via `GET /api/accounting/quickbooks/reports/:name` + a pure `normalizeQboReport` flattener
- [x] Cross-cutting: idempotent create-or-update via mappings, 3100/403 sandbox-vs-prod error surfacing, sync log
- [ ] **Phase 4 (deferred):** in-app agentic assistant over MCP query/report tools; inbound QBO webhooks
- [ ] **Phase 3 (deferred):** 1099 contractor pay posted as Bills (vs. the current single summary Journal Entry)

Note: AP-side `glBillNumber` export (previously tracked at line 141 as a v2.6.x follow-up) was folded into Phase 2.

### Advanced Resource Management
**Status:** Complete — All 6 phases implemented (`docs/design/advanced-resource-management.md`)
**Effort:** High (~7-8 weeks, 6 phases)

- [x] Phase 1: Multi-role capability mapping & per-person capacity profiles
- [x] Phase 2: Planner sync protection for generic roles
- [x] Phase 3: Smart assignment suggestions with cost variance
- [x] Phase 4: Cross-project workload view & rebalancing dashboard
- [x] Phase 5: Capacity planning analytics & KPIs
- [x] Phase 6: Bulk import & polish

### Microsoft 365 Teams Integration
**Status:** Phase 2 substantially complete — webhooks, audit trail, project-create UI all shipped
**Effort:** Remaining: multitenant app registration (4-6 weeks), Teams Phase 3 SharePoint living updates (2-3 weeks), external-user UI (2 weeks)

- [x] Planner one-way sync ✅
- [x] Database schema for Teams/Channels/Planner ✅
- [x] Automatic Team creation for new clients ✅
- [x] Channel creation for subsequent projects ✅
- [x] SharePoint site provisioning with Team ✅ (Phase 2)
- [x] Team member management (add/remove from assignments) ✅ (Phase 2)
- [x] Guest user invitation workflows ✅ (Phase 2)
- [x] Automation audit logging ✅ (Phase 2)
- [x] Planner sync robustness: last-write-wins + admin alerts ✅ (Task #126, v2.5)
- [x] Planner Phase 2: Bidirectional sync via Graph webhooks ✅ (`planner-subscription-manager.ts` + `POST /api/webhooks/planner`; 4-hour renewal scheduler)
- [x] Planner Phase 2: Planner-to-Constellation change notifications ✅ (handled by webhook receiver, `webhook_received` audit events)
- [x] Project creation UI with M365 options ✅ (v2.5 — Teams channel picker, smart client-team detection, Planner toggle, auto-member & invite-guest options, non-blocking provisioning)
- [ ] Planner Phase 2: Multitenant app registration — schema exists (`tenantMicrosoftIntegrations` + `getCredentialsFromIntegration`) but not wired. Needs admin-consent flow, encrypted secret storage, tenant-scoped credential resolution through `planner-graph-client.ts`, and a Settings → Microsoft Integration UI
- [ ] Teams Phase 3: SharePoint Living Updates (on-demand + scheduled news posts)
- [ ] External-user UI & permissions: per-assignment "Not in Azure AD" badge with manual re-map, `userType` field on `users`, distinct external-collaborator permission tier (assigned-projects only)

### Codebase Modularization
**Status:** Planned — Pattern established with `platform.ts` extraction
**Effort:** Medium (4-6 weeks)

- [ ] Phase 1: Route extraction (13 domain modules from routes.ts)
- [ ] Phase 2: Storage layer extraction (8 domain modules from storage.ts)
- [ ] Phase 3: Shared middleware & utilities extraction

---

## 📊 P2 - IMPORTANT FEATURES

### Advanced Financial Reporting
**Status:** Partially complete — YoY, client filter, and SQL-aggregation rewrite done
**Effort:** Medium (4-6 weeks)

- [x] Year-over-year revenue analysis ✅
- [x] Client filter on reports ✅
- [x] Financial-comparison report SQL aggregation rewrite (Task #117, v2.5) ✅
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

### Notifications System ✅ COMPLETE
**Status:** Complete (May 2026, v2.5) — see "Recently Completed" above. Previously deprioritized; delivered ahead of plan.
**Effort:** Medium (4-6 weeks) — actual

- [x] In-app notification center (bell icon, dropdown, full page)
- [x] Email notifications via SendGrid (weekly digest with per-tenant schedule, open tracking)
- [x] User preferences with granular per-type controls
- [x] Browser push notifications (opt-in)
- [x] Notification hooks for time entry reminders, expense approvals, budget alerts, deadline reminders, sign-offs, RAIDD updates

**Future Enhancements (not yet started):**
- [ ] Admin-broadcast notifications (tenant-wide announcements)
- [ ] Mobile push notifications (native apps)
- [ ] SMS channel via Twilio

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

### Orphaned Invoice PDF File Cleanup (Task #22)
**Status:** Planned
**Effort:** Low (2-3 days)

Invoice PDF files stored in SharePoint/object storage are never removed when a batch is deleted, and the regeneration path silently swallows delete errors — leaving orphaned and duplicate files accumulating in storage indefinitely.

- [ ] Delete stored PDF automatically when a batch is deleted (hook into `deleteInvoiceBatch()`)
- [ ] Admin endpoint `POST /api/admin/purge-orphan-invoice-pdfs` with `?dryRun=true` support — lists all stored files, cross-references against live `pdfFileId` values, deletes unmatched, returns summary
- [ ] Harden the "delete old version before regenerate" step: replace silent catch with a logged warning (batchId + file ID) so storage failures are visible in production logs
- [ ] Run purge against production after deploy to clear pre-existing orphans

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
| P1 - High | 3 active items (QBO, Teams Phase 3 + Planner Phase 2 webhook/multitenant, Codebase Modularization) | 18-24 weeks |
| P2 - Important | 9 active items | 18-28 weeks |
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
- ✅ Galaxy Client Portal API (OAuth2, scoped tokens, signed webhooks, document streaming)
- ✅ Notifications System (bell, push, weekly digests, SendGrid open tracking)
- ✅ Multi-currency estimates and Sub-SOW propagation
- ✅ Excel-like time grid 2.0 with virtualisation and series drag-fill
- ✅ Estimate version history with snapshot restore
- ✅ Client portal approvals & sign-offs with audit log
- ✅ Payment milestone billing automation
- ✅ AI Project Manager Agent
- ✅ Planner sync LWW + admin alerts
