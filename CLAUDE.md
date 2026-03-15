# Constellation - Synozur Consulting Delivery Platform (SCDP)

## What This App Is
A comprehensive consulting project lifecycle platform: estimation, resource allocation, time tracking, expense management, and automated invoice generation. Multi-tenant SaaS for consulting firms.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite, Radix UI / shadcn/ui, Tailwind CSS
- **Backend**: Node.js + Express.js + TypeScript (ES modules), RESTful API
- **ORM**: Drizzle ORM with Drizzle Kit for schema management
- **Validation**: Zod schemas
- **Database**: PostgreSQL (hosted on Neon)
- **PDF**: Puppeteer

## Project Structure
- Monorepo: `/client`, `/server`, `/shared`

## Critical Rules
- **FONT**: ONLY use **Avenir Next Lt Pro** family. NEVER use Inter, system-ui, or any other font. Font files in `client/public/fonts/`. CSS `@font-face` and Tailwind `fontFamily` must point to `'Avenir Next LT Pro'`.
- **Assets**: `attached_assets/` is ONLY for temporary scratch files. NEVER store permanent assets there. Use `client/src/assets/logos/` etc.
- **User Model**: Multi-tenant — a user in one tenant can be a client in another. NO separate client_contacts table. Use the existing `users` table for all people.
- **User Management UI**: Single unified view (like Vega), NOT separate admin pages. Scope-based filtering, not separate "Platform Users" vs "Tenant Users" pages.

## Auth
- **Production**: Azure AD (Microsoft Entra ID) SSO
- **Development**: Local email/password
- **Roles**: Six-tier hierarchy with feature-based permissions
- **Platform Roles**: `global_admin` and `constellation_admin` for cross-tenant management

## Multi-Tenancy
- UUID-based tenant IDs, data isolation, subdomain routing
- Global `users` table + `tenant_users` for tenant-specific access/roles
- Auto-assignment on login
- Tenant-specific settings, branding, and vocabulary

## Document Storage
- Multi-tier: SharePoint Embedded (primary) + Replit Object Storage (legacy fallback)
- Tenant opt-in via `speStorageEnabled` flag
- Per-tenant Azure AD isolation for file operations
- SPE billing to Synozur, not customers

## Key Features
- AI Integration: Multi-provider (Replit AI, Azure AI Foundry), usage logging/cost tracking, token budget alerts
- Estimate Management: Excel/CSV import/export, AI-driven text export, status-based locking, hierarchical rate precedence, multiple estimate types
- Invoice & Document Management: Automated generation, PDF, milestone-based invoicing
- Expense Approval Workflow: FSM + role-based access
- Resource Management: Dual List/Timeline views, capacity planning, conflict detection
- Microsoft Planner Integration: Bidirectional sync
- Financial Reporting: Revenue, cost, profit, margins
- Deliverable Tracking: Status workflows, AI narrative extraction
- Persistent Status Reports: AI-generated (text + PPTX), saved to DB, CRUD API
- MCP Server (v0 — Read-Only): ~24 GET endpoints under `/mcp` for M365 Copilot integration, supports session + OAuth bearer auth
- Copilot Studio Agent: Conversational AI for Teams/M365, uses Power Platform Custom Connector
- Teams Custom Tab: Embeddable project detail pages at `/embed/projects/:id`, chromeless layout, Teams SDK v2 SSO
- HubSpot CRM Integration: Per-tenant OAuth 2.0 for Deals, Companies, Contacts
- Contractor Expense Invoices, Project Rate Overrides, Scheduled Jobs (reminders, Planner sync)

## External Services
- Neon Database (PostgreSQL)
- Microsoft Graph (email notifications)
- GSA Per Diem API (CONUS) + DoD OCONUS rates
- IATA airport codes database
- Open Exchange Rates API
- HubSpot API

## Communication Style
Simple, everyday language.
