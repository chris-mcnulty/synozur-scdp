# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform for managing consulting project lifecycles. It streamlines operations, enhances efficiency, and provides robust management capabilities including estimation, resource allocation, time tracking, expense management, and automated invoice generation. The platform leverages AI for narrative generation and automated expense calculations to achieve an efficient and data-driven consulting practice. Key capabilities include improved file management, transparent quote displays, advanced resource management for capacity planning, and milestone-based invoice generation.

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
- **Key UI/UX Decisions**: Refactored estimate tables, mobile optimization, responsive navigation, user persona-based navigation, prominent quote totals, dark/light mode, and advanced project list/detail views with consolidated tabs and deep linking. Standardized project selectors.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas.

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses (with approval workflow), Invoices, Payment Milestones, Rate overrides, Project Engagements.

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
- **Invoice & Document Management**: Automated generation, PDF handling, milestone-based invoicing, expense receipt inclusion, and receipts bundle download. Auto-generated GL invoice numbers.
- **Expense Approval Workflow**: Comprehensive system with finite state machine, role-based access, and automated per diem calculation.
- **Resource Management**: Dual List/Timeline views, capacity planning dashboard, and conflict detection.
- **Microsoft Planner Integration**: Full bidirectional sync of project assignments with Microsoft Planner tasks.
- **Scheduled Jobs**: Background job system for expense reminders, time reminders, and Planner sync.
- **Support Ticket Planner Integration**: Bidirectional sync between support tickets and Microsoft Planner tasks.
- **Financial Reporting**: Comprehensive reports showing revenue, cost, profit, and margins by client/project, with KPI summaries and health scoring.
- **Contractor Expense Invoices**: Contractors can generate invoices from their expense reports for reimbursement.
- **Retainer Estimates & Management**: New estimate type for monthly hour-block engagements with creation wizard, utilization tracking, and live retainer month management.
- **Project Rate Overrides**: Project-level billing and cost rate overrides.

### Multi-Tenancy
- **Architecture**: UUID-based tenant IDs, tenant-scoped data isolation, service plans, and subdomain routing.
- **Automatic Tenant Assignment**: Users are auto-assigned to tenants on login.
- **Platform Roles**: `global_admin` and `constellation_admin` can manage all tenants; regular `admin` role manages their own tenant only.
- **Platform Admin UI**: Available for managing tenants, service plans, user assignments, airport codes, and OCONUS per diem rates.
- **Settings Separation**: Tenant-specific settings managed in Organization Settings (`/organization-settings`). Platform-wide settings in System Settings (`/system-settings`). Rate resolution hierarchy: Project Overrides → User Rate Schedules → User Defaults → Organization Defaults → System Defaults.
- **User Management Tenant Isolation**: User listings filtered by active tenant.
- **Platform User Management**: Platform admins can manage user tenant memberships and role assignments.
- **Invoice Footer & Email Branding**: Configurable tenant-level branding.
- **Vocabulary Multi-tenancy**: `organizationVocabulary` is tenant-scoped with strict tenant isolation.
- **Multi-Tenant Identity & Stakeholder Model**: Uses `users` table for global identity and `tenant_users` for tenant-specific access and roles, allowing multiple roles across tenants.

### Reference Data (System-wide)
- **Airport Code Reference Data**: `airport_codes` table.
- **OCONUS Per Diem Rates**: `oconus_per_diem_rates` table.

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
- **CRM Integration**: HubSpot API (for Deals, Companies, Contacts, Deal Stage Updates, Revenue Sync, and Activity Logging).