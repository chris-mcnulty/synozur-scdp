# Copilot Cloud Agent Instructions — Constellation (SCDP)

> **Master source of truth**: `replit.md` in the repo root. Read it first for the definitive overview of the platform, architecture, and design decisions.

---

## What This App Is

**Constellation** is the *Synozur Consulting Delivery Platform (SCDP)*: a multi-tenant SaaS application for consulting firms that covers the full project lifecycle — estimation, resource allocation, time tracking, expense management, and automated invoice generation.

---

## Critical Rules (Non-Negotiable)

1. **Font** — ONLY `Avenir Next LT Pro`. Never use Inter, system-ui, or any other font family. Font files live in `client/public/fonts/`. The `@font-face` declarations are in `client/src/index.css`; Tailwind font variables resolve to `'Avenir Next LT Pro'`.

2. **Assets** — `attached_assets/` is for temporary scratch files only. All permanent assets (logos, images, etc.) go under `client/src/assets/` so they survive cleanup and are included in production builds.

3. **User Model** — A user in one tenant can be a client in another. There is **no** separate `client_contacts` table. Use the global `users` table for all people.

4. **User Management UI** — Single unified view (scope-based filtering), NOT separate "Platform Users" vs "Tenant Users" admin pages.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | Radix UI / shadcn/ui + Tailwind CSS |
| Routing (client) | `wouter` |
| Data fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Backend | Node.js + Express.js + TypeScript (ES modules) |
| ORM | Drizzle ORM + Drizzle Kit |
| Validation | Zod schemas (shared between client and server) |
| Database | PostgreSQL on Neon (`@neondatabase/serverless`) |
| PDF | Puppeteer |
| Auth (prod) | Azure AD / Microsoft Entra ID SSO |
| Auth (dev) | Local email/password |
| Build | Vite (client) + esbuild (server) |

---

## Project Structure

```
/
├── client/               # React frontend
│   ├── src/
│   │   ├── App.tsx       # Route declarations (wouter Switch/Route)
│   │   ├── pages/        # One file per page/route
│   │   ├── components/   # Shared UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utilities (auth.ts, queryClient.ts, types.ts, …)
│   │   ├── themes/       # CSS theme files (Aurora, Night Sky, Navigator's Chart)
│   │   └── index.css     # @font-face + Tailwind base
│   └── public/
│       ├── fonts/        # Avenir Next LT Pro font files
│       └── docs/         # User-facing docs (mirrored from docs/)
├── server/               # Express backend
│   ├── index.ts          # App entry point
│   ├── routes.ts         # Main route registrar (imports from routes/)
│   ├── routes/           # Domain-specific route modules
│   ├── storage/          # Database access layer
│   │   ├── index.ts      # IStorage interface + DatabaseStorage composition
│   │   ├── helpers.ts    # Shared utilities (normalizeAmount, round2, …)
│   │   ├── pdf-generation.ts
│   │   └── *.ts          # Domain modules: users, projects, estimates, …
│   ├── storage.ts        # Thin re-export barrel (preserves import paths)
│   ├── services/         # External integrations (SharePoint, HubSpot, AI, …)
│   ├── auth/             # Entra SSO config, MCP bearer auth, token refresh
│   ├── middleware/       # auth.ts (re-exports from session-store), tenant.ts
│   ├── db.ts             # Drizzle + Neon pool setup
│   └── session-store.ts  # Session management + requireAuth/requireRole exports
├── shared/
│   ├── schema.ts         # ALL Drizzle table definitions + Zod schemas + types
│   └── publicDomains.ts  # Public email domain list
├── docs/                 # Design docs, user guide, roadmap, changelog
├── replit.md             # Master source of truth for architecture & preferences
├── backlog.md            # Product backlog (check before starting features)
├── package.json          # "type":"module" — ES modules throughout
├── tsconfig.json         # Paths: @/* → client/src/*, @shared/* → shared/*
├── tailwind.config.ts
└── vite.config.ts
```

---

## Commands

```bash
# Development (runs server + Vite HMR together)
npm run dev

# TypeScript type-check (no emit)
npm run check

# Full production build (Vite client → dist/public, esbuild server → dist/)
npm run build
# or use the build script:
bash build.sh

# Push schema changes to database (Drizzle Kit)
npm run db:push

# Production start
npm run start
```

> **Note**: This repository does not have a comprehensive automated test suite. TypeScript type-checking (`npm run check`) is the primary automated validation method. When making changes, validate correctness through type-checking and manual smoke-testing rather than expecting test coverage to catch regressions.

---

## Database & Schema

- All table definitions, relations, Zod insert schemas, and TypeScript types live in **`shared/schema.ts`** — the single source of truth.
- The ORM is Drizzle. Queries use `db` from `server/db.ts`.
- Storage operations go through `server/storage/` domain modules, exposed via `server/storage.ts` (barrel re-export so existing `import { storage } from "../storage"` paths stay valid).
- To add or modify a table: edit `shared/schema.ts`, then run `npm run db:push`.
- Environment variable required: `DATABASE_URL` (Neon PostgreSQL connection string).

---

## Authentication & Authorization

### Middleware

```ts
import { requireAuth, requireRole, requirePlatformAdmin } from "../session-store";
import { requireTenantContext } from "../middleware/tenant";
```

### Role hierarchy (six tiers, highest → lowest privilege)

| Tier | Display Name | Value |
|---|---|---|
| 1 | Admin | `admin` |
| 2 | Billing Admin | `billing-admin` |
| 3 | Executive | `executive` |
| 4 | Portfolio Manager | `portfolio-manager` |
| 5 | Project Manager | `pm` |
| 6 | Employee | `employee` |
| — | Client Stakeholder | `client` (external, scoped to specific projects) |

**Platform roles** (`global_admin`, `constellation_admin`) are stored in `tenant_users.platformRole` for cross-tenant management.

### Permission helpers (`client/src/lib/auth.ts`)

- `canViewPricing(role)` — admin, billing-admin, executive, portfolio-manager
- `canViewCostMargins(role)` — admin, billing-admin, executive
- `canManageProjects(role)` — admin, pm, executive, portfolio-manager
- `canViewSlippage(role)` — admin, billing-admin, pm, portfolio-manager, executive
- Full list in `client/src/lib/auth.ts`

### Route protection pattern

```ts
router.get('/endpoint', requireAuth, requireRole(['admin', 'pm']), requireTenantContext, async (req, res) => { … });
```

---

## Multi-Tenancy

- Every request resolves a `tenantId` from `req.user.tenantId`.
- Global `users` table + `tenant_users` junction for tenant-scoped roles.
- Filter all data queries by `tenantId` — never return cross-tenant data.
- UUID-based tenant IDs; subdomain routing supported.
- `tenant_users.platformRole` holds cross-tenant admin roles.

---

## Adding API Endpoints

1. Identify the appropriate route file in `server/routes/` (or `server/routes.ts` for legacy).
2. Always add `requireAuth` + `requireRole([…])` + `requireTenantContext` middleware on protected routes.
3. Filter DB queries by `tenantId` from `req.user` or `req.tenantContext`.
4. Define Zod validation schemas in `shared/schema.ts` and use them server-side.
5. Use Drizzle query builder — no raw SQL strings unless absolutely necessary.
6. Register new route modules in `server/routes.ts` using the `registerXxxRoutes(app, deps)` pattern.

---

## Adding Frontend Pages

1. Create `client/src/pages/my-page.tsx`.
2. Import and add a `<Route path="/my-path" component={MyPage} />` in `client/src/App.tsx`.
3. Add navigation entry in `client/src/components/layout/sidebar.tsx` if needed.
4. Use TanStack Query (`useQuery`, `useMutation`) for all data fetching.
5. Use shadcn/ui components from `@/components/ui/` — do not add raw Radix or HTML elements when a shadcn wrapper exists.
6. Use Tailwind utility classes only — no inline styles, no external CSS unless adding to an existing CSS module.

---

## Document Storage

- Primary: **SharePoint Embedded (SPE)** — per-tenant container, isolated Azure AD.
- Fallback: **Replit Object Storage** (legacy).
- Smart routing via tenant `speStorageEnabled` flag.
- Services: `server/services/sharepoint-storage.ts`, `server/services/sharepoint-file-storage.ts`.
- SPE billing is to Synozur, not customers.

---

## AI Integration

- Multi-provider: Replit AI (OpenAI-compatible) + Azure AI Foundry.
- Provider logic: `server/services/ai-provider.ts`.
- Usage logging and cost tracking per tenant in the `ai_usage_logs` table.
- AI route handlers: `server/routes/ai.ts`.

---

## MCP Server (Read-Only)

- ~24 GET endpoints under `/mcp` for M365 Copilot / Copilot Studio integration.
- Supports both session auth and OAuth bearer tokens (JWKS from Entra).
- Route file: `server/routes/mcp.ts`.
- Always filter by `tenantId`; never expose cross-tenant data.
- Reference: `docs/MCP_README.md` and `docs/MCP_CONNECTOR_SETUP.md`.

---

## Teams Integration

- Embed routes (`/embed/*`) are chromeless, read-only, Teams SSO authenticated.
- Teams app manifest: `teams/manifest.json`.
- Tab auto-install and channel provisioning: `server/routes/teams-automation.ts`.
- Teams SDK v2 SSO; iframe embedding allowed only for Microsoft 365 domains (set in CSP header in `server/index.ts`).

---

## Theme System

- Three themes: Aurora (default), Night Sky, Navigator's Chart.
- Theme CSS files: `client/src/themes/`.
- Colors are CSS variables consumed by Tailwind — never hardcode hex values.
- Guide: `docs/SYNOZUR_THEME_GUIDE.md`.

---

## Path Aliases

| Alias | Resolves To |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `client/src/assets/*` |

---

## Planning & Documentation Files

Before starting any feature or change, read these:

| File | Purpose |
|---|---|
| `replit.md` | Master architecture & preferences |
| `backlog.md` | Current backlog — avoid duplicating planned work |
| `docs/ROADMAP.md` | Strategic direction Q1/Q2 2026 and beyond |
| `docs/USER_GUIDE.md` | Canonical user guide — how features should behave |
| `docs/CHANGELOG.md` | Release history |

---

## Common Errors & Workarounds

- **`DATABASE_URL` not set** — ensure the environment variable is provided; `server/db.ts` throws immediately if missing.
- **Vite build fails on server-only imports** — never import `server/` modules from `client/`. The `@shared/` alias is the only safe cross-boundary import.
- **ESM `__dirname` undefined** — use `import.meta.dirname` (Node 20+) or `fileURLToPath(import.meta.url)` pattern. The codebase is `"type":"module"`.
- **Puppeteer in CI** — Puppeteer requires Chromium. In CI environments without a display, ensure `--no-sandbox` and `--disable-setuid-sandbox` flags are passed (see `server/storage/pdf-generation.ts`).
- **Drizzle schema drift** — always run `npm run db:push` after editing `shared/schema.ts`. Do not hand-edit SQL migrations.
