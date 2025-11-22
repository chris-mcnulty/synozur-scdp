# SCDP - Synozur Consulting Delivery Platform

## Overview
SCDP is a comprehensive platform for managing the entire lifecycle of consulting projects, from estimation to billing. It streamlines time tracking, expense management, resource allocation, and automates invoice generation. The platform features robust role-based access control, aims to enhance efficiency, and provides strong management capabilities for consulting businesses. Key capabilities include improved file management with Replit Object Storage integration, transparent quote displays, enhanced resource management for capacity planning, and milestone-based invoice generation without requiring time entries.

## Recent Changes (November 22, 2025)
- **Fixed Estimate Rate Override Validation Bug**: Corrected client-side validation in RateOverridesSection component to properly require the `effectiveStart` date field before form submission. Previously, the validation only checked for subjectId and rates, but the backend Zod schema requires effectiveStart as a non-empty string, causing validation failures.
- **Enhanced Error Handling**: Improved error message display for rate override creation/editing, with better extraction of Zod validation errors from backend responses and detailed console logging for debugging.
- **Per Diem GSA Integration (In Progress)**: Added foundation for automated per diem expense entry with GSA rate lookup:
  - Extended expense schema with per diem fields (location, GSA rates, breakdown)
  - Created GSA API service for fetching per diem rates by city/state/ZIP
  - Implemented calculatePerDiem() with correct GSA partial day rules (first/last day 75%, middle days 100%)
  - Added API endpoints: GET /api/perdiem/rates/city/:city/state/:state, GET /api/perdiem/rates/zip/:zip, POST /api/perdiem/calculate
  - Added "Per Diem" category to expense forms
  - UI work in progress (location inputs, auto-calculate button, breakdown display)

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **UI**: Radix UI components with shadcn/ui design system, styled using Tailwind CSS.
- **Typography**: Avenir Next LT Pro font family.
- **Routing**: Wouter.
- **State Management**: TanStack Query.
- **Form Handling**: React Hook Form with Zod validation.
- **UI/UX Decisions**: Refactored estimate detail tables, mobile-optimized interfaces, responsive navigation, alphabetically sorted dropdowns, reorganized navigation by user persona, prominent quote total displays with visual cues for overrides.

### Backend
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **API**: RESTful API.
- **ORM**: Drizzle ORM.
- **Validation**: Zod schemas (shared).
- **Authentication**: Azure AD SSO (production) and local email/password (development).
- **Development Server**: Vite middleware isolated using sub-app pattern to prevent catch-all routes from intercepting API endpoints. API routes (/api/*) are handled by Express routes, while all other routes forward to Vite for hot-reloading (server/index.ts lines 247-267).

### Database
- **Type**: PostgreSQL.
- **Schema Management**: Drizzle Kit.
- **Key Entities**: Users (role-based), Clients, Projects, Estimates, Time entries, Expenses (with approval workflow), Expense Reports, Reimbursement Batches, Invoices, Payment Milestones, Rate overrides (estimate-level and client-level), Pending receipts.

### Project Structure
- **Monorepo**: Structured into `/client`, `/server`, and `/shared`.

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID).
- **Development Auth**: Local email/password authentication.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions.

### Document Storage
- **Storage Strategy**: Multi-tier approach with SharePoint Online as primary storage for business documents
  - **SharePoint Online (NEW)**: Primary storage for receipts, invoices, SOWs, change orders using SharePoint Sites and Document Libraries
    - Environment-specific sites and libraries (configurable via admin settings)
    - Automatic folder organization by document type (receipts/, invoices/, sows/, changeorders/)
    - Integrated with Microsoft Graph API via Replit SharePoint connector
    - Default configuration: https://synozur.sharepoint.com/sites/RevOps/ with SCDP-Dev (dev) and SCDP-Prod (prod) libraries
  - **Replit Object Storage**: Legacy storage for production invoices and receipts (being migrated)
  - **SharePoint Embedded**: Debug/development containers (legacy)
  - **Local Filesystem**: Development fallback
- **Environment Detection**: Uses `REPLIT_DEPLOYMENT` and `NODE_ENV`.
- **Authentication**: OAuth-based for SharePoint Online (Replit connector); Certificate-based for SharePoint Embedded; Replit sidecar for Object Storage.

### Data Integrity
- **Estimate Preservation**: Estimates are preserved and unlinked upon project deletion.
- **Project-Estimate Workflow**: Supports creation, deletion, and revision of projects from estimates without data loss.
- **Project Structure Independence**: Project structures are copied from estimates, allowing independent modifications.

### Core Features
- **Estimate Management**: Excel/CSV import/export, AI-driven text export, status-based locking, optional resource assignment copying, inline editing.
- **Rate Override System**: Hierarchical rate precedence (Manual inline > Estimate override > Client override > User default > Role default) for billing and cost rates. 
  - **Client-Level Overrides**: Default billing and cost rates per client for specific roles or individuals. Applied automatically to new estimates created on or after the override's effective start date. Managed via dedicated "Rate Overrides" tab on client detail page. Supports person-specific and role-based overrides with optional date ranges.
  - **Estimate-Level Overrides**: Support role-based and person-specific rates with optional date ranges and line item scoping. Manual rate edits are preserved during recalculation. Rate overrides copy automatically when duplicating estimates. Users can create, edit, and delete estimate-level rate overrides through the UI on the estimate detail page's "Inputs" tab.
  - **Temporal Boundary**: Client overrides only apply to estimates created on or after the override's effective start date, preventing retroactive application to existing estimates.
  - **RateResolver Service**: Provides transparent rate resolution with precedence tracking and deterministic selection (most recent override by effectiveStart DESC).
- **Invoice & Document Management**: Automated invoice generation, PDF viewing/replacement, SOW/Change Order document handling. Milestone-based invoice generation with "INV" prefix. Invoice PDFs automatically include expense receipt images. Tax rates applied at batch level (default 9.3%) with automatic calculation on subtotal after discount.
- **Expense Approval Workflow**: Comprehensive approval system with finite state machine (draft → submitted → approved/rejected → reimbursed) using `expense_reports`, `expense_report_items`, and `reimbursement_batches` tables. Role-based access control for approval and processing. Only approved expenses are eligible for invoicing. Email notifications via Outlook/Microsoft Graph API for all workflow transitions.
- **Resource Management & Capacity Planning**: Dual List and Timeline views, capacity summary dashboard, color-coded utilization, conflict detection, enhanced filtering, cross-project resource dashboard, and "My Assignments" for employees.
- **Budget & SOW Management**: Project budgets tied to explicit SOW uploads.
- **Time Tracking**: Enhanced with assignment/allocation linking and mobile optimizations.
- **Vocabulary Management**: Hierarchical terminology management.
- **Tax Management**: Configurable tax rates per invoice batch (default 9.3%). Tax calculated as: taxAmount = (totalAmount - discountAmount) * (taxRate / 100). Automatically recalculated during invoice generation, aggregate adjustments, and adjustment removals.

## External Dependencies

- **Database Hosting**: Neon Database (PostgreSQL).
- **Frontend Build**: Vite.
- **UI Libraries**: Radix UI, Lucide React (icons), Tailwind CSS.
- **Data Management**: TanStack Query, React Hook Form, Date-fns.
- **Build & Runtime**: ESBuild, PostCSS, WS (WebSockets).
- **PDF Generation**: Puppeteer with system Chromium.
- **Document Storage**: Replit Object Storage, Microsoft SharePoint Embedded.
- **Email Notifications**: Outlook/Microsoft 365 via Microsoft Graph Client (Replit Connector integration).