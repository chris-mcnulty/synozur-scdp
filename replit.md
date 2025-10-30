# SCDP - Synozur Consulting Delivery Platform

## Overview
SCDP is a comprehensive platform designed to manage the entire lifecycle of consulting projects, from initial estimation to final billing. It streamlines operations such as time tracking, expense management, resource allocation, and automates invoice generation. The platform supports robust role-based access control and aims to enhance efficiency and provide strong management capabilities for consulting businesses. Key capabilities include improved file management with SharePoint integration, transparent quote total displays, and enhanced resource management for better capacity planning. A new feature enables milestone-based invoice generation without requiring time entries.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Typography**: Avenir Next LT Pro font family with 6 weights (Light 300, Regular 400, Italic 400, Demi 600, Bold 700, Bold Italic 700).
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
- **Storage Strategy**: Hybrid approach optimized for document type and environment.
- **Invoice PDFs**: 
  - Production: Replit Object Storage (persistent, reliable, no permission bugs)
  - Development: Local filesystem (`uploads/invoices/`) for fast testing
- **Business Documents** (receipts, contracts):
  - Production: Replit Object Storage (SharePoint has known permission bugs, avoided for business-critical documents)
  - Development: Local filesystem for immediate testing
- **Debug Documents** (SOWs, estimates, reports): SharePoint Embedded for Microsoft troubleshooting
- **Environment Detection**: Uses `REPLIT_DEPLOYMENT` and `NODE_ENV` environment variables to auto-detect production vs development.
- **Authentication**: Certificate-based authentication for SharePoint; Replit sidecar for Object Storage.
- **Functionality**: Comprehensive file validation, user-friendly error messaging, enhanced diagnostics for failures.
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

**Production Storage Fix - Replit Object Storage (October 30, 2025)**:
- **CRITICAL FIX**: Invoice PDFs now stored in Replit Object Storage in production (not local filesystem or SharePoint)
- Fixed issue where invoice PDFs downloaded fine in dev but failed in production
- Root cause: Replit's local filesystem is NOT persistent in production deployments
- SharePoint Embedded has known permission bugs - AVOIDED for business-critical documents (invoices, receipts, contracts)
- Solution: Created InvoicePDFStorage service using Replit Object Storage for production, local filesystem for dev
- New storage service automatically detects environment and routes appropriately
- Development behavior unchanged: business documents still use local storage for fast testing
- All existing production invoices must be regenerated to be stored in Object Storage
- Object Storage provides persistent, reliable storage without SharePoint permission bugs

**Invoice Batch Display & PDF Generation Fixes (October 30, 2025)**:
- **Fixed PostgreSQL array formatting error**: Replaced raw SQL `= ANY()` syntax with Drizzle's `inArray()` helper
- Invoice batches now display correctly in production (all 13 batches visible)
- **Fixed PDF generation in production**: Installed comprehensive Chromium system dependencies
  - Root cause: Missing system libraries (nss, nspr, atk, cups, gtk3, X11 libraries, etc.) in Cloud Run
  - Solution: Installed all necessary Chromium dependencies via Nix system packages
  - Uses system Chromium consistently across dev and production environments
  - Removed @sparticuz/chromium package (no longer needed with full system dependencies)
  - Environment detection: Uses REPLIT_DEPLOYMENT and NODE_ENV for production detection
- **Fixed finalized batch update restriction**: Modified updateInvoiceBatch to allow metadata updates
  - pdfFileId and payment fields can now be updated on finalized batches
  - Invoice content fields remain protected from changes on finalized batches
  - Enables PDF regeneration for finalized batches without compromising data integrity
- Enhanced error logging with [INVOICE-BATCHES] prefix for easier troubleshooting
- All invoice data remains safe in database - these were display/generation issues only

**Receipt Upload Fix - Replit Object Storage (October 30, 2025)**:
- **CRITICAL FIX**: Receipt uploads now use Replit Object Storage in production (not local filesystem)
- Fixed issue where receipts uploaded in dev but failed in production
- Root cause: Replit's local filesystem is NOT persistent in production Cloud Run deployments
- Solution: Created ReceiptStorage service with smart routing (similar to InvoicePDFStorage)
  - Production: Uses Replit Object Storage (persistent, reliable)
  - Development: Uses local filesystem (`uploads/receipts/`) for fast testing
  - Automatic environment detection via REPLIT_DEPLOYMENT and NODE_ENV
- Updated both upload and download endpoints to use new ReceiptStorage service
- Receipts are now reliably stored and retrievable in production deployments
- All new receipt uploads will automatically use correct storage for the environment

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets).
- **PDF Generation**: Puppeteer with system Chromium (Nix packages provide all necessary dependencies for Cloud Run).
- **Document Storage**: 
  - Replit Object Storage (invoice PDFs, receipts, business documents in production)
  - Microsoft SharePoint Embedded (debug documents for Microsoft troubleshooting)
  - Local filesystem (development environment only)