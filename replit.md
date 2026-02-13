# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform designed to manage the entire lifecycle of consulting projects. It aims to streamline operations, enhance efficiency, and provide robust management capabilities for consulting businesses by integrating features like estimation, resource allocation, time tracking, expense management, and automated invoice generation. Key capabilities include improved file management, transparent quote displays, advanced resource management for capacity planning, and milestone-based invoice generation. The platform leverages AI for narrative generation and automated expense calculations to achieve a highly efficient and data-driven consulting practice.

## User Preferences
Preferred communication style: Simple, everyday language.
User management should be consolidated into a single, unified view (like Vega) rather than separate admin pages.
Prefer scope-based filtering over separate "Platform Users" vs "Tenant Users" pages.

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