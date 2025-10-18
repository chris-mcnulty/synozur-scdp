# SCDP - Synozur Consulting Delivery Platform

## Recent Updates (October 2025)
### Critical Fixes (October 18, 2025)
- **SharePoint-Only File Storage**: Removed local storage fallback to ensure Copilot indexing
  - Files now ONLY upload to SharePoint Embedded (no local fallback)
  - Ensures all files are indexed by Microsoft Graph and available to Copilot
  - Upload failures surface immediately with clear error messages
  - **ACTION REQUIRED**: SharePoint authentication must be properly configured (see SharePoint Authentication Issues below)
  
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

**Next Steps** (Azure Portal Configuration Required):
1. Upload certificate to Azure App Registration:
   - Go to Azure Portal → App Registrations → SCDP-Content (198aa0a6-d2ed-4f35-b41b-b6f6778a30d6)
   - Navigate to "Certificates & secrets" → "Certificates" tab
   - Click "Upload certificate" and upload `/home/runner/workspace/certs/certificate.pem`
   - Verify thumbprint matches: `FB:AA:23:CA:DE:67:1C:19:8B:EE:FB:35:A5:33:FE:72:FD:94:7E:7B`

2. Verify API Permissions:
   - Ensure `FileStorageContainer.Selected` permission is granted with admin consent
   - Check that SharePoint (not just Graph) permissions are configured

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

### Authentication & Authorization
- **Production SSO**: Azure AD (Microsoft Entra ID) integration.
- **Development Auth**: Local email/password authentication.
- **Roles**: Five-tier hierarchy (admin, billing-admin, pm, employee, executive) with feature-based permissions. Case-insensitive email matching for SSO.

### Document Storage
- **Primary Storage**: SharePoint Embedded ONLY for file storage with environment-based container selection.
- **No Fallback**: Local storage fallback removed to ensure all files are Copilot-indexable via Microsoft Graph.
- **Functionality**: Comprehensive file validation (type, size), user-friendly error messaging, enhanced diagnostics for SharePoint failures, and robust handling for invoices, SOWs, and other project documents.

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