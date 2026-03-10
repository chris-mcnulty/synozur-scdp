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
- **Microsoft Planner Integration**: Bidirectional sync of project assignments with Microsoft Planner tasks.
- **Scheduled Jobs**: Background system for reminders and Planner sync.
- **Financial Reporting**: Comprehensive reports on revenue, cost, profit, and margins.
- **Contractor Expense Invoices**: Contractors can generate invoices from expense reports.
- **Project Rate Overrides**: Project-level billing and cost rate overrides.
- **Deliverable Tracking**: Management of project deliverables with status workflows, AI narrative extraction, and integration into reports.
- **Persistent Status Reports**: AI-generated status reports (text + PPTX) are automatically saved to `status_reports` table. CRUD API at `/api/projects/:projectId/status-reports`. Reports track reportType (text/pptx), reportStyle, period, content, status (draft/final), SPE file references, and generation metadata. Frontend "Status Reports" tab on project detail page. MCP endpoints at `/mcp/projects/:projectId/status-reports` and `/mcp/projects/:projectId/status-reports/:reportId`.
- **MCP Server (v0 — Read-Only)**: Read-only API surface under `/mcp` for Microsoft 365 Copilot / Copilot Studio integration. ~24 GET endpoints covering user profile, assignments, time entries, expenses, projects, deliverables, RAIDD, portfolio views, financials, CRM deals, and saved status reports. Supports both session-based auth (`x-session-id`) and OAuth bearer tokens (JWT validated against Entra app registration via JWKS). Bearer auth implemented in `server/auth/mcp-bearer-auth.ts` using `jsonwebtoken` + `jwks-rsa`. OpenAPI definition at `docs/constellation-mcp-openapi.json`. Connector setup guide at `docs/MCP_CONNECTOR_SETUP.md`. Endpoint reference at `docs/MCP_README.md`.

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
- **Data Management**: TanStack Query, React Hook Form.
- **PDF Generation**: Puppeteer.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client.
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI, Azure AI Foundry.
- **Per Diem Rates**: GSA Per Diem API (CONUS) and DoD OCONUS rates database.
- **Airport Codes**: IATA 3-letter code database.
- **Exchange Rates**: Open Exchange Rates API.
- **HubSpot CRM Integration**: HubSpot API with per-tenant OAuth 2.0 for Deals, Companies, Contacts, and activity logging.