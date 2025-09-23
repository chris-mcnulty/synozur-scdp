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

### ✅ **COMPLETED: Container Type Registration**
- **Status**: Container type successfully registered to owning app
- **Owning App**: 198aa0a6-d2ed-4f35-b41b-b6f6778a30d6
- **Registration**: Container type 358aba7d-bb55-4ce0-a08d-e51f03d5edf1 now accessible

### Ready for Development
The SharePoint Embedded infrastructure is now production-ready and positioned for:
- Expense receipt upload and management
- Document metadata assignment and retrieval
- Multi-tenant container operations
- Future expansion to invoices, statements of work, estimates, and change orders

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