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
- **Invoice Finalization**: Comprehensive review dialog with inline editing before finalization.
- **Project Structure Transfer**: Automatic transfer of epics and stages from estimates to projects.
- **Vocabulary Management**: Centralized management of terminology with organization defaults, client overrides, and project overrides, following a cascading hierarchy.
- **Project Assignments**: Allows project managers to assign team members to projects with specific roles, hours, and workstreams; employees can view personal assignments.
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
  - **Team & Resources**: Active allocations (non-cancelled) with person name, role, workstream, allocated hours, status, period, and notes
  - **Project Structure**: 
    - Epics and stages (with descriptions)
    - Workstreams (with descriptions and budget hours)
    - Milestones (with descriptions, target/actual dates, and status)
  - **Time Entries Summary**: Total/billable/non-billable hours, entry count, breakdown by person
  - **Expenses Summary**: Total/billable amounts, expense count, breakdown by category
  - **Invoices**: Batch number, period (start/end dates), status, and total amount
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
