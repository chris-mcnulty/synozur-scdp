# Constellation (SCDP): A Reference Architecture for Building on Microsoft

*Tech Kon 365 — Seattle*
*Companion source document for slide generation. Each top-level section is a candidate slide or slide group; bullets are candidate talking points. Written to be fed to an AI agent building the deck.*

---

## What Constellation Is (the 60-second version)

Constellation — internally the **Synozur Consulting Delivery Platform (SCDP)** — is a multi-tenant SaaS platform that runs the entire lifecycle of a consulting engagement: estimation, resource allocation, time tracking, expense management, and automated invoice generation, plus governance, deliverable tracking, and AI-generated status reporting. One system carries a project from the first estimate to the final invoice.

It is built as a modern web application — React + TypeScript on the front end, Node.js + Express + TypeScript on the back end, Drizzle ORM over PostgreSQL (Neon), Zod for validation, Puppeteer for PDF. What makes it a good teaching example for this session is not the feature list; it's that **almost every architectural decision leans on a Microsoft design principle** — identity through Entra ID, storage through SharePoint Embedded, collaboration through Teams and Planner, and AI through Azure AI Foundry — while keeping strict multi-tenant isolation and a clean separation between the application and the platform underneath it.

**The thesis for the talk:** this session teaches *engineering quality patterns* — not a product pitch. Constellation is the running worked example (with **Zenith** cited where it demonstrates a pattern more completely, e.g. per-tenant encryption), and the recurring lesson is the same: you get further, faster, and more securely by building *on* the Microsoft cloud's identity, storage, and collaboration primitives — and on disciplined patterns like tenant isolation, common modules, and metered dependencies — than by reinventing them.

---

# Part 1 — Platform Architecture (the layers underneath every feature)

## 1. Authentication

Authentication is deliberately dual-mode, and both modes lead to the same session model.

- **Production: Microsoft Entra ID (Azure AD) single sign-on.** Sign-in uses MSAL (`@azure/msal-node`) with a **certificate-first** credential model (falling back to a client secret), against the multi-tenant `login.microsoftonline.com/common` authority so users from *any* organization can sign in. The OAuth authorization-code flow returns to a single callback that establishes the session.
- **Development: local email/password.** Passwords are bcrypt-hashed; a small dev-only credential list is gated strictly to non-production. This lets the team build without standing up Entra for every environment.
- **Just-in-time provisioning.** On first SSO login, if the user doesn't exist yet, Constellation creates the user *and* resolves (or creates) their tenant automatically — matching first by the Azure tenant ID on the token, then by email domain, then by a default tenant. The first user into a brand-new tenant becomes its admin.
- **Sessions are DB-backed and identity-anchored.** Rather than a stock cookie library, Constellation uses a custom, PostgreSQL-backed session store keyed by a per-session UUID, with a short-lived in-memory cache in front for speed. Regular sessions last 48 hours; SSO sessions 72, with sliding expiry and refresh-token handling so long-lived Entra sessions stay valid.
- **Roles: a six-tier tenant hierarchy plus a platform tier.** Inside a tenant, permissions escalate through **Employee → Project Manager → Portfolio Manager → Billing Administrator → Executive → Administrator**, each inheriting the tier below. Above the tenants sit **platform roles** — `constellation_consultant`, `constellation_admin`, and `global_admin` — for cross-tenant operations (see User Federation). Authorization is enforced at the route with `requireAuth`, `requireRole`, and `requirePlatformAdmin` guards.

## 2. Multi-Tenancy

Multi-tenancy is the backbone; every other decision is downstream of it.

- **UUID tenants, one row per organization.** A `tenants` table (UUID primary keys) holds each org's identity, branding, allowed email domains, Azure tenant ID, service plan, and settings. Nearly every domain table — clients, projects, estimates, time entries, expenses — carries a `tenantId` and is indexed on it.
- **Tenant resolution on the way in.** A request's tenant is resolved from the authenticated session, and at provisioning time from a clear priority order: **Azure tenant ID → email domain → default tenant.** This is what makes "the right data for the right org" automatic rather than manual.
- **Tenant-specific branding, settings, and vocabulary.** Each tenant can override colors, logos, fonts, and report headers, and — distinctively — its **vocabulary**: the platform's terms for Epic, Stage, Workstream, Milestone, and Activity are configurable per tenant (and can be further overridden per client or per project), so the software speaks each firm's language.
- **Tenant switching without re-login.** A user who belongs to more than one tenant can switch the active tenant on their session; membership is verified before the switch.

## 3. User Federation (one identity, many tenants) — and how the boundary is protected

This is the layer that most directly reflects a Microsoft design principle: **one person, one identity, many contexts.**

- **A single global `users` table — no separate "client contacts."** The same identity can be an *employee* in one tenant and a *client stakeholder* in another. Cross-tenant participation is expressed through a `tenant_users` join table (per-tenant role, status, and optional link to a specific client), not by duplicating the person. A `consultant_access` table additionally lets Synozur consultants hold time-boxed, audited roles inside customer tenants.
- **Auto-assignment on login.** Every login reconciles the user's tenant memberships — creating or reactivating the join row as needed — so access follows identity automatically.

**Protecting the boundary — the security-separation pattern (the quality-pattern teaching moment).** The principle to teach here is that tenant isolation is designed in *layers*, and the strongest teams push it all the way to **cryptographic** separation, not just logical separation:

- **Cryptographic per-tenant separation (the gold-standard pattern).** In our **Zenith** platform we implement this directly: **each tenant's data is separately encrypted**, so that even at the storage layer one tenant's information cannot be read with another tenant's keys. Separate encryption per tenant turns "we filter by tenant" into "we *cannot* return another tenant's data even by mistake" — the isolation is enforced by cryptography, not just by correct code. This is the pattern to hold up as the bar to aim for.
- **Per-tenant Microsoft identity isolation for content.** A second, complementary form of cryptographic separation: file operations for a customer run through *that customer's own Azure tenant*, using a separate, per-tenant Entra application context and tenant-scoped tokens, so documents live inside the customer's own Microsoft boundary rather than commingled in a shared bucket. (Detail in Part 2 §2.) In Constellation this is the primary per-tenant cryptographic boundary today.
- **Tenant-scoped data access as a standing rule.** Underneath the crypto, every domain table carries a `tenantId`, and data access is designed to always filter by the active tenant so a query only ever returns the current tenant's rows — the tenant is resolved once from the request, then every read and write is scoped to it.
- **Envelope encryption for the most sensitive fields.** Sensitive personal data (e.g., government IDs and bank account numbers) is encrypted at the application layer with **AES-256-GCM** envelope encryption, using a versioned ciphertext format explicitly designed so the platform can rotate to **per-tenant data keys or KMS-backed envelopes** without a destructive migration — the migration path from "encrypt the sensitive fields" toward the full per-tenant-key pattern Zenith already demonstrates.

> **Quality-pattern note for the deck:** frame this as a spectrum the audience can place their own systems on — *logical isolation (filter by tenant) → per-tenant identity/content boundary → per-tenant data encryption keys*. Zenith is the example of the far end (separate encryption per tenant); Constellation shows the content-layer boundary in production plus a versioned encryption format on the path to per-tenant data keys. The teaching point is the pattern, not any one product.

## 4. The Common Access Layer (tenant-scoped by design)

- Application data flows through a shared storage/service layer rather than scattered raw queries. The design principle is that **the tenant is resolved once, from the request, and then every query is scoped to it** — so "only queries that carry a tenant return data" is the rule the layer is built to enforce.
- This gives one place to reason about isolation, caching (tenant and settings lookups are cached with short TTLs), and consistency, instead of trusting every endpoint to remember the rule on its own.
- *(Accuracy note for the presenter: today this scoping is a strong convention applied per query rather than a single hard-enforced choke point — tightening it into a centrally-enforced guarantee, e.g. via PostgreSQL Row-Level Security, is a natural next step and a good "principle vs. practice" teaching moment.)*

## 5. Common Modules — Define the Shell Once (Branding & Navigation)

A quality pattern that shows up everywhere in the client: **the application shell — branding, navigation, and shared behavior — is defined in common modules and composed once, so every page inherits it instead of rebuilding it.**

- **One shared layout shell.** A single `Layout` wrapper composes the global chrome — the top app bar (`Header`), the primary navigation (`Sidebar`), the ambient branded background, and cross-cutting overlays (help chat, notifications, plan-status banner). Pages render *inside* the shell; they don't each assemble their own header and nav.
- **One app bar.** The `Header` is the single global top bar: cross-app launcher, brand logo, global search, tenant switcher, notification bell, "Ask Constellation" help, theme toggle, and the user/identity block — defined once, present everywhere.
- **Role-adaptive navigation from reusable primitives.** The `Sidebar` is built from small reusable pieces (a nav item, a collapsible section) and grouped into sections (My Workspace, Portfolio, Financial, Administration, Platform…). Items self-hide based on the user's role via a shared `useAuth` hook (`hasAnyRole`, `isPlatformAdmin`), and the open section follows the current route — so one nav definition serves every role, showing each user only what they can use.
- **Branding as design tokens in one place.** Colors, fonts (Avenir Next LT Pro), radius, and shadows live as CSS custom properties in a single theme file (the "Aurora" design system), which Tailwind consumes app-wide. Change the token, change the whole app. A light/dark theme provider toggles mode; the branded background renders once in the shell.
- **Shared primitives, one API client, one label layer.** A centralized UI component library (buttons, dialogs, tables, tabs — shadcn/Radix) gives every screen the same look and behavior; a single data-fetching client (`queryClient` / `apiRequest`) standardizes API access and session handling; a **vocabulary provider** supplies each tenant's own terminology (its words for Epic, Stage, Activity…) as a reusable layer distinct from visual branding; and reusable route guards (`PermissionGuard`, `PlatformAdminGuard`) enforce access consistently, mirroring the sidebar's role checks.
- **The chromeless variant reuses the same foundation.** The Teams/embed experience swaps the full shell for a stripped `EmbedLayout` but reuses the *same* design tokens, UI primitives, and data client — so "embedded in Teams" is a different frame around the same common modules, not a fork.

> **Quality-pattern note for the deck (an honest one):** common modules are a discipline you have to *hold*, and even good codebases drift. Here, the design tokens, UI library, and layout shell are genuinely define-once — but the nav **menu** is currently re-declared in three parallel places (desktop sidebar, mobile drawer, embed drawer) rather than driven from one shared menu config. That's a perfect teaching slide: the pattern is "one source of truth for navigation," the reality is "three copies that must be kept in sync," and the fix is to lift the menu into a single data structure all three render. Principle vs. practice, shown live.

## 6. Health, Support, and Documentation — Built Into the Product

A platform principle worth calling out: **operability and self-service are features, shipped inside the app, from the start.**

- **Health.** Lightweight `/healthz` and `/ready` probes answer even if the main app fails to boot (so deployment platforms can gate traffic), plus a deeper `/api/health` that actually tests the database and reports whether Entra and SharePoint are reachable. A dedicated **Agent Card health monitor** polls the AI-agent endpoint on a schedule and emails platform admins on failure.
- **Support.** A full in-app **support ticketing system**: users file tickets (with categories and priorities), get branded email confirmations, and admins manage and reply — all inside Constellation. A floating **"Ask Constellation" help chat** uses AI to answer questions and can even draft a support ticket for the user to review and submit. Tickets can optionally mirror into **Microsoft Planner** so support work lands in the team's existing task board, and closing the ticket completes the Planner task.
- **User documentation.** The user guide, roadmap, and changelog ship as living Markdown rendered by in-app viewer pages (`/user-guide`, `/roadmap`, `/changelog`), so help travels with the product and is versioned alongside it — not parked on a separate site that drifts out of date.

## 7. Service Plans — Feature Levels From Day One

- Constellation models **service plans** as first-class data: plan types (`trial`, `team`, `enterprise`, `unlimited`), quantitative limits (max users, projects, clients), trial durations and internal pricing, and feature switches (AI, SharePoint, SSO, custom/co-branding, subdomain, Planner).
- Every tenant references a plan and carries a plan **status** (`active`, `trial`, `expired`, `cancelled`, `suspended`) and expiry. A daily job ages tenants past a **14-day grace period** into `expired`, and middleware enforces status at runtime — an expired tenant drops to **read-only** rather than going dark, so customers never lose access to their own data.
- The design intent is to **decide feature tiers up front** and let the plan drive what a tenant can do, so packaging and monetization are architectural, not a later retrofit. *(Presenter note: plan status is hard-enforced today; the individual per-feature switches are stored and surfaced but not yet all hard-gated server-side — another honest "principle maturing into practice" example.)*

## 8. Other Platform Capabilities Worth Naming

- **Read-only API for AI agents (MCP server).** ~24 GET endpoints under `/mcp` expose the user's own data — assignments, time, expenses, projects, portfolio, financials, CRM — to M365 Copilot and Copilot Studio, always through the same identity, tenant, and role checks as the web app. A separate, audited write surface is scaffolded behind its own guard.
- **Agent-to-Agent (A2A) agent card.** Constellation publishes a standards-style agent card at `/.well-known/agent.json` so other agents (notably Copilot Studio) can discover and connect to it.
- **Scheduled jobs.** A dozen fault-isolated background jobs handle timesheet/expense reminders, Planner sync and subscription renewal, plan expiration, budget and Teams alerts, weekly digests, and job pruning — with an in-app monitor.
- **AI usage metering.** Every AI call is logged with provider, model, tokens, estimated cost, and latency; monthly token budgets trigger threshold alerts. Cost governance is built in, not guessed at.
- **PDF generation, audit trails, and immutable history.** Puppeteer renders invoices and tax forms; append-only audit logs (payroll, Planner sync, estimate version snapshots, budget history) give a defensible record of what changed and when.

---

# Part 2 — Microsoft Integration (a section per surface)

*A framing note for the deck: these integrations do not share one generic "Graph connection." Constellation deliberately uses the **right identity model for each surface** — delegated multi-tenant sign-in for people, app-only credentials for content and tasks, per-tenant apps for isolation. That precision is itself a Microsoft design principle.*

## 2.1 Microsoft Entra ID — Identity as the Foundation

Entra ID is the front door and the trust anchor for everything else.

- **Two MSAL contexts, on purpose.** A **delegated** context on the `common` authority lets any organization's users sign in; an **app-only (client-credentials)** context, pinned to a real tenant, powers background service calls. Certificate auth is preferred over secrets.
- **Per-tenant application isolation.** Constellation builds and caches a **separate confidential-client application per customer Azure tenant**, so file and Graph operations execute inside that customer's own directory boundary — the mechanism behind the content-layer security separation.
- **Consent captured up front.** Sign-in requests the scopes the platform will need later (including `Calendars.Read`) so the refresh token can mint downstream tokens without re-prompting.
- **A deliberate multi-app Entra design.** Distinct app registrations separate concerns — a content/SSO app, an MCP connector app, and a Copilot Studio agent app — rather than overloading one registration with every permission.
- **Key concept for the slide:** identity is not a login screen; it's the isolation boundary. Getting Entra right is what makes the rest of the architecture safe.

## 2.2 SharePoint Embedded — Content Storage That Protects the Security Boundary

This is the integration that best demonstrates "build on Microsoft to inherit its security model."

- **What it is.** SharePoint Embedded (SPE) gives the app enterprise-grade, Microsoft-hosted document storage via Graph's **FileStorage Containers** API — the compliance, security, and durability of SharePoint without a SharePoint site UI. Constellation stores SOWs, contracts, receipts, invoices, and reports here, foldered by document type, with rich SharePoint column **metadata** (client, project, amount, document type) for retrieval.
- **Why it matters for security boundaries (the key point).** Each tenant's files live in a **container provisioned in — and accessed through — that customer's own Azure tenant**, using per-tenant tokens. Data is isolated inside the customer's Microsoft boundary rather than commingled in shared app storage. This is real per-customer cryptographic and administrative separation, inherited from Microsoft rather than hand-built.
- **A tenant opt-in with a smart fallback.** A `speStorageEnabled` flag turns SPE on per tenant; a **smart storage router** then directs each file to the right backend (SPE for business documents; a legacy object/local store for certain receipts or dev environments) and reads back transparently, so the app works the same regardless of where a file physically lives.
- **Billing stays with Synozur.** Container-type registration in the consuming tenant is what makes uploads work, and the SPE billing model routes consumption to the owning (Synozur) app — customers get isolation without a SharePoint bill.
- **Highlights:** Graph container/drive API; chunked resumable uploads for large files; per-document-type foldering; metadata schema for search; direct Graph downloads for reliable receipt/invoice retrieval; admin container-management UI.

## 2.3 SharePoint (Sites) — Team-Linked Document Libraries

- Distinct from SPE, Constellation also uses **classic SharePoint sites** that Microsoft auto-provisions behind every Team/Group: it resolves the site for a Team and provisions **channel document-library folders** so project files have a home inside the collaboration space the team already uses.
- Key concept: use the SharePoint that *comes with Teams* for collaboration surfaces, and SPE for the app's system-of-record storage — right tool, right job.

## 2.4 Microsoft Teams — Meeting Users Where They Work

- **Embedded project tabs (Custom Tab).** Project detail pages embed directly in Teams at `/embed/projects/:id` in a **chromeless** layout — no sidebar or top nav, just the project content — so teams work inside Teams. The embedded view is read-only; mutating actions link back to the full app.
- **Teams SDK v2 SSO, verified server-side.** The tab uses the Teams JS SDK to obtain a silent SSO token, which the server **cryptographically verifies** (JWKS signature, audience, and issuer checks) before minting a Constellation session — theme (light/dark/contrast) follows the Teams client automatically.
- **Provisioning and publishing.** Constellation can create Teams and channels for a project, and builds/serves its own **Teams app package** (manifest, icons) and publishes it to the org app catalog via Graph, with a token-acquisition ladder that degrades gracefully across credential types.
- **Conversational access.** A **Constellation Copilot Agent** (see §2.8) lets users query project data in natural language right inside Teams.
- Key concept: embed, don't redirect — and let Microsoft's identity carry through the embed.

## 2.5 Microsoft Planner — Bidirectional Task Sync

- **What maps to what.** A **project** becomes a Planner **plan**; project **stages** become **buckets**; each resource **allocation** becomes a **task** (titled by role/workstream, with a deep link back into Constellation, hours, and role in the notes). Assignees are resolved from email to Azure user and can be auto-added to the group.
- **Truly bidirectional.** Outbound changes push on a schedule; inbound changes arrive via Graph **change subscriptions (webhooks)**. A **field ownership whitelist** decides direction: Constellation-owned fields (roles, people, hours, rates) are never overwritten from Planner, while Planner-owned fields (percent-complete ↔ status, start/due dates) sync back. Conflicts resolve **last-write-wins** by timestamp, behind a per-tenant rollout flag; failing connections auto-suspend.
- **Flexible credentials.** Sync can run on a shared publisher app or on a tenant's **own** Entra app ("bring your own app"), so customers can keep the integration inside their directory.
- Key concept: real two-way sync needs an ownership model, not just a copy — decide who owns each field before you sync it.

## 2.6 Outlook / Calendar — Reading Signals, Not Sending Mail

- **What Graph/Outlook does here: reads the user's calendar.** Using the user's **delegated** SSO refresh token, Constellation requests a `Calendars.Read` token and pulls the user's own calendar view to **suggest time entries from meetings** — each user sees only their own calendar, isolated per user.
- **What sends the email is a dedicated email service.** Approvals, reminders, support confirmations, and budget/AI-usage alerts are delivered through Constellation's transactional email service (with a delivery webhook), *not* through Graph `sendMail`.
- Key concept (and an honest one for the talk): integrate for the **signal you actually need** — here, calendar context to reduce data entry — and don't over-scope Graph permissions for things another service does better. *(Presenter note: if a slide says "Outlook email integration," it's more accurate to say "Outlook calendar integration + transactional email.")*

## 2.7 Microsoft AI Foundry — Multi-Provider, Metered AI

- **A provider abstraction, Foundry included.** All AI features run through one interface with interchangeable providers: **Azure AI Foundry** (default deployment on the GPT-5 family; the executive-narrative feature pins Foundry explicitly), a raw **Azure OpenAI** provider, and a non-Microsoft development provider — selectable per deployment from a database-driven configuration, with automatic fallback.
- **Metered and governed.** Every call is logged (provider, model, feature, tokens, estimated cost, latency); monthly **token budgets** raise threshold alerts. AI features span estimate generation, invoice/SOW/status/executive narratives, natural-language reporting, time-entry rewrite, and the help chat.
- Key concept: treat the model as a swappable, metered dependency — pick Foundry for enterprise data-governance, but keep the provider seam so you're never locked in.

## 2.8 Microsoft Copilot Studio — Constellation as a Connected Agent

- **What it is.** Constellation is exposed to **Microsoft Copilot Studio** as a conversational agent for Teams and M365 Copilot, so users can ask questions like "what are my assignments this week?" or "show at-risk projects" and get answers drawn from live platform data.
- **How it connects.** Two supported paths, both over the read-only MCP API: a **Power Platform Custom Connector** generated from Constellation's OpenAPI spec (OAuth2 against the Constellation Entra app), or — preferred — importing Constellation as a **connected A2A agent** via its published agent card. The Copilot Studio agent's client ID is registered as a known client application on Constellation's API so tokens validate.
- **Identity flows through.** The user's identity carries from Copilot into Constellation, so the agent only ever returns data that user is authorized to see, under the same tenant and role rules as the web app. It's read-only by design.
- Key concept: an agent is just another authenticated client — reuse your identity, tenant, and permission model rather than building a parallel one.

## 2.9 Also in the Microsoft orbit

- **MCP server + Power Platform Custom Connector** (covered above) — the connective tissue for Copilot Studio and M365 Copilot.
- **Per-tenant "bring your own app" integration config** — customers can point Planner/Graph integrations at their own Entra registration.
- **Teams alerting/automation** — proactive Teams messages and Group/SharePoint/guest provisioning via Graph.
- **Non-Microsoft, noted for completeness:** HubSpot CRM (per-tenant OAuth, surfaced as CRM deals in the same API), QuickBooks (payment sync), and the transactional email/AI-dev/object-storage dependencies that sit alongside the Microsoft stack.

---

## The Through-Line for the Talk

Constellation's architecture is an argument for a single idea: **lean on the platform.** Identity, isolation, storage, collaboration, task management, and AI are all hard problems that Microsoft has already solved at enterprise grade — so the app builds *on* Entra, SharePoint Embedded, Teams, Planner, and Foundry rather than reinventing any of them. The payoff is security separation you inherit rather than hand-roll, collaboration where users already are, and an AI layer that's governed and swappable. The multi-tenant core — one identity across many tenants, every query scoped to a tenant, the shell and branding defined once in common modules, features gated by plan, and the strongest tenants separated cryptographically (per-tenant encryption in Zenith; the per-customer Azure/SharePoint Embedded boundary in Constellation) — is what lets one codebase serve many firms safely. Those are the engineering quality patterns this session is about, shown end to end in real products rather than in the abstract.
