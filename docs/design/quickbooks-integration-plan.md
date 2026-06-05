# QuickBooks Online Integration Plan

**Status:** 🟢 Phases 0–4 implemented (A/R, A/P, Payroll GL, in-app reports)
**Priority:** P1 — #1 user-requested feature (94 marketplace coins, Feb 2026)
**Target:** Q2 2026 (phased)
**Owner:** TBD
**Last updated:** 2026-06-05

---

## 1. Executive summary

QuickBooks Online (QBO) is the top-ranked user request. The original backlog plan
assumed we would hand-roll the Intuit OAuth2 flow and a bespoke QBO REST client,
which drove an 8–12 week estimate. **The arrival of the QuickBooks MCP Bundle
changes the calculus**: it gives us a realm-scoped, read/write tool surface over
the full QBO entity model (Customer, Vendor, Invoice, Bill, Payment, Item,
Account, Employee, Estimate, plus batch, CDC, reports, PDF, attachments). That
both accelerates delivery and lets us design a *bidirectional, transaction-level*
integration instead of the one-way CSV/IIF export we ship today.

This plan covers three workstreams, in priority order:

1. **Invoicing (outbound A/R)** — push finalized invoice batches into QBO as real
   Invoices and pull payment status back. Replaces the manual `export-qbo-csv`
   download.
2. **Contractor payments (outbound A/P)** — push approved vendor/contractor
   invoices into QBO as Bills, and record Bill Payments. Activates the dormant
   `glBillNumber` / `exportedToQBO` plumbing.
3. **Payroll (GL sync)** — export each finalized payroll run to QBO as a Journal
   Entry (and 1099 contractor pay as Bills). Constellation keeps its in-house
   payroll engine; QBO becomes the book of record for the GL.

The integration reuses the **HubSpot integration pattern** (per-tenant OAuth,
`*_connections` / `*_entity_mappings` / `*_sync_log` tables, settings-page card,
token refresh, audit log) so it is consistent with how Constellation already does
third-party integrations.

---

## 2. What changed: MCP Bundles

The QuickBooks MCP Bundle exposes (per the domain skill):

- **Realm binding** — `realm_id` is bound on the connection and applied to every
  call; sandbox vs production is a connection flag. This removes a whole class of
  routing bugs (HTTP 403 / Intuit error 3100) we would otherwise have to handle.
- **SQL-like query** — `SELECT * FROM Invoice WHERE DueDate < '…' AND Balance > '0'`
  etc. (no OR/JOIN/GROUP BY). This is the read path for status reconciliation.
- **Reports** — ProfitAndLoss, AgedReceivables, AgedPayables, GeneralLedger, etc.
- **Upsert pattern** — create (omit `id`+`sync_token`) / update (supply both); a
  fresh `sync_token` is required for every update (optimistic concurrency).
- **Batch** — up to 30 mutating ops per round trip (ideal for multi-line invoice
  batches and bulk customer/item creation).
- **CDC** — "what changed since watermark T", the basis for pulling payment status
  and externally-edited records back without polling every entity.
- **PDF / Attachments / Void** — materialize invoice PDFs, attach receipts, and
  reverse transactions without deleting them (audit-friendly).

**Architectural consequence.** We no longer need to build and maintain an Intuit
REST client, query builder, retry/backoff layer, or PDF renderer for QBO. We
design our access layer to *mirror the MCP tool surface* (`query`, `report`,
`upsert`, `batch`, `cdc`, `pdf`). See §5 for how this binds to a multi-tenant SaaS.

---

## 3. Current state (what we already have)

| Area | Today | Reuse for QBO |
|------|-------|---------------|
| **Outbound invoicing** | `invoice_batches` (status `draft→reviewed→finalized`, `batchType` services/expenses/mixed, `invoicingMode` client/project, milestone-linked, multi-currency, tax) + `invoice_lines` (type `time/expense/milestone/discount/no-charge`, with `billedAmount` vs `originalAmount` and line/aggregate `invoice_adjustments`). `GET /api/invoice-batches/:id/export-qbo-csv` builds a 13-column CSV (Product/Service hierarchy `Project:Type:Category`, due date from `paymentTerms`, customer grouping) and sets `exportedToQBO=true`. Per-tenant GL numbering already exists: `tenants.nextGlInvoiceNumber` + `getAndIncrementGlInvoiceNumber()` → `invoice_batches.glInvoiceNumber`. | Replace CSV with API push; reuse the same Product/Service hierarchy as the QBO Item mapping. `glInvoiceNumber`, `exportedToQBO`, `exportedAt` already exist on `invoice_batches` — use them as the QBO write-back targets. Push `billedAmount` (post-adjustment), not `originalAmount`. |
| **Contractor / vendor A/P** | `vendor_invoices` (state machine `draft→extracted→in_review→reconciled→approved→posted→paid`) with AI extraction + reconciliation + `project_cost_postings`. `contractor_invoices` (`submitted→approved→paid`) from expense reports. Columns `glBillNumber`, `exportedToQBO`, `exportedAt` are **plumbed but not wired**. | Push approved vendor/contractor invoices as QBO **Bills**; record **BillPayments** when paid. Wire the dormant columns. |
| **Payroll** | Full in-house engine: `payroll_runs`/`payroll_run_items`, NACHA/ACH, W-2, 1099-NEC, tax e-file (EFW2, FIRE). | **Do not replace.** Export finalized runs to QBO as Journal Entries; 1099 contractor pay can alternatively flow as Bills. |
| **Integration pattern** | HubSpot: `crm_connections` / `crm_object_mappings` / `crm_sync_log`, per-tenant OAuth in JSONB `settings`, 5-min-buffer token refresh, signed OAuth state, settings-page card, `isEnabled` gating, `platformConfigured` env check. | Clone the entire pattern for QBO. |
| **People model** | Unified `users` table; contractors flagged via `payrollEmployeeType` (`w2`/`1099`), `contractorBusinessName`, etc. Clients are `clients`. | Clients → QBO Customer; 1099 contractors → QBO Vendor; W-2 staff → QBO Employee. |

**Key takeaway:** the data model is already shaped for this. The integration is
mostly *connecting* existing entities to QBO, not building new domain logic.

---

## 4. Goals & non-goals

### Goals
- Per-tenant, opt-in QBO connection (sandbox or production) with secure token storage.
- One-click push of a finalized invoice batch to QBO as a real Invoice, with
  idempotency (never create duplicates on re-push).
- Pull A/R payment status (Payment entity / Invoice.Balance) back into
  `invoice_batches.paymentStatus` via CDC.
- Push approved contractor/vendor invoices as QBO Bills; record payments.
- Export finalized payroll runs to QBO as Journal Entries.
- Mapping management UI for Customers, Vendors, Items, and Accounts.
- Full audit trail of every sync action and clear error surfacing/retry.

### Non-goals (v1)
- Replacing Constellation's payroll engine or tax filing with QuickBooks Payroll.
- Real-time webhooks (use CDC polling + on-demand sync first; webhooks are a
  later enhancement).
- Syncing QBO-native transactions that have no Constellation origin (we own the
  source of truth for our entities; QBO is downstream).
- Inventory / PurchaseOrder workflows (not part of the consulting model).

---

## 5. Architecture

### 5.1 Two access paths, one connection model

Constellation is a multi-tenant SaaS, so each tenant has its own QBO **realm**.
We store a per-tenant connection (mirroring HubSpot) and access QBO through an
abstraction (`server/services/quickbooks-client.ts`) whose method surface mirrors
the MCP tool set: `query()`, `report()`, `upsert()`, `batch()`, `cdc()`,
`pdf()`, `attach()`, `void()`.

That service can be backed two ways; the abstraction lets us start with one and
add the other without changing callers:

- **(A) Deterministic server-side sync (primary).** Background jobs and the
  "Push to QBO" buttons call the access layer for batch invoice/bill creation and
  CDC payment pulls. This must be reliable and idempotent, runs without a human in
  the loop, and is the right home for the realm-bound MCP connection per tenant.
- **(B) Agentic assistant (later, additive).** An in-app AI assistant uses the
  QuickBooks MCP Bundle directly for ad-hoc work — "which of my invoices are
  overdue?", "reconcile this odd bill", "show me this quarter's P&L" — leaning on
  the SQL query + report tools. This is high-value but should not gate the
  deterministic sync.

> **Decision needed (see §13):** confirm how the MCP Bundle realm connection is
> provisioned per tenant for path (A) vs. whether path (A) uses stored OAuth
> tokens against the Intuit API directly with the MCP surface as the design
> reference. Both are viable; the connection schema below supports either.

### 5.2 OAuth & token storage (mirror HubSpot)

- Platform-level `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` env vars; status endpoint
  reports `platformConfigured`.
- `GET /api/accounting/quickbooks/oauth/start` → Intuit authorization URL with
  signed state (HMAC-SHA256, short TTL, nonce) — same helper as HubSpot.
- `GET /api/accounting/quickbooks/oauth/callback` → exchange code, capture
  `realmId`, store tokens in `quickbooks_connections.settings` (JSONB), log event.
- Token refresh with a 5-minute expiry buffer, identical to
  `hubspot-client.ts:refreshTokenIfNeeded()`.
- `POST /api/accounting/quickbooks/oauth/disconnect` → revoke + clear tokens,
  preserve mappings/config.
- `sandbox` flag on the connection selects the Intuit host (prevents the
  3100 / 403 cross-environment error).

### 5.3 Idempotency & concurrency

- **No duplicates on re-push:** every Constellation entity maps to exactly one QBO
  entity via `quickbooks_entity_mappings`. Push = "create if no mapping, else
  update." Use the batch tool's per-op `bId` and store the returned QBO id +
  `sync_token` in the mapping row.
- **Stale token handling:** before any update, read the current entity (or use the
  cached `sync_token` from the last mapping write, refreshing on a 5xx/concurrency
  error). The MCP upsert requires a fresh `sync_token`.
- **Re-finalize / corrections:** today a batch cannot be unfinalized once
  `exportedToQBO=true`. With API push we relax this carefully: if a finalized
  batch needs correction after push, we **update** the existing QBO Invoice
  (matched via the mapping), or **void + recreate** if it's already paid in QBO.
  Voided-then-recreated transactions preserve the QBO audit trail. The
  unfinalize guard stays, but offers an "update in QuickBooks" path instead of a
  hard block.

---

## 6. Entity mapping reference

| Constellation | QBO entity | Direction | Notes |
|---------------|-----------|-----------|-------|
| `clients` | **Customer** | push, match-or-create | Match by name/email first; let admin link existing QBO Customer. |
| `users` (1099 contractor) | **Vendor** | push, match-or-create | Uses `contractorBusinessName`/billing fields. |
| `users` (W-2 staff) | **Employee** | optional | Only needed if payroll detail is mirrored; GL export does not require it. |
| Role / service `type` + expense category | **Item** (Service/Other) + **Account** | config | Admin maps each invoice-line type / expense category to a QBO Item & income/expense Account. Default mappings stored on the connection. |
| `invoice_batches` (finalized) | **Invoice** | push (A) + pull status | Lines from `invoice_lines`. Tax at batch level → QBO TxnTaxDetail. Currency from `quoteCurrency`. |
| `invoice_batches.paymentStatus` | **Payment** / Invoice.Balance | pull (CDC) | Map QBO balance → `unpaid/partial/paid`, set `paymentDate`/`paymentAmount`. |
| `vendor_invoices` (approved/posted) | **Bill** | push | Lines from `vendor_invoice_lines`; project → QBO Class/Customer for job costing. |
| `contractor_invoices` (approved) | **Bill** | push | From expense-report contractor invoices. |
| Bill payment (`paid`) | **BillPayment** | push | When Constellation marks a vendor/contractor invoice paid. |
| `payroll_runs` (finalized) | **JournalEntry** | push | Gross wages, employer taxes, net pay, withholdings to mapped GL accounts. |
| project | QBO **Class** or sub-Customer | config | For per-project P&L in QBO (optional but recommended). |

---

## 7. Workflow designs

### 7.1 Invoicing (A/R) — primary

**Push.** On a `finalized` batch, the "Push to QuickBooks" action (replacing the
CSV download, which we keep as a fallback):

1. Ensure the Customer mapping exists (match-or-create QBO Customer for the
   batch's client).
2. Ensure Item/Account mappings exist for each line `type`.
3. Build one QBO Invoice with lines from `invoice_lines` (using `billedAmount`
   so line/aggregate adjustments are reflected), batch-level tax, payment terms,
   service dates, and currency. Reuse the existing `Project:Type:Category`
   Product/Service hierarchy and `glInvoiceNumber` (from
   `getAndIncrementGlInvoiceNumber()`) as the QBO DocNumber. Use the **batch
   tool** for the create.
4. Store QBO Invoice id in `invoice_batches.glInvoiceNumber`, set
   `exportedToQBO=true`, `exportedAt=now()`, write a `quickbooks_sync_log` row,
   and record the mapping (+`sync_token`).
5. Optionally pull the QBO-rendered **PDF** and attach to the batch.

**Pull (status).** A scheduled job runs **CDC** since the last watermark and, for
Invoices we own (present in mappings), reads `Balance`/linked Payments to update
`invoice_batches.paymentStatus` / `paymentDate` / `paymentAmount`. Gives users
"paid in QuickBooks" status without leaving Constellation.

### 7.2 Contractor payments (A/P)

Activates the dormant `glBillNumber` / `exportedToQBO` columns on `vendor_invoices`.

1. When a `vendor_invoice` reaches `approved`/`posted` (or a `contractor_invoice`
   reaches `approved`), enable "Push to QuickBooks as Bill."
2. Match-or-create the QBO **Vendor**; create a **Bill** with lines from
   `vendor_invoice_lines` (service vs. expense kind → Item/Account), project →
   Class/Customer for job costing, currency/exchange-rate carried over.
3. Store QBO Bill id in `vendor_invoices.glBillNumber`, set `exportedToQBO`,
   `exportedAt`, log + map.
4. When Constellation marks the invoice `paid`, create a QBO **BillPayment** linked
   to the Bill (from the mapped bank/clearing Account).

Because our reconciliation engine already back-fills `actualCostAmount` and
`project_cost_postings`, the QBO Bills carry accurate job-costed amounts.

### 7.3 Payroll (GL sync)

Constellation keeps owning payroll computation, NACHA, and tax forms. QBO receives
the **accounting impact** only:

1. On `payroll_runs.status = finalized`, build a **JournalEntry**: debit
   wage/employer-tax expense accounts, credit liabilities (taxes withheld,
   net-pay/bank clearing). Per-run totals come from `payroll_runs`
   (`totalGrossCents`, `totalEmployerTaxCents`, `totalNetCents`, …).
2. Map each component to a GL Account via the connection's payroll account map.
3. 1099 contractor pay (employeeType `1099`) may alternatively be pushed as
   **Bills/BillPayments** to the contractor's Vendor record, so it appears on the
   1099 in QBO. (Admin chooses per-tenant: Journal Entry vs. Bills.)
4. Store the JournalEntry/Bill id, log + map; expense reimbursements already
   itemized in `payroll_reimbursement_lines` map to the reimbursement Account.

> Payroll GL sync is **Phase 3** — sequenced last because the in-house engine
> already produces compliant outputs, so this is a convenience/bookkeeping layer.

**Implemented (Phase 3).** A finalized run posts as a single summary
**JournalEntry** via `POST /api/payroll/runs/:id/push-qbo`. Rather than a separate
payroll account map, it **reuses the existing payroll GL system** — the per-tenant
GL chart of accounts (`payroll_gl_accounts`) and category mappings
(`payroll_gl_mappings`) that already back the GL CSV export. The shared
`payrollStorage.buildGlExport` builder emits balanced debit/credit lines keyed by
payroll GL account number; the push resolves each number to a QBO Account by
`AcctNum`, so the operator aligns numbers once. The push is idempotent (one
`payroll_run` → `JournalEntry` mapping); `POST .../qbo-cancel` deletes the entry
and releases the mapping for re-push. The 1099-as-Bills option remains deferred.

### 7.4 In-app financial reports (Phase 4)

Read-only QBO reports surfaced inside Constellation so admins/executives see live
financials without leaving the app: **A/R Aging Summary** (`AgedReceivables`),
**A/P Aging Summary** (`AgedPayables`), and **Profit & Loss** (`ProfitAndLoss`).
`GET /api/accounting/quickbooks/reports/:name` fetches the Intuit report (passing
`start_date`/`end_date` through for dated reports) and a pure `normalizeQboReport`
helper flattens Intuit's nested Rows/Sections tree into a render-ready table
(columns + flat rows with depth + row kind). The QuickBooks card on the
Organization Settings page renders the result. The "agentic assistant over MCP
query tools" and inbound webhooks from §12 remain deferred.

---

## 8. Database schema additions

New tables (clone of the HubSpot trio; `shared/schema.ts`):

```ts
// Per-tenant QBO connection (one realm per tenant per environment)
quickbooks_connections {
  id, tenantId (unique with environment), realmId,
  sandbox: boolean default false,
  isEnabled: boolean default false,
  syncDirection: 'push' | 'bidirectional' default 'bidirectional',
  settings: jsonb,            // { accessToken, refreshToken, expiresAt, defaultAccounts, defaultItems, classMode, payrollAccountMap, ... }
  cdcWatermark: timestamp,    // last CDC pull time for status sync
  lastSyncAt, lastSyncStatus, lastSyncError,
  createdAt, updatedAt
}

// Constellation entity <-> QBO entity link (idempotency backbone)
quickbooks_entity_mappings {
  id, tenantId,
  localObjectType,  // 'client' | 'vendor_user' | 'invoice_batch' | 'vendor_invoice' | 'contractor_invoice' | 'payroll_run' | 'item' | 'account'
  localObjectId,
  qboObjectType,    // 'Customer' | 'Vendor' | 'Invoice' | 'Bill' | 'BillPayment' | 'JournalEntry' | 'Item' | 'Account' | 'Payment'
  qboObjectId,
  qboSyncToken,     // cached optimistic-concurrency token
  lastSyncedHash,   // detect local changes that need a re-push
  metadata: jsonb,
  lastSyncAt, createdAt
  // unique (tenantId, localObjectType, localObjectId)
  // unique (tenantId, qboObjectType, qboObjectId)
}

// Audit trail of every sync action
quickbooks_sync_log {
  id, tenantId, action, status,           // 'success' | 'error'
  localObjectType, localObjectId,
  qboObjectType, qboObjectId,
  requestPayload: jsonb, responseSummary, errorDetail,
  createdAt
}
```

**Reused existing columns (no migration needed):**
`invoice_batches.glInvoiceNumber`, `invoice_batches.exportedToQBO`,
`invoice_batches.exportedAt`; `vendor_invoices.glBillNumber`,
`vendor_invoices.exportedToQBO`, `vendor_invoices.exportedAt`.

---

## 9. API surface (mirror `routes/hubspot.ts`)

```
GET    /api/accounting/quickbooks/status
GET    /api/accounting/quickbooks/oauth/start
GET    /api/accounting/quickbooks/oauth/callback
POST   /api/accounting/quickbooks/oauth/disconnect
PUT    /api/accounting/quickbooks/connection          // settings: enable, sandbox, default accounts/items, class mode, payroll map
GET    /api/accounting/quickbooks/customers           // search QBO Customers (for linking)
GET    /api/accounting/quickbooks/vendors
GET    /api/accounting/quickbooks/items
GET    /api/accounting/quickbooks/accounts
GET    /api/accounting/quickbooks/mappings?type=...
POST   /api/accounting/quickbooks/clients/:id/link     // link/create Customer
POST   /api/accounting/quickbooks/vendors/:userId/link
POST   /api/invoice-batches/:batchId/push-qbo          // A/R push (replaces CSV as primary)
POST   /api/vendor-invoices/:id/push-qbo               // A/P Bill push
POST   /api/contractor-invoices/:id/push-qbo
POST   /api/payroll/runs/:id/push-qbo                  // Journal Entry from GL export (Phase 3)
POST   /api/payroll/runs/:id/qbo-cancel                // delete Journal Entry, release mapping (Phase 3)
GET    /api/accounting/quickbooks/reports/:name        // aged-receivables | aged-payables | profit-and-loss (Phase 4)
POST   /api/accounting/quickbooks/sync/payments        // CDC pull of A/R status (also scheduled)
GET    /api/accounting/quickbooks/sync-log?limit=50
```

All write routes gated by `requireRole(["admin","billing-admin"])` (payroll GL and
reports also allow `executive`) and an `isEnabled` connection check, matching
existing billing/CRM routes.

---

## 10. UI

- **Organization Settings → Integrations:** a "QuickBooks Online" card mirroring
  the HubSpot card — connect/disconnect, sandbox toggle, enable switch, default
  Account/Item mappings, project→Class toggle, payroll account map, last-sync
  status/error.
- **Mapping manager:** tabbed Customers / Vendors / Items / Accounts with
  match-or-create + manual link, like the CRM mapping views.
- **Billing page:** "Push to QuickBooks" button on finalized batches (CSV export
  retained as fallback); badge showing `exportedToQBO` + QBO invoice # +
  paid-in-QBO status.
- **Vendor Invoices inbox:** "Push to QuickBooks as Bill" on approved/posted
  invoices; QBO bill # badge.
- **Sync dashboard:** recent `quickbooks_sync_log` entries with error detail and
  one-click retry.

---

## 11. Sync, dedup & error strategy

- **Idempotent pushes** via `quickbooks_entity_mappings` (create-or-update).
- **Batch tool** for multi-line invoices and bulk customer/item provisioning
  (≤30 ops/round trip).
- **CDC** with a stored `cdcWatermark` for status pull-back; scheduled job slots
  into the existing scheduled-jobs framework (alongside Planner sync / reminders).
- **Retry** with exponential backoff on 5xx and Intuit throttle (429); surface
  3100/403 as a clear "wrong environment (sandbox vs production)" message.
- **Void over delete** for corrections, preserving audit trail.
- Every action writes `quickbooks_sync_log`; `lastSyncStatus`/`lastSyncError` on
  the connection drive the settings-card health badge.

---

## 12. Phasing & timeline

| Phase | Scope | Est. | Outcome | Status |
|-------|-------|------|---------|--------|
| **0 — Foundation** | OAuth + connection/mapping/log schema, settings card, token refresh, mapping manager (Customers/Items/Accounts) | ~2 wks | Tenants can connect a realm and map entities. | ✅ Shipped |
| **1 — Invoicing (A/R)** | Push finalized batch → QBO Invoice (batch tool, tax, currency); write-back ids; CDC payment status pull; PDF attach | ~2–3 wks | One-click invoice sync + paid status. Headline value. | ✅ Shipped |
| **2 — Contractor/Vendor A/P** | Vendor match-or-create; push approved vendor/contractor invoices → Bills; BillPayments on paid | ~2 wks | Activates dormant A/P plumbing end-to-end. | ✅ Shipped |
| **3 — Payroll GL** | Finalized run → JournalEntry; 1099 → Bills option; payroll account map | ~1–2 wks | QBO is the GL book of record. | ✅ Shipped (Journal Entry; 1099-as-Bills deferred) |
| **4 — Agentic + reports (additive)** | In-app assistant over MCP query/report tools; AgedReceivables/Payables, P&L surfaced in-app; optional webhooks | ~2 wks | Ad-hoc Q&A and live financials. | 🟡 Reports shipped; assistant/webhooks deferred |

Because the MCP Bundle removes the bespoke-client work, total is meaningfully
below the original 8–12 week estimate; Phases 0–2 (the requested core) land first
and are independently shippable.

---

## 13. Open questions / decisions needed

1. **MCP realm provisioning for server-side sync (§5.1):** per-tenant MCP
   connection vs. stored-token direct Intuit calls with MCP as the design
   reference? Affects how Phase 0 OAuth is wired.
2. **Class vs. sub-Customer for project-level P&L** in QBO — recommend Class;
   confirm tenant accounting conventions.
3. **Tax handling:** map our batch-level `taxRate`/`taxAmount` to QBO automated
   sales tax vs. a manual tax line? (Automated tax may override our number.)
4. **Payroll posting style per tenant:** single summary JournalEntry per run vs.
   per-employee detail; 1099 as Journal vs. Bills.
5. **Multi-currency:** confirm tenants' QBO Home Currency handling vs. our
   `quoteCurrency`/`exchangeRate` snapshots.
6. **Conflict policy** when a QBO record we own is edited directly in QBO (CDC
   detects it) — overwrite, warn, or skip?

---

## 14. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Duplicate transactions on re-push | Mapping table + create-or-update; batch `bId`. |
| Sandbox/production mismatch (3100/403) | Explicit `sandbox` flag; clear error mapping. |
| Stale `sync_token` on updates | Cache token in mapping; refresh-and-retry on concurrency error. |
| Intuit rate limits | Batch tool, backoff, scheduled (not per-request) status sync. |
| Tax/currency rounding mismatches vs. our PDF | Reconciliation report comparing batch totals to QBO Invoice totals; surface variances. |
| Over-scoping payroll | Keep in-house engine; QBO is GL-only, sequenced last. |

---

## 15. Backlog / roadmap updates

- `backlog.md` → update the "QuickBooks Online Integration" P1 item to reference
  this plan, MCP-Bundle-based approach, and the phased breakdown.
- `docs/ROADMAP.md` → keep Q2 2026 target; note reduced effort due to MCP Bundle.
- On ship, add `docs/CHANGELOG.md` entries per phase and a User Guide section under
  Invoicing / Expenses / Integrations.
