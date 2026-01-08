# Constellation - Synozur Consulting Delivery Platform (SCDP)

## Overview
Constellation is a comprehensive platform for managing the entire lifecycle of consulting projects, from estimation to billing. It streamlines time tracking, expense management, resource allocation, and automates invoice generation. The platform features robust role-based access control, enhances efficiency, and provides strong management capabilities for consulting businesses. Key capabilities include improved file management with SharePoint Online and Replit Object Storage integration, transparent quote displays, enhanced resource management for capacity planning, and milestone-based invoice generation. The platform also integrates AI for features like narrative generation for estimates and invoices, and automated per diem expense calculation with GSA federal rate lookup.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Typography**: Avenir Next LT Pro font family.
- **Routing**: Wouter.
- **State Management**: TanStack Query.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Refactored estimate detail tables, mobile-optimized interfaces, responsive navigation, alphabetically sorted dropdowns, reorganized navigation by user persona, prominent quote total displays with visual cues for overrides.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared).
- **Authentication**: Azure AD SSO (production) and local email/password (development).
- **Development Server**: Vite middleware isolated using sub-app pattern to prevent catch-all routes from intercepting API endpoints.

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses (with approval workflow), Expense Reports, Reimbursement Batches, Invoices, Payment Milestones, Rate overrides (estimate-level and client-level), Pending receipts, Project Engagements (tracking user involvement status on projects).

### Project Structure
- **Monorepo**: Structured into `/client`, `/server`, and `/shared`.

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID).
- **Development Auth**: Local email/password authentication (credentials in environment).
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Document Storage
- **Storage Strategy**: Multi-tier approach with SharePoint Online as primary storage for business documents (receipts, invoices, SOWs, change orders). Replit Object Storage is used for legacy production invoices and receipts.
- **Environment Detection**: Uses `REPLIT_DEPLOYMENT` and `NODE_ENV`.
- **Authentication**: OAuth-based for SharePoint Online; Certificate-based for SharePoint Embedded; Replit sidecar for Object Storage.

### Data Integrity
- **Estimate Preservation**: Estimates are preserved and unlinked upon project deletion.
- **Project-Estimate Workflow**: Supports creation, deletion, and revision of projects from estimates without data loss.
- **Project Structure Independence**: Project structures are copied from estimates, allowing independent modifications.

### Core Features
- **AI Integration**: Uses Replit AI (OpenAI GPT-5 compatible) for estimate and invoice narrative generation, and report queries. Features rate limiting and provider auto-detection.
- **Estimate Management**: Excel/CSV import/export, AI-driven text export, status-based locking, optional resource assignment copying, inline editing, and custom sort order for epics and stages.
- **Rate Override System**: Hierarchical rate precedence (Manual inline > Estimate override > Client override > User default > Role default) for billing and cost rates, with temporal boundaries for client overrides.
- **Invoice & Document Management**: Automated invoice generation, PDF viewing/replacement, SOW/Change Order document handling, milestone-based invoicing, and automatic inclusion of expense receipt images. Tax rates configurable per batch.
- **Expense Approval Workflow**: Comprehensive approval system with finite state machine and role-based access control. Includes automated per diem calculation with GSA federal rates. Email notifications via Outlook/Microsoft Graph API.
- **Resource Management & Capacity Planning**: Dual List and Timeline views, capacity summary dashboard, color-coded utilization, conflict detection, enhanced filtering, cross-project resource dashboard, and "My Assignments" for employees.
- **Budget & SOW Management**: Project budgets tied to explicit SOW uploads.
- **Time Tracking**: Enhanced with assignment/allocation linking and mobile optimizations. Time reminders are sent only to users with active project engagements (not marked as "complete").
- **Project Engagement Tracking**: Tracks user's overall involvement status (active/complete) on projects, separate from individual assignment status. Auto-creates engagements when users receive assignments, with manual completion by self/admin/PM.
- **Microsoft Planner Integration**: Bidirectional sync between project assignments and Microsoft Planner tasks. Uses hybrid authentication: Outlook connector (delegated) for interactive operations (listing groups/plans), and optional app-only credentials for background sync. Multi-tenant ready with `tenant_microsoft_integrations` table supporting publisher app or BYOA (bring-your-own-app) scenarios. Requires `PLANNER_TENANT_ID`, `PLANNER_CLIENT_ID`, and `PLANNER_CLIENT_SECRET` for background sync.
- **Vocabulary Management**: Hierarchical terminology management.
- **Tax Management**: Configurable tax rates per invoice batch (default 9.3%).

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets).
- **PDF Generation**: Puppeteer with system Chromium.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Online, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client (Replit Connector integration).
- **AI Integration**: Replit AI (OpenAI GPT-5 compatible API), Azure OpenAI.
- **Per Diem Rates**: GSA Per Diem API.

## Design Documentation

### Active Design Documents
- **Multi-Tenancy Architecture**: `docs/design/multi-tenancy-design.md` - Comprehensive design for converting Constellation to multi-tenant SaaS platform. Includes service plans (Trial, Team, Enterprise, Unlimited), 60-day data retention, co-branding support, subdomain routing for Enterprise/Unlimited, and migration strategy for production continuity.
- **Microsoft 365 Project Integration**: `docs/design/microsoft-365-project-integration.md` - Teams/Channel creation, Planner sync, 6-8 weeks estimated.

### Planned Architecture Changes
- **Multi-Tenancy (P1 Backlog)**: 13-17 week implementation to enable SaaS subscription model. Key decisions: remix codebase for parallel development, maintain Synozur production during transition, 60-day data retention, subdomain routing as premium feature.
- **Two-Tier Role System**: Platform roles (user, constellation_consultant, constellation_admin, global_admin) + Tenant roles (existing: admin, billing-admin, pm, employee, executive).