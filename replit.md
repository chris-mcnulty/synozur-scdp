# SCDP - Synozur Consulting Delivery Platform

## Recent Updates (October 2025)
### Enhancements (October 17, 2025)
- **Quote Total Display in Estimate Summary**: Enhanced estimate summary to clearly show quote total vs line items total
  - When `presentedTotal` differs from calculated sum: Shows both "Line Items Total" and "Quote Total" (highlighted in blue)
  - Displays override amount: e.g., "(Override: +$3,000)" when quote total is adjusted
  - Falls back to simple "Total Amount" display when quote total matches calculated sum
  - Makes pricing overrides transparent for consulting quotes

### Bug Fixes (October 17, 2025)
- **Case-Insensitive SSO Login**: Fixed Azure SSO login to use case-insensitive email matching
  - Users like Michelle.Caldwell@synozur.com now successfully match michelle.caldwell@synozur.com in database
  - Updated SSO callback to use `LOWER()` for email comparison (was using exact match)
- **Estimate Detail White Screen**: Fixed white screen of death when viewing estimates
  - Added missing Checkbox component import to estimate-detail.tsx
- **Estimate Expanded Row Editing**: Enhanced estimate detail UX with inline editing capabilities
  - Factor field now editable inline (click to edit, Enter to save, Escape to cancel)
  - Size, Complexity, Confidence fields now visible and editable via dropdowns
  - Resource assignment dropdown now functional with automatic rate updates and recalculation
  - Fixed field name bugs: Changed from `user.fullName`/`user.rate` to correct `user.name`/`user.defaultBillingRate`
  - Changes save immediately with proper calculation of adjusted hours and total amount
  - Fixed calculation bug: Sequential attribute changes now use pending values to prevent stale calculations
- **Unassignable User Resource Management**: Admins can now manage assignments even when users become unassignable
  - Dropdown includes currently assigned users even if marked as unassignable
  - Inactive/unassignable users shown with "(Inactive)" label
  - Allows admins to reassign work from inactive users without errors

### SharePoint Embedded Integration (October 17, 2025)
- **File Storage Migration**: Migrated from local file storage to SharePoint Embedded containers
  - Development container: `b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr`
  - Production container: `b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr`
  - Environment-based container selection (DEV vs PROD)
  - SharePoint configuration re-enabled in routes.ts (was temporarily stubbed)
  
- **Invoice & Document Management**:
  - **Invoice PDF Viewing**: New endpoints to view and access invoice PDFs from SharePoint
    - View endpoint: `GET /api/invoice-batches/:batchId/pdf/view` - Opens PDF in browser (inline)
    - Exists endpoint: `GET /api/invoice-batches/:batchId/pdf/exists` - Checks if PDF exists in SharePoint
    - UI: "View PDF (SharePoint)" button on batch detail page opens PDF in new tab
    - PDFs stored with batchId as fileId for consistent lookup and Copilot indexing
  - **Invoice Replacement**: Regenerating invoices automatically deletes previous version from SharePoint before saving new PDF
  - **SOW/Change Order Documents**: Upload/download/replace functionality for Statement of Work and Change Order documents
    - Documents stored in SharePoint with proper metadata (client, project, amount, effective date)
    - Upload endpoint: `POST /api/sows/:id/upload` with multipart form data
    - Download endpoint: `GET /api/sows/:id/download`
    - UI: Upload/Replace/Download buttons in SOW table on project detail page
  
- **File Repository Enhancements**:
  - Client auto-tagged from project selection (no separate client dropdown)
  - Projects sorted alphabetically by "[Client] - [Project]" format
  - Only active projects shown in file upload interface
  
- **Time Tracking Enhancements**:
  - Added assignment/allocation dropdown to link time entries to project allocations
  - Displays allocations filtered by authenticated user

## Recent Updates (December 2024)
### UX & Mobile Responsiveness Improvements
- **Desktop UX Enhancements**:
  - Refactored estimate detail table: 7 default columns with expandable rows (previously 17 columns)
  - Removed Factors tab from estimates (consolidated to system settings)
  - Created compact filter bar with horizontal layout and active filter count
  
- **Mobile Optimizations**:
  - Implemented responsive navigation with mobile hamburger menu
  - Fixed mobile nav user display to show name or email (no longer shows "undefined undefined")
  - Added mobile-optimized time entry: quick hour buttons (0.5h-8h), "Today" button
  - Responsive headers and card layouts throughout
  - Project dropdowns (time entries & expenses) now show only active projects, sorted alphabetically, displayed as "Client - Project Name"
  - All metadata dropdowns (epic, workstream, milestone, stage) are alphabetically sorted

- **Navigation & Organization**:
  - Reorganized by user persona: "My Workspace", "Portfolio Management", "Financial", "Administration"
  - Estimation factors centralized in system-wide settings (Admin panel)

## Overview
SCDP is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from initial estimation to final billing. It streamlines operations such as time tracking, expense management, resource allocation, and automates invoice generation. The platform supports robust role-based access control and aims to enhance efficiency and provide strong management capabilities for consulting businesses. It includes features for managing rate structures and ensuring data integrity, particularly around estimates and project structures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state.
- **Form Handling**: React Hook Form with Zod validation.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared with client).
- **Authentication**: Azure AD SSO.

### Database
- **Type**: PostgreSQL (Neon Database for hosting).
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates (epics, stages, activities, allocations), Time entries, Expenses, Invoices, Rate overrides, Pending receipts.

### Project Structure
- **Monorepo**: `/client` (React), `/server` (Express), `/shared` (common types/schemas).

### Authentication & Authorization
- **SSO**: Azure AD (Microsoft Entra ID) integration.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Document Storage
- **SharePoint Embedded**: Files stored in Microsoft SharePoint containers with metadata
  - Environment-based container selection (DEV/PROD)
  - Container IDs configured via `SHAREPOINT_CONTAINER_ID_DEV` and `SHAREPOINT_CONTAINER_ID_PROD` secrets
  - Automatic folder structure by document type (receipts, invoices, contracts, etc.)
- **Legacy**: Local file storage retained as fallback

### Data Integrity Rules
- **Estimate Preservation**: Deleting a project never deletes linked estimates; they are preserved and unlinked.
- **Estimate-Project Workflow**: Allows creation, deletion, revision of projects from estimates without data loss.
- **Project Structure Independence**: Project structures are copied from estimates, not linked, allowing independent modifications.

### Core Features
- **Estimate Management**: Supports Excel import/export, AI-driven text export (non-financial), status-based locking, flexible CSV import, and optional resource assignment copying on project creation.
- **Invoice Finalization**: Comprehensive review dialog with inline editing.
- **Project Structure Transfer**: Automatic transfer of epics and stages from estimates to projects.
- **Vocabulary Management**: Hierarchical management of terminology (organization, client, project levels).
- **Project Assignments**: Assign team members with roles, hours, and workstreams; employees view personal assignments. Supports optional hours and task descriptions for allocations.
- **Estimate Archival**: Option to hide inactive estimates.
- **Project Text Export**: Generates comprehensive text summaries of project data with date filtering and role-based authorization for reporting.
- **Invoice Batches Management**: Invoice batches grouped by client on the billing page, and a dedicated "Invoices" tab on project details.
- **Resource Management & Capacity Planning**: Dual List and Timeline views for capacity, with a capacity summary dashboard, color-coded utilization, conflict detection, and enhanced filtering.
- **Cross-Project Resource Dashboard**: New comprehensive resource utilization view (`/cross-project-resource`) showing a person's assignments across all projects with timeline visualization, utilization metrics, advanced filtering (date range, client, project, status), sorting, grouping, and vocabulary integration. Role-based access: employees auto-view own data, managers/admins can select team members.
- **My Assignments**: Personal dashboard for employees to view assignments in List or Kanban views, with filtering and quick status updates.
- **Budget & SOW Management**: New projects start with zero budget; SOW value and budget history begin only upon explicit SOW upload and approval.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets for Neon).