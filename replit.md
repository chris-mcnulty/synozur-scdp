# SCDP - Synozur Consulting Delivery Platform

## Overview
SCDP is a comprehensive platform for managing the entire lifecycle of consulting projects, from estimation to billing. It streamlines time tracking, expense management, resource allocation, and automates invoice generation. The platform features robust role-based access control, aims to enhance efficiency, and provides strong management capabilities for consulting businesses. Key capabilities include improved file management with Replit Object Storage integration, transparent quote displays, enhanced resource management for capacity planning, and milestone-based invoice generation without requiring time entries.

## Recent Changes (November 30, 2025)
- **Custom Sort Order for Epics and Stages (COMPLETE)**: Added user-controlled ordering for epics and stages to ensure logical sequential grouping in reports and on-screen displays:
  - **Order Field**: Each epic and stage now has an `order` field that determines display sequence
  - **UI Controls**: Up/down arrow buttons in Structure Management tab allow reordering epics and stages
  - **Order Display**: Order numbers shown as "#1", "#2", etc. next to epic/stage names across all views
  - **Sorting Updated**: Epic Summary, Stage Summary, and all dropdown selects now sort by order field (not alphabetically)
  - **AI Export**: Text export for AI respects order-based sorting for consistent document generation
  - **Backend Support**: PATCH endpoints for epics/stages accept optional `order` parameter for order updates

- **Import Bug Fix (COMPLETE)**: Fixed CSV/Excel import creating duplicate epics and stages:
  - **Root Cause**: Stage lookup was keyed by name only, not considering parent epic. Stages with same name across different epics caused duplicates.
  - **Fix**: Stage lookup now uses composite key `epicId:stageName` to correctly identify stages within their parent epic
  - **Affected Files**: server/routes.ts (import-csv and import-excel endpoints)
  - **Data Cleanup**: Merged duplicate epics/stages in "Ready Credit Test" estimate, reassigning line items to kept records

## Recent Changes (November 23, 2025)
- **Per Diem GSA Integration (COMPLETE)**: Fully implemented automated per diem expense entry with GSA federal rate lookup:
  - **Schema Design**: Single `perDiemLocation` field stores location string (e.g., "Washington, DC" or "ZIP 20001") with separate fields for GSA meals/lodging rates and JSON breakdown
  - **GSA API Service** (server/gsa-service.ts): Fetches per diem rates by city/state or ZIP code with correct parsing of nested month-specific lodging rates
  - **Federal Rules Implementation**: Correct GSA partial day calculation (first/last day 75% M&IE, middle days 100%, lodging excludes last day)
  - **API Endpoints**: GET /api/perdiem/rates/city/:city/state/:state, GET /api/perdiem/rates/zip/:zip, POST /api/perdiem/calculate
  - **UI Features**: Per Diem Calculator with city/state or ZIP lookup, days input, "Include lodging?" checkbox (defaults OFF), Calculate button showing detailed breakdown
  - **Lodging Default**: Lodging excluded from per diem by default (checkbox unchecked) as hotels are typically direct charges - matches typical consulting expense policy
  - **Data Transform**: UI-only fields (perDiemCity, perDiemState, perDiemZip, perDiemDays, perDiemIncludeLodging, perDiemItemize) stripped before backend submission via explicit field mapping
  - **Auto-calculation**: Amount field auto-populated and disabled like mileage expenses
  - **Auto-description**: Description field auto-populated with "Travel to: [Location]\n[Breakdown]" format, user-editable after calculation
  - **Itemization Option (NEW)**: "Itemize by day component?" checkbox (defaults OFF, appears after Calculate) breaks per diem into individual daily charges:
    - Each day's meals and lodging created as separate expense entries
    - Meals use "day" unit, lodging uses "night" unit
    - Description format: "[Location]\nDay X M&IE (Partial/Full day)" or "Day X Lodging"
    - Receipt automatically attached to each itemized expense if provided
    - Single toast notification after all itemized expenses created
    - Robust error handling with user-visible feedback for failures
    - Example: 3-day trip with lodging creates 5 entries (Day 1 M&IE + Lodging, Day 2 M&IE + Lodging, Day 3 M&IE only)
  - **Error Handling**: Automatic fallback to standard CONUS rates ($59 M&IE, $98 lodging) when GSA API unavailable
  - **Security**: GSA API key stored in Replit Secrets (GSA_API_KEY)
  - **Testing**: End-to-end tested with SF ($230 meals-only) and Seattle ($886 with lodging) expenses successfully created and appearing in expense list

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