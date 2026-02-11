# Constellation Changelog

**Synozur Consulting Delivery Platform (SCDP)**

Version history and release notes for Constellation, organized from newest to oldest releases.

---

## Table of Contents

1. [Current Version](#current-version)
2. [Recent Releases](#recent-releases)
3. [Version History](#version-history)
4. [Upgrade Notes](#upgrade-notes)

---

## Current Version

### Version 1.2026.02.11 (February 11, 2026)

**Release Date:** February 11, 2026  
**Status:** Production Release  
**Codename:** Year-over-Year Analytics

This release adds powerful year-over-year comparison capabilities to the Invoice Report, enabling side-by-side financial analysis of current and prior year performance with quarter-level granularity.

#### ✨ New Features

**Invoice Report: Year-over-Year Comparison View**
- New "YoY Comparison" tab alongside the existing Invoice Report
- Side-by-side comparison of prior year vs current year financial metrics
- Quarter-over-Quarter breakdown table with selectable quarters (Q1-Q4 multi-select)
- Year-over-Year summary table showing all financial metrics with variance analysis
- Comparison metric cards showing Total Invoiced, Pre-Tax Amount, Amount Paid, and Outstanding with delta indicators
- Color-coded variance indicators (green for growth, red for decline) with dollar and percentage changes
- Export comparison data to Excel for offline analysis

**Invoice Report: Quick Date Filters**
- "Prior Year" button instantly sets the date range to the previous full calendar year
- "Current Year" button resets to January 1 through today
- Faster navigation between reporting periods

**Invoice Report: Clickable Invoice Numbers**
- Invoice numbers in the report table are now clickable links
- Clicking navigates directly to the full invoice batch detail page for review

---

## Recent Releases

### Version 1.2026.02.08 (February 8, 2026)

**Release Date:** February 8, 2026  
**Status:** Production Release  
**Codename:** Portfolio & Documentation Refresh

This release adds a dedicated Portfolio Timeline page, fixes a potential start date input bug, and brings the public roadmap and changelog up to date with all completed features.

#### ✨ New Features

**Portfolio Timeline Page**
- Dedicated `/portfolio/timeline` page under Portfolio Management in the sidebar
- Cross-project Gantt-style timeline for visualizing project schedules
- Accessible from both desktop sidebar and mobile navigation

#### 🐛 Bug Fixes
- Fixed potential start date input on projects — typing no longer wipes out the field mid-edit
- Fixed multiple API routes that could fail tenant isolation checks under certain conditions
- Improved deployment reliability for changelog version detection and error handling
- Fixed "What's New" modal not appearing in certain deployment configurations

#### 📚 Documentation
- Updated Roadmap to reflect all completed features (multi-tenancy, retainers, resource management, per diem, reporting, mobile optimization, AI features, Planner integration)
- Cleaned up outdated planning sections that showed completed work as "Planned" or "Future"
- Updated Changelog with comprehensive release history

---

### Version 1.2026.02.07 (February 7, 2026)

**Release Date:** February 7, 2026  
**Status:** Production Release  
**Codename:** Communication & Transparency

This release introduces AI-powered help chat, a "What's New" update notification system, in-app documentation, and improvements to expense management and per diem calculations.

#### ✨ New Features

**AI-Powered Help Chat**
- Added a floating help chat widget accessible from every page
- AI assistant answers questions about Constellation features and navigation
- Provides contextual navigation suggestions with direct links
- Understands platform capabilities including time tracking, expenses, invoicing, and reporting
- Conversation history maintained within each session

**"What's New" Update Notifications**
- Users are automatically notified about platform updates on login
- AI-generated summaries of release notes presented in a friendly, non-technical format
- Grouped highlights with emoji icons for quick scanning
- Mobile-responsive bottom-sheet design on smaller screens
- Tenant-level admin toggle to enable or disable notifications
- Per-user tracking so dismissed updates don't reappear

**In-App Documentation System**
- Added User Guide, Changelog, and Roadmap pages accessible from the sidebar
- Markdown-based content rendered with full formatting, tables, and code blocks
- Dark mode support for all documentation pages
- Navigation links from the sidebar and About page

**Contractor Expense Invoice Improvements**
- Improved expense filtering and receipt download capabilities
- Enhanced per diem rate calculations with better error handling
- More accurate GSA and OCONUS rate lookups

#### 🐛 Bug Fixes
- Fixed expense report filtering for receipt bundles
- Improved per diem calculation accuracy for edge cases
- Fixed error handling in automated client payment tracking

#### 📚 Documentation
- Created comprehensive User Guide with feature walkthroughs
- Added platform Roadmap with current priorities and future plans
- Established documentation maintenance process with versioning

---

### Version 1.2026.01.31 (January 31, 2026)

**Release Date:** January 31, 2026  
**Status:** Production Release  
**Codename:** Foundation Strengthening

This release focuses on scheduled job monitoring, automated Microsoft Planner synchronization, and enhanced QuickBooks Online export capabilities.

#### ✨ New Features

**Scheduled Jobs Monitoring System**
- Created comprehensive monitoring system for all automated jobs
- Admin UI at `/admin/scheduled-jobs` showing job execution history
- Overview cards displaying job statistics (total runs, success rate, failures)
- Run history with filtering by job type and status
- Manual trigger buttons for each scheduled job type
- Three tracked job types:
  - Expense Reminders (tenant-configurable, weekly)
  - Time Entry Reminders (system-wide, weekly)
  - Microsoft Planner Sync (automatic, every 30 minutes)

**Microsoft Planner Automatic Synchronization**
- Automatic sync every 30 minutes for all projects with `syncEnabled=true`
- Handles deleted Planner tasks by automatically recreating them
- Task creation with proper bucket mapping based on project stages
- User assignment mapping between Constellation and Azure AD users
- Bidirectional status synchronization (open/in_progress/completed ↔ percent complete)
- Date synchronization for planned start and end dates
- Task notes include Constellation project link and hours allocation
- Comprehensive error handling and logging
- Manual trigger endpoint for on-demand synchronization
- Job run history visible in scheduled jobs admin UI

**QuickBooks Online Export Enhancements**
- Enhanced to 13-column QBO Invoice IIF format
- Added support for Payment Terms, Billing Address, and Service Date
- Hierarchical Product/Service format: `Project:Type:Category`
- Improved descriptions matching printed invoice format
- Custom transaction number support (requires QBO settings enabled)

#### 🐛 Bug Fixes
- Fixed TypeScript errors in server storage layer (schema alignment issues)
- Improved error handling in Planner sync for missing Azure AD mappings
- Fixed race conditions in scheduled job execution

#### 📚 Documentation
- Updated admin documentation for scheduled jobs monitoring
- Added Microsoft Planner sync troubleshooting guide
- Enhanced QBO export format documentation

---

### Version 1.2026.01.15 (January 15, 2026)

**Release Date:** January 15, 2026  
**Status:** Production Release  
**Codename:** Multi-Tenant SaaS Platform

This major release transforms Constellation from a single-tenant application into a full multi-tenant SaaS platform, enabling multiple organizations to operate independently on shared infrastructure.

#### ✨ New Features

**Multi-Tenancy Architecture**
- UUID-based tenant IDs with complete data isolation across all tables
- Service plans: Trial, Team, Enterprise, and Unlimited tiers
- Subdomain routing for tenant-specific access
- Automatic tenant assignment on login via Azure AD tenant ID mapping, email domain matching, or default fallback
- Platform roles (`global_admin`, `constellation_admin`) for cross-tenant management
- Regular `admin` role scoped to own tenant

**Platform Administration**
- Platform admin UI at `/platform/tenants` for managing all tenants
- Service plan management at `/platform/service-plans`
- Platform-wide user management at `/platform/users`
- Airport code reference data management at `/platform/airports`
- OCONUS per diem rate management at `/platform/oconus`

**Tenant Settings & Branding**
- Tenant-specific company info and branding configuration
- Configurable invoice footer and email notification branding
- Tenant-scoped vocabulary customization
- Separate platform-wide settings (default rates, estimation factors)

**Retainer Estimate & Management**
- New retainer estimate type for monthly hour-block engagements
- Creation wizard with auto-generated monthly structure
- Optional multi-rate tiers per month (e.g., Senior at $250/hr for 35hrs + Junior at $150/hr for 20hrs)
- Rate tiers stored in `retainerRateTiers` JSONB on project stages
- Live retainer month management at project level (independent of locked estimates)
- CRUD for retainer stages via `/api/projects/:id/retainer-stages`
- UI in Contracts > Retainer tab with add/edit/delete/extend capabilities
- Month status indicators and auto-generated end-of-month payment milestones
- Utilization tracking for retainer engagements

**Project Rate Overrides**
- Project-level billing and cost rate overrides
- Accessible from Contracts > Rate Overrides tab
- Hierarchical rate precedence: project → client → role

**Resource Management & Capacity Planning**
- Dual List and Timeline views for resource allocation
- Capacity planning dashboard with utilization metrics
- Conflict detection for over-allocated resources
- Portfolio timeline for cross-project schedule visibility

#### 🔧 Improvements
- Enhanced project detail page with consolidated Contracts tab (retainers, rate overrides)
- Improved data isolation with tenant-scoped queries across all API endpoints
- Better role-based access control with five-tier hierarchy (admin, billing-admin, pm, employee, executive)

#### 📚 Documentation
- Multi-tenancy architecture documentation
- Retainer management user guide
- Platform administration guide

---

### Version 1.2025.12.15 (December 15, 2025)

**Release Date:** December 15, 2025  
**Status:** Production Release  
**Codename:** Travel & Expense Automation

This release delivers comprehensive per diem automation, advanced expense management, and mobile-optimized interfaces for field consultants.

#### ✨ New Features

**GSA Per Diem Integration (CONUS)**
- Real-time GSA API integration for per diem rates by city, state, and zip code
- Automatic rate determination across all CONUS tiers
- FY 2025/2026 rate support with automatic updates
- Travel day calculation (75% rate for partial days)
- Automatic M&IE (Meals & Incidental Expenses) calculation

**OCONUS Per Diem Support**
- Department of Defense OCONUS rate database
- Admin management interface for OCONUS locations and rates
- Integration with expense calculations for international travel

**Airport Code Reference Data**
- Database of 5,163 IATA airport codes for global airports
- Used in expense forms for travel location selection
- Managed by platform admins

**Expense Approval Workflow Enhancements**
- Comprehensive finite state machine for expense status transitions
- Role-based approval access (PM, executive, admin levels)
- Automated per diem calculation in expense entry
- Contractor expense invoices with PDF and QuickBooks-compatible CSV export
- Receipt bundle download for expense reports

**Mobile Web Optimization**
- Responsive navigation with mobile sidebar and bottom navigation
- Touch-friendly interfaces across all modules
- Mobile-responsive modals using bottom-sheet design pattern
- Optimized table views and data displays for smaller screens

**Financial Reporting**
- Revenue, cost, profit, and margin reports by client and project
- KPI summary dashboard with project health scoring
- Budget utilization metrics and variance tracking
- Role-based visibility controls for financial data
- Dynamic vocabulary labels in all report outputs

#### 🔧 Improvements
- Enhanced expense forms with location autocomplete
- Improved mobile layout for time entry and expense submission
- Better responsive design for data-heavy pages (estimates, invoices)

---

### Version 1.2025.10.11 (October 11, 2025)

**Release Date:** October 11, 2025  
**Status:** Production Release  
**Codename:** Assignment Management & Vocabulary

This major release introduces comprehensive project assignment management, organization-wide vocabulary customization, and establishes the foundation for resource management.

#### ✨ New Features

**Project Assignment Management**
- Backend API endpoints for complete assignment CRUD operations
- Assignment status workflow: open → in_progress → completed → cancelled
- Manual assignment UI integrated into Project Detail page
- Add/Edit/Delete assignments with comprehensive dialog interface
- Assign people with role, workstream, epic, and hours allocation
- Set pricing mode (billable, non-billable, internal) and billing rates
- Define assignment start/end dates with notes
- "My Assignments" page for employees to view all project allocations
- Inline status updates for assignments
- Multiple views: List and Kanban board with filtering capabilities

**Vocabulary Customization System**
- Organization-level vocabulary defaults with admin UI
- Client-level vocabulary overrides
- Project-level vocabulary overrides
- Vocabulary context API with React Provider/Hook pattern
- Cascading hierarchy: Project → Client → Organization → System defaults
- Complete integration across all modules:
  - Estimates module (55 dynamic vocabulary references)
  - Projects module with automatic inheritance on creation
  - Time entry module
  - Invoice module
  - Expense module

**Code Quality & Organization**
- Fixed 11 TypeScript errors in server/storage.ts
- Created test.md for test backlog tracking and sprint management
- Archived 29 legacy files (PowerShell scripts, recovery scripts, corrupted files)
- Merged development commands to replit.md
- Established organized archive structure

#### 🔧 Improvements
- Enhanced project detail page layout with assignments section
- Improved resource allocation visibility across projects
- Better role-based pricing and billing rate management

#### 📚 Documentation
- Comprehensive vocabulary system documentation
- Assignment management user guide
- Updated replit.md with current development practices

---

### Version 1.2025.09.15 (September 15, 2025)

**Release Date:** September 15, 2025  
**Status:** Production Release  
**Codename:** SharePoint Integration

This release introduces Microsoft SharePoint integration for document management and establishes the foundation for Microsoft 365 ecosystem connectivity.

#### ✨ New Features

**SharePoint Document Storage**
- SharePoint container creation for projects and clients
- Automated folder structure generation
- Document upload with metadata tagging
- Document retrieval and listing APIs
- Permission management for secure access
- Integration with existing project and client workflows

**Microsoft Authentication**
- Microsoft Single Sign-On (SSO) support via Azure AD
- OAuth2 authentication flow
- Secure token management
- User profile synchronization

#### 🔧 Improvements
- Enhanced security with Azure AD integration
- Improved document organization and access control
- Better enterprise compliance capabilities

---

### Version 1.2025.08.20 (August 20, 2025)

**Release Date:** August 20, 2025  
**Status:** Production Release  
**Codename:** Financial Management

This release focuses on comprehensive financial management capabilities including invoicing, expense tracking, and reporting.

#### ✨ New Features

**Invoice Management**
- Invoice batch creation from time entries and expenses
- Support for billable hours, expenses, and fixed-fee line items
- QuickBooks Online IIF export (11-column format)
- Invoice preview and PDF generation
- Batch approval workflow
- Payment tracking and reconciliation

**Expense Management**
- Expense report creation with receipt uploads
- Multi-level approval workflow (PM → Executive)
- Expense categorization and project allocation
- Reimbursement batch processing
- Expense approval dashboard
- Receipt image storage and retrieval

**Financial Reporting**
- Project profitability analysis
- Revenue recognition tracking
- Expense analytics by category and project
- Budget vs. actual reporting
- Client financial summaries

#### 🔧 Improvements
- Enhanced rate management with project-specific overrides
- Better handling of billable vs. non-billable time
- Improved expense approval notifications

---

## Version History

### Version 1.2025.07.10 (July 10, 2025)
- **Core Platform Launch**
- Initial production release
- Project management with stages and milestones
- Client management and organization
- User management with role-based access control
- Time tracking with approval workflows
- Basic rate management
- Dashboard with project overview

### Version 1.2025.06.15 (June 15, 2025)
- **Beta Release**
- Feature complete for initial pilot
- Testing and bug fixes
- Performance optimizations

### Version 1.2025.05.01 (May 1, 2025)
- **Alpha Release**
- Core functionality implementation
- Database schema finalization
- Initial UI development

---

## Upgrade Notes

### Upgrading to 1.2026.01.31

**Database Changes:**
- New table: `scheduled_job_runs` for job execution tracking
- Ensure database migrations are run before deployment

**Configuration Updates:**
- Review scheduled job configuration in admin settings
- Verify Microsoft Graph API permissions for Planner sync
- Update QuickBooks Online export settings if using custom transaction numbers

**Breaking Changes:**
- None in this release

**Recommended Actions:**
1. Back up database before upgrading
2. Test Planner sync on a single project first
3. Verify scheduled jobs are running correctly in admin UI
4. Review QBO export format with accounting team

---

### Upgrading to 1.2025.10.11

**Database Changes:**
- New table: `project_assignments` for assignment tracking
- New table: `vocabulary_overrides` for custom terminology
- Schema updates for existing tables to support vocabulary

**Configuration Updates:**
- Set up organization-level vocabulary defaults in admin settings
- Review and configure assignment workflow settings

**Breaking Changes:**
- None, but new assignment features require user training

**Recommended Actions:**
1. Configure vocabulary defaults before rolling out to users
2. Train project managers on assignment management features
3. Migrate any existing assignment data to new schema

---

### Upgrading to 1.2025.09.15

**Database Changes:**
- New SharePoint integration tables
- Azure AD authentication tables

**Configuration Updates:**
- Azure AD application registration required
- SharePoint permissions configuration
- Update authentication environment variables

**Breaking Changes:**
- None, new features are opt-in

**Recommended Actions:**
1. Complete Azure AD app registration
2. Configure SharePoint permissions
3. Test SSO with pilot group before full rollout

---

## Release Schedule

Constellation follows a continuous delivery model with regular feature releases:

- **Major Releases:** Quarterly (includes significant new features)
- **Minor Releases:** Monthly (includes enhancements and bug fixes)
- **Patch Releases:** As needed (critical bug fixes and security updates)

Version numbers follow the format: `Major.YYYY.MM.DD`
- **Major:** Increments for significant platform changes (currently 1)
- **YYYY:** Four-digit year
- **MM:** Two-digit month
- **DD:** Two-digit day of release

---

## Support & Feedback

### Getting Help
- **Documentation:** [User Guide](/docs/user-guide/SCDP-User-Guide.md)
- **Administrator Guide:** [Admin Guide](/docs/user-guide/SCDP-Administrator-Guide.md)
- **IT Support:** ITHelp@synozur.com

### Reporting Issues
When reporting issues, please include:
- Version number (check About page)
- Steps to reproduce
- Expected vs. actual behavior
- Screenshots if applicable
- Browser type and version

### Feature Requests
Have ideas for improving Constellation? Contact your administrator or reach out to the Synozur team to discuss potential enhancements.

---

*Last Updated: February 8, 2026*  
*Maintained by: Synozur IT Team*
