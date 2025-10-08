# SCDP - Synozur Consulting Delivery Platform

## Overview

SCDP is a comprehensive consulting delivery platform designed to manage the entire lifecycle of consulting projects. It streamlines operations from estimation to billing, encompassing time tracking, expense management, and resource allocation. The platform supports role-based access control for various user types (admins, project managers, employees, executives) and aims to automate invoice generation and manage rate structures. SCDP's core purpose is to enhance efficiency and provide robust management capabilities for consulting businesses.

## User Preferences

Preferred communication style: Simple, everyday language.
Development workflow: Dev server requires manual restart - do not attempt automated restarts.

## Testing Credentials

For development testing, use the following login credentials:
- Email: chris.mcnulty@synozur.com
- Password: demo123
- Do NOT use SSO login (doesn't work in dev environment)

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

### Data Flow
- **API Layer**: Express routes with auth/validation middleware.
- **Storage Layer**: Abstracted database operations.
- **Query Management**: TanStack Query for caching and synchronization.
- **Validation**: Client-side Zod mirroring server schemas.

### Document Storage
- **Current**: Local file storage for expense receipts and metadata, expandable for invoices, SOWs, and change orders.
- **Deprioritized**: SharePoint Embedded infrastructure exists but is not actively used.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets for Neon).

## Key Features & Behaviors

### Estimate Excel Import/Export
- **Export**: Includes resource names for all line items
- **Import**: Reads resource names and automatically assigns users by matching names (case-insensitive)
- **Import Modes**: 
  - "Remove and Replace" - clears existing items before import
  - "Keep and Add" - appends imported items to existing ones
- **Column Flexibility**: Handles both admin exports (with Cost Rate) and non-admin exports
- **Bulk Editing**: Users can export an estimate, modify resource assignments in Excel, and import to a new estimate to preserve resourcing

### Estimate AI Text Export
- **Purpose**: Generates a hierarchical text export suitable for generative AI to create presentations and SOWs
- **Format**: Plain text (.txt) file with clear hierarchical structure
- **Content Included**: 
  - Estimate metadata (name, client, dates)
  - Complete project structure (Epics → Stages → Line items with descriptions and comments)
  - Milestones with descriptions and due dates
  - Unassigned line items (at epic level or estimate level)
- **Content Excluded**: Hours, resources, rates, costs, and all financial data
- **UI Location**: "Export for AI" button in estimate detail page header
- **Vocabulary Support**: Uses custom vocabulary labels (Epic/Phase/Release, Stage/Sprint/etc.) from estimate settings
- **API Endpoint**: `GET /api/estimates/:id/export-text`
- **Filename Pattern**: `estimate-{id}-ai-export.txt`

### Invoice Finalization
- **Review Dialog**: When finalizing an invoice batch, a comprehensive review dialog displays all line items grouped by client and project
- **Inline Editing**: Each line item has an Edit button that opens the line edit dialog for making adjustments before finalizing
- **Displayed Information**: Description, quantity, rate, and amount for each line item
- **Subtotals**: Client and project subtotals are shown for easy verification
- **Finalize Action**: Once reviewed and edited, users can confirm finalization which locks the batch and time entries

### Project Structure Transfer
- **From Estimates to Projects**: When creating a project from an estimate, epics and stages are automatically transferred to the project
- **Structure Tab Display**: Project Structure tab shows epics with their nested stages (blue background, Zap icon) and milestones (Target icon)
- **API Endpoints**: `/api/projects/:projectId/epics` and `/api/projects/:projectId/stages` provide hierarchical structure data

### Vocabulary Management
- **Central Dashboard**: `/vocabulary-management` page provides unified management of all vocabulary settings
- **Organization Defaults**: Set organization-wide default terms for Epic, Stage, Activity, Workstream, and Milestone
  - **Industry Presets**: Quick-apply buttons for common industry terminology (Software Development, Consulting, Construction, Default)
  - **Auto-Inheritance**: New projects and estimates automatically inherit organization defaults unless explicitly overridden during creation
- **Client Overrides**: View and edit client-specific vocabulary that overrides organization defaults
- **Project Overrides**: View and edit project-specific vocabulary that overrides client and organization defaults
- **Cascading Hierarchy**: Project → Client → Organization → System defaults
- **Implementation Details**:
  - `createProject()` and `createEstimate()` in storage.ts use explicit null/undefined checks (`== null`, `!= null`) to inherit organization defaults
  - Only truly missing vocabulary terms are inherited; intentional falsy values are preserved
  - Error handling ensures creation proceeds even if organization vocabulary fetch fails
  - Organization vocabulary is a singleton table (one row for entire org)
- **API Endpoints**: 
  - `GET /api/vocabulary/all` - Fetch all vocabularies (org + client + project overrides)
  - `PUT /api/vocabulary/organization/selections` - Update organization default term selections (includes milestoneTermId)
  - `GET /api/vocabulary/organization/selections` - Get current organization default selections
  - `PATCH /api/clients/:id` - Update client vocabulary (vocabularyOverrides field)
  - `PATCH /api/projects/:id` - Update project vocabulary (vocabularyOverrides field)

### Estimate Status Locking
- **Purpose**: Prevents unauthorized modifications to estimates that have been finalized, sent to clients, or approved
- **Status Flow**: draft → final → sent → approved/rejected
- **Edit Protection**: Only estimates with 'draft' status can be modified
- **Backend Validation**: 
  - `ensureEstimateIsEditable()` helper checks estimate status before all mutations
  - Returns 403 error with message: "This estimate is not in draft status. Please revert it to draft to make changes."
  - Protects 18+ mutation routes: epics, stages, line items, milestones, imports, recalculations
  - Status change routes (approve/reject/finalize/revert) intentionally bypass the lock
- **Frontend Controls**:
  - `isEditable` computed variable (`estimate?.status === 'draft'`) controls all editing UI
  - Disabled when not editable: add/edit/delete buttons, bulk operations, PM wizard, recalculate
  - Always enabled: export buttons, status change buttons
- **Security**: All server-side routes validate status; frontend controls provide immediate feedback
- **User Experience**: Clear messaging directs users to revert to draft status before making changes

## Project Management

- **Master Backlog File**: `backlog.md` - Contains all project planning, current sprint work, and future enhancements

## Backlog / Future Enhancements

### Multi-Tenant Support
- **Demo Login**: Re-enable demo login functionality with proper multi-tenant account structure
  - Currently commented out in `client/src/pages/login.tsx`
  - Will require proper tenant isolation and demo account management

## Development Commands

### Server Commands
```bash
# Start development server
NODE_ENV=development npx tsx server/index.ts

# Build for production
./build.sh

# Kill dev server on port 5000
npx kill-port 5000
```

### Database Commands
```bash
# Push schema changes to database
npm run db:push

# Force push schema changes (use with caution)
npm run db:push --force
```