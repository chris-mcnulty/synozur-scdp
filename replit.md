# SCDP - Synozur Consulting Delivery Platform

## Overview
SCDP is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from initial estimation to final billing. It streamlines operations such as time tracking, expense management, resource allocation, and automates invoice generation. The platform supports robust role-based access control and aims to enhance efficiency and provide strong management capabilities for consulting businesses. Key capabilities include improved file management with SharePoint integration, transparent quote total displays, and enhanced resource management for better capacity planning. A new feature enables milestone-based invoice generation without requiring time entries.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Refactored estimate detail tables for clarity, mobile-optimized interfaces, responsive navigation, alphabetically sorted dropdowns, and reorganized navigation by user persona. Quote totals are displayed prominently, with visual cues for overrides.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared with client).
- **Authentication**: Azure AD SSO (production) and local email/password (development).

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses, Invoices, Payment Milestones, Rate overrides, Pending receipts.

### Project Structure
- **Monorepo**: Structured into `/client` (React), `/server` (Express), and `/shared` (common types/schemas).

### Development & Running
- **Workflow Name**: "Dev Server"
- **Start Command**: `npm run dev` (starts Express backend and Vite frontend on same port)
- **Development Port**: Application runs on port 5000
- **Development Login**: Always use local auth (admin@synozur.com / demo123), NEVER Azure SSO in Replit development environment

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID) integration.
- **Development Auth**: Local email/password authentication.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Document Storage
- **Storage Strategy**: Smart Routing (Document-type-based).
- **Business Documents**: Receipts, invoices, contracts are stored in local filesystem.
- **Debug Documents**: SOWs, estimates, reports use SharePoint Embedded.
- **Environment Selection**: DEV/PROD containers based on `REPLIT_DEPLOYMENT` environment variable.
- **Authentication**: Certificate-based authentication for SharePoint.
- **Functionality**: Comprehensive file validation, user-friendly error messaging, enhanced diagnostics for SharePoint failures.
- **Admin Diagnostics**: `/admin/sharepoint` page shows active storage strategy, routing rules, file counts, and files awaiting migration.

### Data Integrity
- **Estimate Preservation**: Estimates are preserved and unlinked upon project deletion.
- **Project-Estimate Workflow**: Supports creation, deletion, and revision of projects from estimates without data loss.
- **Project Structure Independence**: Project structures are copied from estimates, allowing independent modifications.

### Core Features
- **Estimate Management**: Excel/CSV import/export, AI-driven text export, status-based locking, flexible CSV import, optional resource assignment copying. Inline editing for estimate details.
- **Invoice & Document Management**: Automated invoice generation, PDF viewing/replacement, SOW/Change Order document upload/download/replacement. **Milestone-based invoice generation** with INV prefix for payment milestones.
- **Resource Management & Capacity Planning**: Dual List and Timeline views, capacity summary dashboard, color-coded utilization, conflict detection, enhanced filtering, and a cross-project resource dashboard. Employees have a personalized "My Assignments" dashboard.
- **Budget & SOW Management**: Project budgets are tied to explicit SOW uploads.
- **Time Tracking**: Enhanced with assignment/allocation linking and mobile optimizations.
- **Vocabulary Management**: Hierarchical terminology management.

### Recent Updates (October 2025)
**Payment Milestone Invoice Fixes**:
- Fixed milestone query to include payment milestones without epics (direct projectId filtering)
- Invoice batches from payment milestones now use "INV" prefix instead of "BATCH" (e.g., INV-2025-10-1234)
- Fixed milestone status validation to check `invoiceStatus` (planned/invoiced/paid) instead of `status` field
- Status updates only occur during batch finalization (not during generation) to prevent validation errors
- Cache invalidation after finalization ensures UI reflects status changes immediately

**PDF & Receipt Upload Fixes (October 29, 2025)**:
- Invoice PDF endpoints now use smart routing (local storage) instead of SharePoint
- Fixed "View PDF" authentication issue by downloading PDF first, then opening as blob URL
- PDFs save to local filesystem (`uploads/invoices/`) for reliable access
- **Receipt upload** now uses smart routing to local storage (`uploads/receipts/`)
- Fixed "Receipt upload failed" error by:
  - Using pre-loaded expense.project data instead of redundant storage.getProject() call
  - Added text file (.txt) support for receipts (in addition to images and PDFs)
  - Fixed amount parsing with fallback to prevent NaN errors
  - Added comprehensive logging at each validation step
  - Text files skip magic byte validation (no magic bytes to check)
- Allowed receipt file types: JPEG, PNG, HEIC, HEIF, PDF, TXT
- All business document uploads (receipts, invoices, contracts) now work reliably
- Detailed diagnostics logging added for troubleshooting upload issues

**My Assignments Task Details (October 29, 2025)**:
- Added task description display to both List and Kanban views
- New "Task" column in list view showing taskDescription field
- New "Epic/Stage" column displaying epic and stage names
- Enhanced Kanban cards with task description prominently displayed
- API enhanced to join epic and stage tables, returning epicName and stageName
- Search functionality now includes task descriptions, epic names, and stage names
- Task details help users quickly identify specific work items in their assignments

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets).
- **Document Storage**: Microsoft SharePoint Embedded.