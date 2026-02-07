# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform for managing the entire lifecycle of consulting projects, from estimation and resource allocation to time tracking, expense management, and automated invoice generation. Its primary purpose is to streamline operations, enhance efficiency, and provide robust management capabilities for consulting businesses. Key capabilities include improved file management, transparent quote displays, advanced resource management for capacity planning, and milestone-based invoice generation. The platform integrates AI for narrative generation and automated expense calculations, aiming for a highly efficient and data-driven consulting practice.

## User Preferences
Preferred communication style: Simple, everyday language.
User management should be consolidated into a single, unified view (like Vega) rather than separate admin pages.
Prefer scope-based filtering over separate "Platform Users" vs "Tenant Users" pages.

### E2E Testing Rules
- **ALWAYS use standard email/password login for agent-based E2E tests in dev. NEVER use SSO.**
- Test account: `agent.admin@synozur.com` with password from `AGENT_TEST_PASSWORD` secret.
- Type the password directly in test plans (do not rely on env var access from the test runner).

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
- **Salaried Resource Handling**: Configurable `isSalaried` flag to prevent salaried time from impacting project profitability.
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, expense receipt inclusion, and receipts bundle download.
- **Expense Approval Workflow**: Comprehensive system with finite state machine, role-based access, and automated per diem calculation (GSA federal rates).
- **Resource Management**: Dual List/Timeline views, capacity planning dashboard, and conflict detection.
- **Microsoft Planner Integration**: Full bidirectional sync of project assignments with Microsoft Planner tasks.
- **Scheduled Jobs**: Background job system for expense reminders, time reminders, and Planner sync, with admin monitoring and multi-tenant scoping.
- **Financial Reporting**: Comprehensive reports showing revenue, cost, profit, and margins by client/project, with KPI summaries and health scoring.
- **Contractor Expense Invoices**: Contractors can generate invoices from their expense reports for reimbursement, downloadable as PDF or QuickBooks-compatible CSV.
- **Retainer Estimates**: New estimate type for monthly hour-block engagements, including creation wizard, auto-generated structure, and utilization tracking. Supports optional multi-rate tiers per month (e.g., Senior at $250/hr for 35hrs + Junior at $150/hr for 20hrs) stored in `retainerRateTiers` JSONB on `projectStages`.
- **Project Retainer Management**: Live retainer month management at project level (independent of locked estimates). CRUD via `/api/projects/:id/retainer-stages` with tenant-isolated ownership validation. UI in Contracts > Retainer tab with add/edit/delete/extend capabilities and month status indicators. Auto-generates end-of-month payment milestones when retainer stages are created (single or bulk extend), calculating amounts from the linked retainer estimate's rate tiers.
- **Project Rate Overrides**: Project-level billing and cost rate overrides in Contracts > Rate Overrides tab.
- **What's New Changelog Modal**: AI-generated summary of platform updates shown to users on login when a new version is released. Cached in `system_settings` (key `CHANGELOG_SUMMARY_{version}`). Tenant-level toggle `showChangelogOnLogin` and per-user tracking via `lastDismissedChangelogVersion`. Mobile-responsive bottom-sheet design. API: GET `/api/changelog/whats-new`, POST `/api/changelog/dismiss`.

### Multi-Tenancy (Active)
- **Architecture**: UUID-based tenant IDs, tenant-scoped data isolation, service plans, and subdomain routing.
- **Automatic Tenant Assignment**: Users are auto-assigned to tenants on login via existing `primaryTenantId`, Azure AD tenant ID mapping, email domain matching, or default tenant fallback.
- **Platform Roles**: `global_admin` and `constellation_admin` can manage all tenants; regular `admin` role manages their own tenant only.
- **Platform Admin UI**: Available at `/platform/tenants`, `/platform/service-plans`, `/platform/users`, `/platform/airports`, and `/platform/oconus` for managing tenants, service plans, user assignments, airport codes, and OCONUS per diem rates.
- **Settings Separation**: Tenant-specific settings (company info, branding) and platform-wide settings (default rates, estimation factors).
- **Invoice Footer & Email Branding**: Configurable tenant-level branding for invoices and email notifications.
- **Vocabulary Multi-tenancy**: `organizationVocabulary` is tenant-scoped with strict tenant isolation.

### Reference Data (System-wide)
- **Airport Code Reference Data**: `airport_codes` table (5,163 IATA codes) for global airports. Not tenant-scoped. Used in expense forms and managed by platform admins.
- **OCONUS Per Diem Rates**: `oconus_per_diem_rates` table for Outside Continental US locations. Not tenant-scoped. Data sourced from DoD, used for expense calculations, and managed by platform admins.

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

## Documentation Maintenance

**IMPORTANT**: Keep the following documentation files updated as new features are developed and released:

### Files to Maintain

These markdown files are rendered as formatted in-app documentation pages using the `MarkdownViewer` component. Each file exists in two locations that must be kept in sync.

1. **USER_GUIDE.md** (`/docs/USER_GUIDE.md` and `/client/public/docs/USER_GUIDE.md`)
   - Rendered at in-app route: `/user-guide`
   - Update when adding new features or changing existing functionality
   - Add new sections for major features
   - Update troubleshooting section with common issues
   - Refresh screenshots if UI changes significantly
   - Update the "Last Updated" date

2. **ROADMAP.md** (`/docs/ROADMAP.md` and `/client/public/docs/ROADMAP.md`)
   - Rendered at in-app route: `/roadmap`
   - Update quarterly or when priorities shift
   - Move completed items from "Current Focus" to CHANGELOG
   - Add new priorities and features as they are planned
   - Update timelines and status indicators
   - Review and adjust the "Recent Roadmap Updates" section

3. **CHANGELOG.md** (`/docs/CHANGELOG.md` and `/client/public/docs/CHANGELOG.md`)
   - Rendered at in-app route: `/changelog`
   - **REQUIRED**: Update with every production release
   - Add new version section with format: `### Version Major.YYYY.MM.DD (Month Day, YEAR)`
   - Include all new features, improvements, and bug fixes
   - Document any breaking changes or upgrade requirements
   - Update the "Current Version" section
   - Move previous "Current Version" to "Recent Releases"

### In-App Documentation Architecture

- **Component**: `client/src/components/MarkdownViewer.tsx` — Reusable markdown renderer using `react-markdown` + `remark-gfm` with Tailwind prose styling, dark mode support, and proper table/code formatting.
- **Pages**: `client/src/pages/user-guide.tsx`, `client/src/pages/changelog.tsx`, `client/src/pages/roadmap.tsx` — Fetch from `/docs/*.md` and render via MarkdownViewer.
- **Navigation**: All three pages are linked from the sidebar, mobile nav, and About page.
- **Source files**: `/client/public/docs/` serves the markdown files statically. The `/docs/` directory is the version-controlled source of truth.

### Update Process

**For each production release:**

1. Review all completed features from backlog.md or project tracking
2. Update CHANGELOG.md with new version section
3. Add significant features to USER_GUIDE.md if needed
4. Update ROADMAP.md to reflect completed items and new priorities
5. **Remember**: Update BOTH copies of each file:
   - Source in `/docs/` (version controlled)
   - Public in `/client/public/docs/` (web accessible, served to in-app pages)
6. Test documentation links from sidebar nav and About page after updates

**Quick commands:**
```bash
# Copy docs from source to public after updates
cp docs/USER_GUIDE.md docs/ROADMAP.md docs/CHANGELOG.md client/public/docs/

# View differences before committing
git diff docs/ client/public/docs/
```

### Version Numbering

Follow the format: **Major.YYYY.MM.DD**
- **Major**: Increments for significant platform changes (currently 1)
- **YYYY**: Four-digit year
- **MM**: Two-digit month (01-12)
- **DD**: Two-digit day (01-31)

Example: `1.2026.02.07` for a release on February 7, 2026