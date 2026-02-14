# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform designed to manage the entire lifecycle of consulting projects. It aims to streamline operations, enhance efficiency, and provide robust management capabilities for consulting businesses by integrating features like estimation, resource allocation, time tracking, expense management, and automated invoice generation. Key capabilities include improved file management, transparent quote displays, advanced resource management for capacity planning, and milestone-based invoice generation. The platform leverages AI for narrative generation and automated expense calculations to achieve a highly efficient and data-driven consulting practice.

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
- **Key UI/UX Decisions**: Refactored estimate tables, mobile optimization, responsive navigation, user persona-based navigation, prominent quote totals, dark/light mode, and advanced project list/detail views with consolidated tabs and deep linking. Standardized project selectors for clarity.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas.
- **Authentication**: Azure AD SSO (production) and local email/password (development).

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses (with approval workflow), Invoices, Payment Milestones, Rate overrides, and Project Engagements.

### Project Structure
- **Monorepo**: Organized into `/client`, `/server`, and `/shared`.

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID).
- **Development Auth**: Local email/password.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Document Storage
- **Strategy**: Multi-tier with SharePoint Online (primary for business documents) and Replit Object Storage (for legacy data).

### Core Features
- **AI Integration**: Uses Replit AI (OpenAI GPT-5 compatible) for estimate/invoice narrative generation and report queries.
- **Estimate Management**: Supports Excel/CSV import/export, AI-driven text export, status-based locking, and hierarchical rate precedence.
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, expense receipt inclusion, and receipts bundle download.
- **Expense Approval Workflow**: Comprehensive system with finite state machine, role-based access, and automated per diem calculation (GSA federal rates).
- **Resource Management**: Dual List/Timeline views, capacity planning dashboard, and conflict detection.
- **Microsoft Planner Integration**: Full bidirectional sync of project assignments with Microsoft Planner tasks using client credentials flow with per-tenant app registrations.
- **Scheduled Jobs**: Background job system for expense reminders, time reminders, and Planner sync, with admin monitoring and multi-tenant scoping.
- **Financial Reporting**: Comprehensive reports showing revenue, cost, profit, and margins by client/project, with KPI summaries and health scoring.
- **Contractor Expense Invoices**: Contractors can generate invoices from their expense reports for reimbursement.
- **Retainer Estimates & Management**: New estimate type for monthly hour-block engagements with creation wizard, auto-generated structure, utilization tracking, and live retainer month management at the project level.
- **Project Rate Overrides**: Project-level billing and cost rate overrides.
- **"What's New" Changelog Modal**: AI-generated summary of platform updates shown to users on login.

### Multi-Tenancy
- **Architecture**: UUID-based tenant IDs, tenant-scoped data isolation, service plans, and subdomain routing.
- **Automatic Tenant Assignment**: Users are auto-assigned to tenants on login via `primaryTenantId`, Azure AD tenant ID mapping, email domain matching, or default tenant fallback.
- **Platform Roles**: `global_admin` and `constellation_admin` can manage all tenants; regular `admin` role manages their own tenant only.
- **Platform Admin UI**: Available for managing tenants, service plans, user assignments, airport codes, and OCONUS per diem rates.
- **Settings Separation**: Tenant-specific and platform-wide settings.
- **Invoice Footer & Email Branding**: Configurable tenant-level branding.
- **Vocabulary Multi-tenancy**: `organizationVocabulary` is tenant-scoped with strict tenant isolation.

### Reference Data (System-wide)
- **Airport Code Reference Data**: `airport_codes` table (5,163 IATA codes).
- **OCONUS Per Diem Rates**: `oconus_per_diem_rates` table for Outside Continental US locations.

## Related Synozur Products

### Orion (Synozur Maturity Model Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-maturitymodeler
- **Purpose**: Multi-model maturity assessment platform with AI-powered recommendations, benchmarking, and knowledge base grounding.
- **Relevant Patterns**: Knowledge document uploads (PDF/DOCX/TXT/MD) with `DocumentExtractionService` (mammoth + pdf-parse), AI usage logging (token counts, costs). Documents stored in Replit Object Storage.

### Vega (Synozur Company OS Platform)
- **Repository**: https://github.com/chris-mcnulty/synozur-vega
- **Purpose**: AI-augmented Company Operating System for OKR management, strategy tracking, and focus rhythm. Multi-tenant with Microsoft 365 integration.
- **Relevant Patterns for Constellation (Primary Reference for Grounding Docs)**:
  - **Grounding Documents System**: `grounding_documents` table with `tenantId` (null = global/platform, value = tenant-specific), `title`, `description`, `category` (methodology, best_practices, terminology, examples, background_context, company_os), `content` (extracted plain text stored directly — NOT file references), `priority` (integer, higher = included first in AI context), `isActive` (boolean on/off toggle), `isTenantBackground` (auto-include in all tenant AI conversations), `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
  - **Document Parsing Routes**: Separate `/api/ai/parse-pdf` and `/api/ai/parse-docx` endpoints that accept raw binary uploads and return extracted text. The frontend uploads the file, gets back text, then stores the text content (not the file) in the grounding doc record. This keeps token sizes small and avoids runtime file parsing.
  - **AI Prompt Injection**: `buildSystemPrompt(tenantId?)` function fetches active grounding docs (global + tenant-specific if tenantId provided), sorts by priority descending then category, formats each as `### {categoryLabel}: {title}\n{content}`, and prepends to system prompt under `## Grounding Knowledge Base` section.
  - **Storage Interface**: `getActiveGroundingDocuments()` (global active docs), `getActiveGroundingDocumentsForTenant(tenantId)` (active global + tenant docs using `or(isNull(tenantId), eq(tenantId, id))`), CRUD with `getAllGroundingDocuments()`, `getGlobalGroundingDocuments()`, `getTenantGroundingDocuments(tenantId)`.
  - **AI Configuration**: `ai_configuration` table for runtime provider/model switching, rate limiting, token budgets. AI usage logging with `ai_usage_logs` (provider, model, feature, prompt/completion tokens, estimated cost in microdollars, latency).
  - **Category Labels**: `{ company_os: "Company Operating System Overview", methodology: "Methodology & Framework", best_practices: "Best Practices", terminology: "Key Terminology", examples: "Examples & Templates" }`.
- **Key Design Principle**: Vega stores extracted text content directly in the DB record (not file references). Documents are parsed client-side via parse endpoints, then content is saved. This eliminates runtime file I/O during AI calls and keeps the system simpler.

## Critical Development Rules

### API Calls: ALWAYS Use `apiRequest` or Include Session Header
- **NEVER use raw `fetch()` for API calls** without including the `x-session-id` header. In production (Azure AD SSO), authentication depends on this header. Raw `fetch` with only `credentials: "include"` will return 401 in production, causing redirect loops.
- **For queries**: Use `apiRequest(url)` from `@/lib/queryClient` as the `queryFn`. Do NOT rely on the default `queryFn` for URLs with query parameters (it joins array queryKey segments with `/`).
- **For file uploads** (FormData): Use raw `fetch` but add the session header via `getSessionId()` from `@/lib/queryClient`.
- **Pattern**: `const sid = getSessionId(); if (sid) headers['x-session-id'] = sid;`
- **Known affected files fixed (Feb 2026)**: `portfolio-raidd.tsx`, `client-revenue-report.tsx`, `tenant-grounding-docs.tsx`, `platform-grounding-docs.tsx`. Other files in `client/src/pages/` and `client/src/components/` still use raw `fetch` and may need fixing.

### React Hooks: Never Place After Early Returns
- All `useEffect`, `useState`, `useMemo` etc. must be called BEFORE any conditional `return` statements in a component. Placing hooks after early returns causes "Rendered more hooks than during the previous render" errors and infinite redirect loops.

### Redirect Loop Protection
- The redirect-after-login system (`sessionStorage.redirectAfterLogin`) has built-in loop protection: if it detects the same page redirect failing 2+ times, it clears the saved path and sends the user to the dashboard instead of looping.

## Backlog

(No outstanding items)

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React, Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form.
- **PDF Generation**: Puppeteer.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client.
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI.
- **Per Diem Rates**: GSA Per Diem API (CONUS) and DoD OCONUS rates database.
- **Airport Codes**: IATA 3-letter code database.
- **Exchange Rates**: Open Exchange Rates API.