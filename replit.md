# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from estimation and resource allocation to time tracking, expense management, and automated invoice generation. Its primary purpose is to streamline operations, enhance efficiency, and provide robust management capabilities for consulting businesses. Key features include improved file management with SharePoint and Replit Object Storage, transparent quote displays, advanced resource management for capacity planning, and milestone-based invoice generation. The platform integrates AI for narrative generation and automated expense calculations, supporting a vision for a highly efficient and data-driven consulting practice.

## User Preferences
Preferred communication style: Simple, everyday language.

### UI/UX Design Reference: Vega
- **Vega** (vega.synozur.com) is Synozur's Entra SSO-based multi-tenant application for managing company operating systems, strategy execution, and OKRs.
- **Repo**: https://github.com/chris-mcnulty/synozur-vega
- **Multi-tenant Admin Pattern**: Vega has a unified user management view that:
  - Shows all users in the system for platform admins
  - Constrains view to a single tenant for users with limited security scope
  - Provides filtering to drill into specific tenants
- **Reference**: Look to Vega for proven patterns in multi-tenant user administration. The user may request code examples from this repo.

### Platform Users Preference
- User management should be consolidated into a single, unified view (like Vega) rather than separate admin pages
- Prefer scope-based filtering over separate "Platform Users" vs "Tenant Users" pages

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

### Agent Test Account (Development Only)
- **Email**: agent.admin@synozur.com
- **Password**: Stored in `AGENT_TEST_PASSWORD` secret
- **User ID**: agent-test-admin-001
- **Role**: admin
- **Purpose**: Automated testing by Replit Agent. This account is in the dev credentials list in `server/auth-routes.ts`.

### Document Storage
- **Strategy**: Multi-tier with SharePoint Online (primary for business documents) and Replit Object Storage (for legacy data).

### Core Features
- **AI Integration**: Uses Replit AI (OpenAI GPT-5 compatible) for estimate/invoice narrative generation and report queries.
- **Estimate Management**: Supports Excel/CSV import/export, AI-driven text export, status-based locking, and hierarchical rate precedence (Manual inline > Estimate override > Client override > User default > Role default).
- **Salaried Resource Handling**: Configurable `isSalaried` flag for individuals or roles, ensuring salaried time does not impact project profitability metrics.
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, expense receipt inclusion, and receipts bundle download (ZIP of all receipts for an invoice batch). Configurable Constellation footer branding (tenant-level toggle).
- **Expense Approval Workflow**: Comprehensive system with finite state machine, role-based access, and automated per diem calculation (GSA federal rates).
- **Resource Management**: Dual List/Timeline views, capacity planning dashboard, and conflict detection.
- **Microsoft Planner Integration**: Full bidirectional sync of project assignments with Microsoft Planner tasks, including status, dates, and assignees. Background scheduler syncs every 30 minutes.
- **Scheduled Jobs**: Background job system with admin monitoring at `/admin/scheduled-jobs`:
  - **Expense Reminders**: Weekly emails to users with unsubmitted expenses (tenant-configurable day/time)
  - **Time Reminders**: Weekly emails to users who haven't logged time (configurable in settings)
  - **Planner Sync**: Automatic sync of all projects with `syncEnabled=true` every 30 minutes
  - All jobs log runs to `scheduled_job_runs` table with status, trigger type, and results
  - Manual trigger buttons and run history available in admin UI
  - **Multi-tenant Scoping**: Job runs, stats, and history are tenant-scoped; regular admins see only their tenant's jobs; platform admins (global_admin/constellation_admin) can view all jobs across tenants
  - **Stuck Job Detection**: Jobs running 30+ minutes are marked as "stuck" with orange highlighting; individual cancel buttons and bulk cleanup available
  - **Startup Catch-up**: On server boot, checks for missed jobs and runs them automatically. Weekly reminders catch up if no run in 8+ days; Planner sync catches up if no run in 35+ minutes. Prevents missed jobs when auto-scale deployment sleeps.
- **Financial Reporting**: Comprehensive reports showing revenue, cost, profit, and margins by client/project, with KPI summaries and health scoring. Revenue calculations exclude tax.
- **Contractor Expense Invoices**: Contractors can generate invoices from their expense reports for reimbursement. Invoices can be downloaded as PDF or QuickBooks-compatible CSV. Invoice shows contractor's business info as sender and company (e.g., SYNOZUR) as recipient. Default payment terms: "Due upon client reimbursement". Contractor billing profile is saved to user record for future invoices.

### Multi-Tenancy (Active)
- **Architecture**: UUID-based tenant IDs (matches Vega production design), tenant-scoped data isolation, service plans, and subdomain routing.
- **Synozur Tenant UUIDs**:
  - Development: `e005d68f-3714-47c0-b2ba-346aa0bca107`
  - Production: `afac1c3e-b09d-4794-959b-1cbf509e59a5`
- **Automatic Tenant Assignment**: Users are auto-assigned to tenants on login via:
  1. Existing `primaryTenantId` (if already set)
  2. Azure AD tenant ID mapping (SSO login)
  3. Email domain matching (user's email domain → tenant's `allowedDomains`)
  4. Default tenant fallback
- **Platform Roles**: `global_admin` and `constellation_admin` can manage all tenants; regular `admin` role manages their own tenant only.
- **Platform Admin UI**: Available at `/platform/tenants`, `/platform/service-plans`, `/platform/users`, `/platform/airports`, and `/platform/oconus` for platform admins to create/manage tenants, service plans, user assignments, airport codes, and OCONUS per diem rates.
- **Settings Separation**:
  - **Tenant Settings**: Company name, logo, address, phone, email, website, payment terms, showConstellationFooter, emailHeaderUrl - stored on `tenants` table, managed via `/api/tenant/settings`
  - **Platform Settings**: Default billing/cost rates, estimation factors, mileage rate - stored in `system_settings` table, visible to platform admins
- **Invoice Footer**: Tenant-level toggle (`showConstellationFooter`, default true) controls display of "Generated by Constellation (SCDP)" with links to scdp.synozur.com and www.synozur.com at the bottom of invoices
- **Email Branding**: Tenants can configure an optional `emailHeaderUrl` (Settings → Company) which displays a branded header image at the top of all outgoing email notifications (expense approvals, rejections, etc.)
- **Vocabulary Multi-tenancy**: `organizationVocabulary` is tenant-scoped with strict tenant isolation.

### Airport Code Reference Data (System-wide)
- **Table**: `airport_codes` - 5,163 IATA 3-letter airport codes from global airports database
- **Not tenant-scoped**: This is reference data shared across all tenants
- **Endpoints**:
  - `GET /api/airports?search=SEA&limit=50` - Search airports by code, name, or city
  - `GET /api/airports/:iataCode` - Get single airport by code
  - `POST /api/airports/validate` - Validate multiple codes `{ codes: ["SEA", "JFK"] }`
  - `GET /api/airports/stats/count` - Get total airport count
  - `POST /api/platform/airports/upload` - Platform admin CSV upload (global_admin/constellation_admin only)
- **Expense Form Integration**: Airfare expenses show airport name lookups with green/orange border validation feedback
- **Maintenance**: Platform admins can upload new CSV data via `/api/platform/airports/upload`
- **Script**: `scripts/ingest-airport-codes.ts` for bulk data ingestion
- **CSV Format**: Flexible column detection supports multiple formats:
  - Standard: `iata_code,name,municipality,iso_country,iso_region,type,coordinates`
  - OurAirports format: `ident,type,name,...,iata_code,...,municipality,iso_country,iso_region,...,coordinates`
  - Only rows with valid 3-letter IATA codes are imported; others are skipped

### OCONUS Per Diem Rates (System-wide)
- **Table**: `oconus_per_diem_rates` - Per diem rates for Outside Continental US locations
- **Not tenant-scoped**: This is reference data shared across all tenants
- **Data Source**: DoD OCONUS Per Diem ASCII files (no API available, updated annually)
- **Endpoints**:
  - `GET /api/oconus/rates?search=GERMANY&limit=50` - Search OCONUS rates by country/location
  - `GET /api/oconus/rate?country=GERMANY&location=BERLIN&date=2026-03-15` - Get rate for specific location/date
  - `GET /api/oconus/countries` - List all available countries
  - `GET /api/oconus/locations/:country` - Get locations for a country
  - `GET /api/oconus/stats/count` - Get total rate count
  - `POST /api/platform/oconus/upload` - Platform admin file upload (global_admin/constellation_admin only)
  - `POST /api/perdiem/oconus/calculate` - Calculate OCONUS per diem for expense entry
  - `POST /api/perdiem/oconus/calculate-with-components` - Calculate with meal component selections
- **Rate Fields**: country, location, seasonStart/End (MM/DD), lodging, M&IE, maxPerDiem, effectiveDate, fiscalYear
- **Seasonal Rates**: Some locations have different rates for different seasons (e.g., Alaska summer vs winter)
- **Script**: `scripts/ingest-oconus-rates.ts` for bulk data ingestion from ZIP files
- **2026 Data**: 1,613 rates loaded covering foreign countries and US territories (Alaska, Hawaii, etc.)

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React, Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form.
- **PDF Generation**: Puppeteer.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client.
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI.
- **Per Diem Rates**: GSA Per Diem API (CONUS) and DoD OCONUS rates database (uploaded annually).
- **Airport Codes**: IATA 3-letter code database (5,163 airports).
- **Exchange Rates**: Open Exchange Rates API for multi-currency invoice generation (1-hour cache, with fallback rates).

## Backlog / Future Enhancements

### Invoice PDF Optimization
- **Current State**: Invoice PDFs are regenerated each time "Generate Invoice" is clicked. The "View Invoice" action serves a cached version from Object Storage.
- **Enhancement Idea**: For finalized invoices (status = 'sent' or 'paid'), prevent regeneration and only serve the cached version. This preserves the exact invoice sent to the client and improves performance.
- **Receipt Processing**: PDF receipts are now rendered as images using Puppeteer (up to 25MB per receipt, 60 second timeout). Consider async processing with progress indicator for invoices with many PDF receipts.

### Receipts Bundle Download
- **Feature**: Users can download all receipts for an invoice batch as a ZIP file
- **UI**: When receipts are available, the Download PDF button becomes a dropdown with "Invoice PDF" and "Complete Receipts (ZIP)" options
- **Endpoints**: 
  - `GET /api/invoice-batches/:batchId/receipts-bundle` - Downloads ZIP with all receipts
  - `GET /api/invoice-batches/:batchId/receipts-bundle/check` - Returns { available: boolean, count: number }
- **Security**: Uses batch's tenantId for data isolation, validates user access, URL validation for external receipts (https only), 30s timeout, 25MB max per file

### Performance Notes
- Large invoices with many PDF receipts may take up to 60 seconds to generate
- Consider adding a loading indicator or toast message warning users of long generation times
- Multi-page PDF receipts are supported (up to 5 pages per PDF)