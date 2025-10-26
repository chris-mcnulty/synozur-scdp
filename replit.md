# SCDP - Synozur Consulting Delivery Platform

## Recent Updates (October 2025)
### Payment Milestones Feature (October 26, 2025)
**FEATURE ADDED**: Milestone-based invoice generation without time entries

**IMPLEMENTATION**:
1. **Payment Milestones Tab**: Added to project detail page with full CRUD capabilities
   - Create/edit/delete payment milestones with name, description, amount, target date
   - View invoice status (planned, invoiced, paid)
   - Role-based access: admin, billing-admin, pm can manage milestones
2. **Invoice Generation**: 
   - Generate invoice button on each planned milestone
   - Quick milestone invoice selector on Invoices tab
   - Creates invoice batches with milestone amount only (no time entries)
   - Only admin and billing-admin roles can generate invoices
3. **API Endpoints**:
   - GET `/api/projects/:projectId/payment-milestones` - List payment milestones
   - POST `/api/payment-milestones` - Create payment milestone
   - PATCH `/api/payment-milestones/:id` - Update payment milestone
   - DELETE `/api/payment-milestones/:id` - Delete payment milestone
   - POST `/api/payment-milestones/:milestoneId/generate-invoice` - Generate invoice from milestone

**CRITICAL FIXES** (October 26, 2025):
1. **getProjectMilestones Query Fix**: Changed from INNER JOIN with projectEpics to direct projectId filtering
   - Issue: INNER JOIN excluded payment milestones without epics (projectEpicId is optional for payment milestones)
   - Fix: Query directly by projectId to return ALL milestones including standalone payment milestones
   - Location: `server/storage.ts` lines 2178-2186
2. **Invoice Status Update**: Backend now updates milestone.invoiceStatus to 'invoiced' after invoice generation
   - Uses storage.updateProjectMilestone() method for consistency
   - Location: `server/routes.ts` lines 3666-3673
3. **Cache Invalidation**: Frontend invalidates project-specific payment milestone cache after invoice generation
   - Invalidates both `/api/payment-milestones/all` and `/api/projects/${projectId}/payment-milestones`
   - Location: `client/src/pages/billing.tsx` lines 244-248

**USE CASE**: Enables milestone-based billing for fixed-price projects without requiring time entries for invoicing

**ADMIN STORAGE DIAGNOSTICS**: Enhanced `/admin/sharepoint` page with storage information display
- Shows active storage strategy (Smart Routing)
- Displays routing rules (local vs SharePoint by document type)
- File counts by storage type with breakdown by document type
- Files awaiting migration tracker
- Real-time refresh capability via `/api/files/storage-info` endpoint

### SharePoint Embedded Container Creation (October 23, 2025)
**PROBLEM SOLVED**: Old container IDs were regular SharePoint site IDs, not SharePoint Embedded containers

**ROOT CAUSE**: The configured container IDs pointed to standard SharePoint document libraries, which are NOT compatible with SharePoint Embedded API endpoints. This caused "not supported for AAD accounts" errors.

**SOLUTION**:
1. **Created Proper SharePoint Embedded Containers** via Graph API:
   - Development: `b!Q_qADAIca0Cu-aeuOgslQqfLWKB8--ZHsUm3tyOlZDdG6n9Ubkb3QIkp93khRfOV`
   - Production: `b!12MPrLRMzku_C6l3KdqLjKfLWKB8--ZHsUm3tyOlZDdG6n9Ubkb3QIkp93khRfOV`
2. **Added Admin Container Creator Endpoint**: `/api/admin/create-container` for creating new containers on-demand
3. **Container Type Registration**: Ensured containerTypeId `358aba7d-bb55-4ce0-a08d-e51f03d5edf1` is registered with tenant

**CONFIGURATION REQUIRED**:
- Update Replit secrets:
  - `SHAREPOINT_CONTAINER_ID_DEV` → `b!Q_qADAIca0Cu-aeuOgslQqfLWKB8--ZHsUm3tyOlZDdG6n9Ubkb3QIkp93khRfOV`
  - `SHAREPOINT_CONTAINER_ID_PROD` → `b!12MPrLRMzku_C6l3KdqLjKfLWKB8--ZHsUm3tyOlZDdG6n9Ubkb3QIkp93khRfOV`
- Restart application after updating secrets

### Expense Date Timezone Fix (October 23, 2025)
**ISSUE**: Expense dates displaying one day earlier than selected due to UTC timezone conversion

**SOLUTION**: Fixed Date object creation to prevent timezone shifts:
- Display dates: Append `'T00:00:00'` to YYYY-MM-DD strings for local timezone interpretation
- Calendar selection: Append `'T12:00:00'` to ensure correct date highlighting in date picker
- Affected areas: Expense list display, date picker button, calendar component

### Previous SharePoint Fixes (October 23, 2025)
**Container Registration & Permissions**:
1. **Comprehensive Setup Documentation**: Created `AZURE_APP_PERMISSIONS_SETUP.md` with step-by-step instructions
2. **Container Registration Service**: Added automatic container type registration on app startup
3. **Admin Endpoints**: Added `/api/admin/register-container-type` and `/api/admin/container-registration-status` for manual control
4. **Enhanced Error Messages**: File upload errors now reference setup documentation

**Azure Portal Configuration**:
- SharePoint Embedded requires permissions from BOTH:
  - ✅ Microsoft Graph: `FileStorageContainer.Selected` (configured)
  - ✅ SharePoint Online: `Container.Selected` (configured)
- See `AZURE_APP_PERMISSIONS_SETUP.md` for complete setup details

### Smart File Storage Routing (October 26, 2025)
**BUSINESS REQUIREMENT**: Enable receipt/invoice/contract uploads this week while SharePoint troubleshooting continues

**SOLUTION**: Implemented smart routing with document-type-based storage selection
- ✅ **Business documents → Local**: Receipts, invoices, contracts go to local storage for immediate use
- ✅ **Debug documents → SharePoint**: SOWs, estimates, reports continue using SharePoint for Microsoft troubleshooting
- ✅ **Migration tracking**: Files stored locally are tagged with `LOCAL_STORAGE` for future migration
- ✅ **Zero downtime**: Users can upload critical documents immediately
- ✅ **Parallel troubleshooting**: Non-critical documents still test SharePoint integration
- ✅ **Transparent operation**: All file operations work seamlessly across both storage types
- ✅ **Admin diagnostics**: `/api/files/storage-info` endpoint shows routing rules and file counts by type

**ROUTING RULES**:
- **Local Storage**: `receipt`, `invoice`, `contract`
- **SharePoint Embedded**: `statementOfWork`, `estimate`, `changeOrder`, `report`

**MIGRATION PLAN**:
1. **Current state**: Business docs → Local, Debug docs → SharePoint for troubleshooting
2. **Next step**: Complete SharePoint Embedded container type permission registration
3. **Migration**: Run migration script to transfer local files to SharePoint (see `FILE_MIGRATION_PLAN.md`)
4. **Final state**: All files in SharePoint Embedded for Copilot indexing

### Previous Fixes (October 18, 2025)
- **File Repository Path Consistency**: Fixed folder path formatting for SharePoint
  - Added leading slashes to all folder paths (`/receipts`, `/invoices`, etc.)
  - Ensures upload and listing operations use consistent paths

### SharePoint Authentication Configuration
**Certificate-Based Authentication** (IMPLEMENTED - October 18, 2025)
- ✅ Generated self-signed certificate for Azure AD authentication
- ✅ Certificate private key stored securely in `AZURE_CERTIFICATE_PRIVATE_KEY` secret
- ✅ Certificate thumbprint stored in `AZURE_CERTIFICATE_THUMBPRINT` secret
- ✅ Application updated to use certificate authentication (preferred over client secrets)
- ✅ Certificate files protected in `.gitignore` to prevent Git exposure
- ✅ Certificate thumbprint verified: `FB:AA:23:CA:DE:67:1C:19:8B:EE:FB:35:A5:33:FE:72:FD:94:7E:7B`

**Diagnostic Logging**:
- SharePoint operations include detailed logging with `[SharePointStorage]` and `[GraphClient]` prefixes
- Authentication method logged on startup (certificate vs client-secret)
- Request failures include status codes, error messages, and sanitized URLs

## Overview
SCDP is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from initial estimation to final billing. It streamlines operations such as time tracking, expense management, resource allocation, and automates invoice generation. The platform supports robust role-based access control and aims to enhance efficiency and provide strong management capabilities for consulting businesses. It includes features for managing rate structures and ensuring data integrity, particularly around estimates and project structures. Key capabilities include improved file management with SharePoint integration, transparent quote total displays, and enhanced resource management for better capacity planning.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Routing**: Wouter.
- **State Management**: TanStack Query for server state.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Refactored estimate detail tables for clarity, mobile-optimized interfaces, responsive navigation with hamburger menus, alphabetically sorted dropdowns, and reorganized navigation by user persona (e.g., "My Workspace", "Portfolio Management"). Quote totals are displayed prominently, with visual cues for overrides.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared with client).
- **Authentication**: Azure AD SSO (production) and local email/password (development).

### Database
- **Type**: PostgreSQL (Neon Database for hosting).
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates (epics, stages, activities, allocations), Time entries, Expenses, Invoices, Rate overrides, Pending receipts.

### Project Structure
- **Monorepo**: Structured into `/client` (React), `/server` (Express), and `/shared` (common types/schemas).

### Development & Running
- **Workflow Name**: "Dev Server" (use `restart_workflow` tool with this exact name)
- **Start Command**: `npm run dev` (starts Express backend and Vite frontend on same port)
- **Development Port**: Application runs on port 5000
- **Auto-restart**: Workflow automatically restarts after package installations
- **Development Login**: Always use local auth (admin@synozur.com / demo123), NEVER Azure SSO in Replit development environment

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID) integration.
- **Development Auth**: Local email/password authentication.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions. Case-insensitive email matching for SSO.

### Document Storage
- **Storage Strategy**: Smart Routing (Document-type-based) - Implemented October 26, 2025
- **Business Documents**: Receipts, invoices, contracts → Local filesystem storage
- **Debug Documents**: SOWs, estimates, reports → SharePoint Embedded (for Microsoft troubleshooting)
- **Environment Selection**: DEV/PROD containers based on `REPLIT_DEPLOYMENT` environment variable
- **Migration Tracking**: Files stored locally are tagged with `LOCAL_STORAGE` for future migration
- **Functionality**: Comprehensive file validation (type, size), user-friendly error messaging, enhanced diagnostics for SharePoint failures, and robust handling for all document types.
- **Migration Plan**: See `FILE_MIGRATION_PLAN.md` for transfer strategy when SharePoint is fully operational

### Data Integrity
- **Estimate Preservation**: Estimates are preserved and unlinked upon project deletion.
- **Project-Estimate Workflow**: Supports creation, deletion, and revision of projects from estimates without data loss.
- **Project Structure Independence**: Project structures are copied from estimates, allowing independent modifications.

### Core Features
- **Estimate Management**: Excel/CSV import/export, AI-driven text export, status-based locking, flexible CSV import, optional resource assignment copying. Inline editing for estimate details.
- **Invoice & Document Management**: Automated invoice generation, PDF viewing/replacement, SOW/Change Order document upload/download/replacement.
- **Resource Management & Capacity Planning**: Dual List and Timeline views, capacity summary dashboard, color-coded utilization, conflict detection, enhanced filtering, and a cross-project resource dashboard. Employees have a personalized "My Assignments" dashboard.
- **Budget & SOW Management**: Project budgets are tied to explicit SOW uploads.
- **Time Tracking**: Enhanced with assignment/allocation linking and mobile optimizations.
- **Vocabulary Management**: Hierarchical terminology management.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets for Neon).
- **Document Storage**: Microsoft SharePoint Embedded.