# SCDP - Synozur Consulting Delivery Platform

## Overview
SCDP is a comprehensive consulting delivery platform designed to manage the entire lifecycle of consulting projects, from estimation to billing. It streamlines operations including time tracking, expense management, and resource allocation. The platform supports role-based access control and aims to automate invoice generation and manage rate structures, enhancing efficiency and providing robust management capabilities for consulting businesses.

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

### Core Features
- **Estimate Management**: Includes Excel import/export (with resource assignment, various import modes), AI-driven text export for presentation generation (excluding financial data), and status-based locking to prevent unauthorized modifications.
  - **CSV Import Flexibility**: Supports multiple column header formats for better compatibility:
    - "Activity" or "Description" for activity descriptions
    - "Hours" or "Base Hours" for hour values
    - Maintains backward compatibility with legacy formats
  - **Assignment Copy on Approval**: Optional checkbox during estimate approval to copy resource assignments from estimate line items to project allocations
    - Defaults to enabled (checked) for streamlined workflow
    - Only visible when "Create project from this estimate" is selected
    - Week-to-date conversion: Week numbers from estimates are converted to actual start/end dates based on project kickoff date
    - Week 1 starts on kickoff date, each week spans 7 days
    - Preserves hours, rates, roles, workstreams, and all assignment details
    - When unchecked, only project structure (epics/stages) is copied without assignments
- **Invoice Finalization**: Comprehensive review dialog with inline editing before finalization.
- **Project Structure Transfer**: Automatic transfer of epics and stages from estimates to projects.
- **Vocabulary Management**: Centralized management of terminology with organization defaults, client overrides, and project overrides, following a cascading hierarchy.
- **Project Assignments**: Allows project managers to assign team members to projects with specific roles, hours, and workstreams; employees can view personal assignments.
  - **Flexible Hours**: Hours field is optional in assignment forms (can be left blank if not yet determined)
- **Estimate Archival**: Option to hide inactive estimates from the main list while preserving all data.
- **Project Text Export**: Generates a comprehensive text summary of project data for reporting, with date range filtering and role-based authorization.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets for Neon).
## Key Features & Behaviors

### Project Text Export
- **Purpose**: Generates a comprehensive text summary of project data for copy/paste into other systems (presentations, reports, status updates)
- **Format**: Plain text (.txt) file with structured sections and formatted data
- **Content Included**:
  - **Project Header**: Name, client, status, description, start/end dates, report date range
  - **Team Assignments by Month**: Active allocations grouped by month showing person, role, workstream, hours, status, period, and notes
  - **Project Structure**: 
    - Epics and stages (with descriptions)
    - Workstreams (with descriptions and budget hours)
    - Milestones (with descriptions, target/actual dates, and status)
  - **Time Entries by Month**: Overall summary plus monthly breakdown with person-level details and individual entry lines (date, billable status, hours, description)
  - **Expenses Summary**: Total/billable amounts, expense count, breakdown by category
  - **Invoices**: All invoice batches for the client with batch ID, period (start/end dates), status, and total amount
- **Date Range Filtering**:
  - "Entire Project" - exports all project data
  - "Current Month" - filters time entries, expenses, and invoices to current month boundaries
  - "Custom Date Range" - allows specifying exact start/end dates for filtering
  - **What gets filtered**: Time entries (by date), expenses (by date), and invoices (by batch end date)
  - **Not filtered**: Project structure, team resources (allocations), and milestones are always included in full
- **UI Location**: "Export Report" button in project detail page header (next to "Edit Project" button)
- **Vocabulary Support**: Uses custom vocabulary labels (Epic/Phase/Release, Stage/Sprint/etc.) from project settings throughout the export
- **Dynamic Filename**: Pattern `{project-name}-report-{start-date}-{end-date}.txt` with sanitized project name (special characters replaced with underscores)
- **API Endpoint**: `GET /api/projects/:id/export-text?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- **Authorization**: Only accessible by admins, billing-admins, executives, or the project's PM
  - Returns 403 "You can only export projects you manage" for unauthorized users
  - Prevents unauthorized access to sensitive project data (hours, rates, expenses, invoices)
- **Use Cases**: Generate status reports, create project summaries for stakeholders, extract data for external reporting systems

### Invoice Batches Management
- **Client Grouping on Main Screen**: Invoice batches on the billing page (`/billing`) are now grouped by client for better organization
  - Single-client batches appear under their respective client headers
  - Multi-client batches appear under "Multiple Clients" section
  - Each group shows batch count
  - Groups sorted alphabetically with "Multiple Clients" at the end
  - Handles both `clientName` (string) and `clientNames` (array) data formats
- **Invoices Tab on Project Detail**: New "Invoices" tab in project analytics shows all invoice batches for the project's client
  - Displays batch ID, projects, status, payment status, dates, and amounts
  - Links to batch detail page for full information
  - Respects pricing visibility permissions (amounts masked with `***` for users without pricing access)
  - Shows loading and empty states
  - Consistent UI/UX with billing page patterns

### Resource Management & Capacity Planning
- **Dual View System**: Toggle between List and Timeline views for team capacity visualization
- **Capacity Summary Dashboard**: Four KPI cards showing:
  - Total Capacity: Aggregate weekly team hours (40hrs/person default)
  - Allocated Hours: Total hours assigned across all projects with utilization percentage
  - Available Hours: Remaining capacity for new work
  - Over-Allocated Count: Number of people exceeding 100% utilization
- **Timeline Grid View** (`/resource-management`):
  - **Visual Layout**: 12-week scrollable grid with people on Y-axis, weeks on X-axis (Monday start)
  - **Color-Coded Cells**: Utilization-based colors (gray=none, yellow=under 70%, green=70-100%, red=over 100%)
  - **Prorated Hours**: Multi-week allocations correctly distributed across weeks using calendar day proration
  - **Interactive Tooltips**: Hover to see project breakdown, hours per project, and total utilization for each week
  - **Current Week Indicator**: Visual ring highlight on current week column
- **Conflict Detection**:
  - Automatically detects when a person has multiple overlapping project assignments in the same week
  - Visual indicators: Diagonal stripe pattern, orange warning icon, conflict badge in tooltip
  - Shows count of overlapping projects in hover tooltip
- **Enhanced Filters** (Timeline View):
  - **Date Navigation**: Previous/Next buttons to scroll through time periods (4-week jumps), "Today" button to reset
  - **Utilization Threshold**: Filter people by minimum utilization percentage (0%, 50%, 70%, 85%, 100%+)
  - **Conflicts Only**: Checkbox to show only people with schedule conflicts
  - **Person Filter**: Available in both List and Timeline views
- **Capacity API** (`GET /api/capacity/timeline`):
  - Fetches all employees with their project allocations
  - Calculates per-person utilization metrics and over-allocation status
  - Supports optional query parameters: `startDate`, `endDate`, `personId`, `utilizationThreshold`
  - Returns aggregated summary metrics for dashboard cards
- **List View**: Collapsible person-grouped assignment list with project details, hours, dates, and status badges
