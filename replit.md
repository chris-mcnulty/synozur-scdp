# SCDP - Synozur Consulting Delivery Platform

## Overview

SCDP is a comprehensive consulting delivery platform built for managing the entire lifecycle of consulting projects. The system handles project estimation, time tracking, expense management, billing, and rate management for consulting teams. It provides role-based access control with different permission levels for admins, billing admins, project managers, employees, and executives.

The platform is designed to streamline consulting operations from initial project estimation through final billing, with features for resource allocation, time tracking, expense recording, and automated invoice generation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui design system
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful API with conventional HTTP methods
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Validation**: Zod schemas shared between client and server
- **Authentication**: Mock authentication system (production would use SSO)

### Database Design
- **Database**: PostgreSQL with connection pooling
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Key Entities**:
  - Users with role-based permissions
  - Clients and Projects with hierarchical relationships
  - Estimates with epics, stages, activities, and allocations
  - Time entries and expenses linked to projects and people
  - Invoice batches and billing management
  - Rate overrides for flexible pricing

### Project Structure
- **Monorepo Layout**: Client, server, and shared code in single repository
- **Shared Schema**: Common TypeScript types and Zod schemas in `/shared`
- **Client Code**: React application in `/client` directory
- **Server Code**: Express API in `/server` directory
- **Database**: Schema definitions and migrations managed centrally

### Authentication & Authorization
- **Role System**: Five-tier role hierarchy (admin, billing-admin, pm, employee, executive)
- **Permission Model**: Feature-based permissions with role inheritance
- **Access Control**: Route-level and component-level permission checks
- **Mock Implementation**: Simplified auth for demo (hardcoded admin user)

#### Test Credentials (Development Only)
For testing and demonstration purposes, the following admin credentials are available:
- **Email**: admin@synozur.com
- **Password**: P@ssw0rd123!
- **Role**: Admin (full access to all system features)

Additional test accounts:
- chris.mcnulty@synozur.com / admin123 (Admin)
- sarah.chen@synozur.com / admin123 (Admin)

### Data Flow Architecture
- **API Layer**: Express routes with middleware for auth and validation
- **Storage Layer**: Abstracted database operations through storage interface
- **Query Management**: TanStack Query for caching and synchronization
- **Form Validation**: Client-side Zod validation matching server schemas

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Database URL**: Environment-based connection configuration

### Development Tools
- **Vite**: Frontend build tool with HMR and plugin ecosystem
- **Replit Integration**: Development environment plugins and runtime error handling
- **TypeScript**: Strict type checking across entire codebase

### UI Components
- **Radix UI**: Unstyled, accessible component primitives
- **Lucide React**: Icon library for consistent iconography
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens

### Data Management
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Form state management with validation
- **Date-fns**: Date manipulation and formatting utilities

### Build & Runtime
- **ESBuild**: Fast bundling for production server builds
- **PostCSS**: CSS processing with Tailwind and Autoprefixer
- **WS**: WebSocket library for Neon database connections

## SharePoint Embedded Integration

### Current Status: **Production-Ready Infrastructure**
- **Container Type ID**: 358aba7d-bb55-4ce0-a08d-e51f03d5edf1 (production-ready, billable)
- **Dev Container ID**: b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr
- **Prod Container ID**: b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr

### Completed Infrastructure
1. **Enterprise Security Architecture**: Azure AD groups for scalable permission management
2. **Document Metadata Schema**: Comprehensive SCDP metadata with 12 fields supporting multiple document types
3. **Type-Safe Storage Layer**: Storage mapping utilities for Date/number to string conversions
4. **Environment Configuration**: Container-specific configuration with proper fallbacks
5. **API Integration**: SharePoint health checks and connectivity testing

### Technical Architecture
- **Security Model**: Azure AD groups (SCDP-Admins, SCDP-ProjectManagers, etc.) for permission management
- **Metadata Schema**: Single "Document" content type with scdp_* prefixed fields for all document types
- **Type Mapping**: Storage boundary utilities in `server/utils/storageMappers.ts` handle Date/number to string conversions
- **Configuration**: Environment-aware container selection with hardcoded production container IDs

### ✅ **PIVOTED TO LOCAL FILE STORAGE**
- **Status**: Successfully migrated from SharePoint Embedded to local file storage
- **Implementation**: Complete local file storage service with same metadata requirements
- **Database**: Updated schema to use local file paths instead of SharePoint references
- **Infrastructure**: Ready for immediate use without external dependencies

### Current Implementation
The local file storage infrastructure provides:
- Expense receipt upload and storage with comprehensive metadata
- Same document classification and metadata schema as SharePoint design  
- Local file system storage with JSON metadata files
- Full CRUD operations for file management
- Ready for expansion to invoices, statements of work, estimates, and change orders

## Known Issues & Workarounds

### Dev Server Workflow Issue (September 24, 2025)
- **Issue**: The "Start Dev Server" workflow in .replit has incorrect syntax (`args` instead of `command`) 
- **Impact**: Workflow won't execute when restarted; no logs appear
- **Root Cause**: .replit file cannot be edited directly in Replit environment
- **Workaround**: Use the provided run.js script or start server manually

#### To Start the Server:
1. **Option 1 - Use the fixed run.js script**:
   ```bash
   node run.js
   ```

2. **Option 2 - Direct tsx execution**:
   ```bash
   NODE_ENV=development npx tsx server/index.ts
   ```

3. **Option 3 - Production build**:
   ```bash
   NODE_ENV=production node dist/index.js
   ```

The server will bind to port 5000 and be accessible in Preview mode once running.

## Recent Changes

### Client Management Interface (September 2025)
- **Status**: ✅ Complete and Production Ready
- **Features Implemented**:
  1. **Client List Page** (`/clients`) with search, filtering, and embedded creation modal
  2. **Client Detail Pages** (`/clients/:id`) with comprehensive tabs:
     - Overview tab with inline editing capability
     - Projects tab showing all client projects with key metrics
     - SOWs & Change Orders tab listing all related documents
     - Invoices tab showing client-specific invoice batches
  3. **Full CRUD Operations**:
     - Create clients via embedded modal without leaving client management area
     - Edit client details directly from detail view
     - Delete clients with confirmation dialog
     - View client-specific invoice batches via dedicated API endpoint
  4. **Navigation Integration**:
     - Added "Clients" link to sidebar navigation
     - Proper routing integration in App.tsx
     - Seamless navigation between list and detail views
- **Backend Enhancements**:
  - Added client-specific API endpoints: GET/PATCH/DELETE `/api/clients/:id`
  - Added client-scoped invoice batch endpoint: GET `/api/clients/:clientId/invoice-batches`
  - Proper error handling and validation for all client operations
- **Technical Improvements**:
  - Resolved React hook violations by implementing proper backend filtering
  - Implemented type-safe mutations with TanStack Query
  - Added comprehensive form validation with proper error handling
  - Full cache invalidation for real-time data updates

## Technical Debt & Backlog

### Staff Table Removal
- **Status**: Legacy table to be removed
- **Description**: The `staff` table is a legacy system that has been superseded by the `users` table
- **Current State**: 
  - Staff table still exists in database schema
  - Staff Management UI exists at `/staff` but is hidden from navigation
  - API endpoints at `/api/staff/*` are still active
  - Estimates system uses `users` table, not `staff` table
  - Variables named `selectedStaff` and `staffId` in estimates actually reference users
- **Tasks**:
  1. Remove staff table from database schema (`shared/schema.ts`)
  2. Remove Staff Management page (`client/src/pages/staff.tsx`)
  3. Remove staff-related API endpoints from `server/routes.ts`
  4. Remove staff storage methods from `server/storage.ts`
  5. Clean up misleading variable names (e.g., `selectedStaff` -> `selectedUser`)
  6. Migrate any historical data if needed

### Persistent Invoice Storage & Cross-Module Integration
- **Status**: Planned feature - blocked pending SharePoint Embedded resolution
- **Priority**: High - critical for document management and audit trails
- **Description**: Implement comprehensive invoice document storage with automatic archiving and integration across project, client, and billing modules
- **Business Value**: 
  - Automatic invoice archiving for compliance and audit trails
  - Centralized invoice management accessible from multiple contexts
  - Client and project-specific invoice history
  - Reduced manual file management overhead
- **Technical Scope**:
  - **Database Changes**: New `invoiceDocuments` table with batch/client/project foreign keys, metadata storage, and primary document linking
  - **Storage Integration**: Extend local file storage infrastructure for invoice PDFs with organized folder structure (`/uploads/invoices/{client}/{project}/batch-{id}/`)
  - **API Layer**: New endpoints for invoice document CRUD, project/client invoice listings, and archive management
  - **Frontend Integration**: Invoice tabs in project/client detail pages, invoice archive section in billing module, document status tracking
  - **Process Automation**: Automatic invoice saving during PDF generation with transactional metadata persistence
- **Implementation Plan**:
  1. **Phase 1 - Data Model**: Define `invoiceDocuments` schema with Drizzle relations and Zod validators
  2. **Phase 2 - Storage Layer**: Extend `IStorage` interface and implement file persistence with organized directory structure
  3. **Phase 3 - API Integration**: Modify existing PDF generation flow to auto-save, add new invoice document endpoints
  4. **Phase 4 - Project Integration**: Add "Invoices" tab to project detail pages showing batch history and document access
  5. **Phase 5 - Client Integration**: Add invoice management to client detail pages with filtering and download capabilities
  6. **Phase 6 - Invoice Archive**: Create dedicated invoice management section in billing module with pagination and search
  7. **Phase 7 - Testing & Validation**: End-to-end testing, security validation, and performance optimization
- **Dependencies**: 
  - SharePoint Embedded issue resolution (blocking)
  - Local file storage infrastructure (completed)
  - Existing invoice PDF generation (available)
- **Acceptance Criteria**:
  - Generated invoices automatically saved to system storage
  - Invoice documents accessible from batch detail, project detail, and client detail pages  
  - Invoice archive provides searchable, filterable view of all stored invoices
  - Role-based access controls prevent unauthorized access
  - File organization supports easy backup and maintenance
  - Cross-module navigation maintains context and user workflow