# SCDP - Synozur Consulting Delivery Platform

## Recent Updates (December 2024)
### UX & Mobile Responsiveness Improvements
- **Desktop UX Enhancements**:
  - Refactored estimate detail table: 7 default columns with expandable rows (previously 17 columns)
  - Removed Factors tab from estimates (consolidated to system settings)
  - Created compact filter bar with horizontal layout and active filter count
  
- **Mobile Optimizations**:
  - Implemented responsive navigation with mobile hamburger menu
  - Added mobile-optimized time entry: quick hour buttons (0.5h-8h), "Today" button
  - Responsive headers and card layouts throughout

- **Navigation & Organization**:
  - Reorganized by user persona: "My Workspace", "Portfolio Management", "Financial", "Administration"
  - Estimation factors centralized in system-wide settings (Admin panel)

## Overview
SCDP is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from initial estimation to final billing. It streamlines operations such as time tracking, expense management, resource allocation, and automates invoice generation. The platform supports robust role-based access control and aims to enhance efficiency and provide strong management capabilities for consulting businesses. It includes features for managing rate structures and ensuring data integrity, particularly around estimates and project structures.

## User Preferences
Preferred communication style: Simple, everyday language.
Development workflow: Dev server requires manual restart - do not attempt automated restarts.

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
- **Current**: Local file storage for expense receipts and metadata.

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