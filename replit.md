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

### Document Storage
- **Strategy**: Multi-tier with SharePoint Online (primary for business documents) and Replit Object Storage (for legacy data).

### Core Features
- **AI Integration**: Uses Replit AI (OpenAI GPT-5 compatible) for estimate/invoice narrative generation and report queries.
- **Estimate Management**: Supports Excel/CSV import/export, AI-driven text export, status-based locking, and hierarchical rate precedence (Manual inline > Estimate override > Client override > User default > Role default).
- **Salaried Resource Handling**: Configurable `isSalaried` flag for individuals or roles, ensuring salaried time does not impact project profitability metrics.
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, expense receipt inclusion, and receipts bundle download (ZIP of all receipts for an invoice batch).
- **Expense Approval Workflow**: Comprehensive system with finite state machine, role-based access, and automated per diem calculation (GSA federal rates).
- **Resource Management**: Dual List/Timeline views, capacity planning dashboard, and conflict detection.
- **Microsoft Planner Integration**: Full bidirectional sync of project assignments with Microsoft Planner tasks, including status, dates, and assignees.
- **Financial Reporting**: Comprehensive reports showing revenue, cost, profit, and margins by client/project, with KPI summaries and health scoring. Revenue calculations exclude tax.

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
- **Platform Admin UI**: Available at `/platform/tenants`, `/platform/service-plans`, and `/platform/users` for platform admins to create/manage tenants, service plans, and user assignments.
- **Settings Separation**:
  - **Tenant Settings**: Company name, logo, address, phone, email, website, payment terms - stored on `tenants` table, managed via `/api/tenant/settings`
  - **Platform Settings**: Default billing/cost rates, estimation factors, mileage rate - stored in `system_settings` table, visible to platform admins
- **Vocabulary Multi-tenancy**: `organizationVocabulary` is tenant-scoped with strict tenant isolation.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React, Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form.
- **PDF Generation**: Puppeteer.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client.
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI.
- **Per Diem Rates**: GSA Per Diem API.

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