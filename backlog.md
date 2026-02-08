# Constellation Product Backlog

## 🐛 Active Bugs

### What's New Feature Dialog Not Showing in Production (February 8, 2026) — FIXED
- **Root cause**: Server reads `CHANGELOG.md` from `client/public/docs/` which only exists in the dev source tree. In production, the Vite build outputs to `dist/public/` and the `docs/` subdirectory was missing from the build.
- **Fix**: Added `resolveChangelogPath()` helper that checks multiple candidate paths (`client/public/docs/`, `dist/public/docs/`, `docs/`) so the server finds the file in both dev and production environments.
- **Impact**: `seedChangelogVersion()` was silently failing at startup, so `CURRENT_CHANGELOG_VERSION` was never set, causing the modal to return `showModal: false` for all users.

---

## ✅ Recently Completed (January 31, 2026)

### Scheduled Jobs Monitoring System ✅ COMPLETE
- [x] Created `scheduled_job_runs` database table for job execution tracking
- [x] Storage methods for creating, updating, and querying job runs
- [x] Admin UI at `/admin/scheduled-jobs` with:
  - [x] Overview cards showing job statistics
  - [x] Run history with filtering by job type
  - [x] Status badges (success, failed, running)
  - [x] Manual trigger buttons for each job type
- [x] Three scheduled job types tracked:
  - [x] Expense Reminders (tenant-configurable, weekly)
  - [x] Time Reminders (system-wide, weekly) 
  - [x] Planner Sync (automatic, every 30 minutes)
- [x] Job run logging includes trigger type (scheduled vs manual), user who triggered, result summary, and errors
- [x] Navigation integrated into admin sidebar and mobile menu

### Microsoft Planner Automatic Sync ✅ COMPLETE
- [x] Planner sync scheduler service running every 30 minutes
- [x] Automatic sync of all projects with `syncEnabled=true`
- [x] Handles deleted Planner tasks by recreating them
- [x] Task creation with proper bucket mapping (by stage)
- [x] User assignment mapping (Constellation user → Azure AD user)
- [x] Status synchronization (open/in_progress/completed → percent complete)
- [x] Date synchronization (planned start/end dates)
- [x] Task notes include Constellation link and hours allocation
- [x] Comprehensive error handling and logging
- [x] Manual trigger endpoint for on-demand sync
- [x] Job run history visible in admin UI

### QBO Export Enhancements ✅ COMPLETE
- [x] 13-column QBO Invoice IIF format with Terms, Billing Address, Service Date
- [x] Hierarchical Product/Service format (Project:Type:Category)
- [x] Improved descriptions matching printed invoice format
- [x] Custom transaction number support (requires QBO settings enabled)

---

## ✅ Previously Completed (Week of Oct 7-11, 2025)

### Days 1-3: Foundation & Vocabulary System
- [x] Fixed 11 TypeScript errors in server/storage.ts (schema alignment)
- [x] Created test.md for test backlog tracking and sprint management
- [x] Archived 29 legacy files (PowerShell scripts, one-time recovery scripts, corrupted files)
- [x] Merged dev commands to replit.md
- [x] Established organized archive structure

### Days 2-3: Vocabulary Customization System ✅ COMPLETE
- [x] Organization-level vocabulary defaults with admin UI
- [x] Client and project-level vocabulary overrides
- [x] Vocabulary context API and VocabularyProvider/useVocabulary hook
- [x] Cascading hierarchy (Project → Client → Organization → System defaults)
- [x] Complete integration across all modules:
  - [x] Estimates module (55 dynamic vocabulary references)
  - [x] Projects module with inheritance on creation
  - [x] Time entry module
  - [x] Invoice module
  - [x] Expense module

### Days 4-5: Project Assignments & Resource Management ✅ COMPLETE
- [x] Backend API endpoints for assignment CRUD operations
- [x] Assignment status workflow (open → in_progress → completed → cancelled)
- [x] Manual assignment UI in Project Detail page
  - [x] Add/Edit/Delete assignments with dialog
  - [x] Assign people with role, workstream, epic, hours allocation
  - [x] Set pricing mode and billing rates
  - [x] Define assignment dates and notes
- [x] My Assignments page for employees
  - [x] View all assignments across active projects
  - [x] Update assignment status inline
  - [x] List and Kanban views with filtering
- [x] Fixed API endpoints and validation for manual assignments
- [x] Documentation updated in replit.md

## 🚨 P0 - CRITICAL GAPS (This Week - Oct 11, 2025)

### Project Reporting & Analytics (Day 6) - REMAINING THIS WEEK
**Status:** ESSENTIAL - Data exists but no comprehensive reporting API

**Why P0:** Leaders need visibility into project performance, resource allocation, and financial health.

**Scope:**
- [ ] **Day 6: Comprehensive Reporting API**
  - Project list with filters (status, date range, PM, client)
  - Cost vs revenue analysis (excluding cost rates for non-admins)
  - Budget utilization metrics
  - Resource allocation summaries
  - Time entry aggregations by project/person/period
  - Uses vocabulary labels dynamically
  
**Timeline:** Day 6 (this week)

---

## 🔔 P1 - HIGH PRIORITY (Weeks 3-4)

### Comprehensive Notifications System
**Status:** MISSING - Moved from P0 to make room for critical assignment management

**Why P1:** Important for user engagement and operational efficiency, but not blocking core operations.

**Summary:**
- In-app notification center with bell icon, dropdown, and full page view
- Email notifications via SendGrid integration
- User preferences with granular controls per notification type
- System-wide admin controls to enable/disable notification types globally

**Key Features:**
- Time entry reminders (requires project staffing feature)
- Expense approval requests ($500+ threshold)
- Expense status updates (approved/rejected)
- Invoice batch status notices
- Budget threshold alerts
- Project deadline reminders

**Timeline:** 4-6 weeks (see detailed plan for phased approach)

**[→ View Full Implementation Plan](./notifications-plan.md)**

### Commercial Schemes Implementation
*Note: Database fields exist but business logic is missing*

- [ ] **Retainer/Drawdown Tracking**
  - Pre-paid retainer balance management
  - Post-paid retainer invoicing
  - Automatic drawdown from time/expenses
  - Balance threshold alerts
  - Top-up change order support
  - Monthly retainer reconciliation reports
  - Retainer aging analysis
  
- [ ] **Milestone Fixed Fee Management**
  - Milestone definition with acceptance criteria
  - Percentage complete tracking
  - Milestone payment scheduling
  - Partial milestone billing support
  - Milestone variance reporting
  - Client acceptance workflow
  
- [ ] **Time & Materials (T&M) Billing**
  - Rate calculation at service date
  - Rate precedence rules implementation
  - Effective discount display
  - Not-to-exceed (NTE) budget tracking
  - T&M profitability analysis
  - Progress-to-budget reporting

### Pricing Privacy & Rate Management
- [ ] **Rack vs Charge Rates**
  - Separate rack rates (internal) from charge rates (client-facing)
  - Rate margin calculations
  - Discount percentage tracking
  - Effective rate reporting
  
- [ ] **Rate Precedence System**
  - Project-specific rates (highest priority)
  - Client-specific rates
  - Role-based standard rates (lowest priority)
  - Effective date management
  - Rate grandfathering for existing engagements
  
- [ ] **Field-Level Security**
  - Hide cost rates from non-admin roles
  - Restrict margin visibility
  - Protect rack rates from client-facing reports
  - Audit trail for rate changes

### Advanced Vocabulary Features (Future)
*Note: Core vocabulary system with org/client/project overrides completed in P0 Days 2-3*

- [ ] **Advanced Export & Template Customization**
  - PDF templates with custom terminology
  - Email notification templates using client vocabulary
  - Excel exports with client-specific column headers
  
- [ ] **Multi-Language Support**
  - Translate vocabulary terms to multiple languages
  - Language preference per user
  - Locale-aware terminology
  
- [ ] **Industry Preset Templates**
  - Pre-configured vocabulary sets for different industries
  - One-click vocabulary template application
  - Industry-specific best practices

### Advanced Resource Management & Balancing
**Status:** FUTURE ENHANCEMENT - Builds on P0 assignment foundation

**Why P1:** Advanced multi-project resource optimization features that enhance the foundational assignment management completed in P0.

**Prerequisites:** P0 project assignments (Days 4-5) must be complete

**Scope:**
- [ ] **Cross-Project Workload View**
  - Unified view of each person's assignments across ALL active projects
  - Visual timeline showing concurrent project assignments
  - Capacity utilization percentage (total allocation across all projects)
  - Over-allocation alerts (>100% capacity)
  - Available capacity indicators
  
- [ ] **Resource Rebalancing Tools**
  - Drag-and-drop reassignment interface
  - Rescheduling tools to shift assignments
  - Workload rebalancing suggestions
  - Impact analysis before making changes
  - Bulk assignment operations
  
- [ ] **Assignment Bulk Import**
  - Excel/CSV bulk import for project assignments
  - Template download with required fields
  - Validation and error reporting
  - Support for role-based and person-based assignments
  
- [ ] **Capacity Planning & Analytics**
  - Team capacity dashboard
  - Utilization forecasting
  - Bench time visibility
  - Resource demand vs. supply analysis
  - Historical utilization trends

### Microsoft 365 Project Integration - PARTIALLY COMPLETE
**Status:** Planner sync implemented, Teams integration pending  
**Priority:** P1 - High priority for collaboration  
**Added:** January 2026  
**Design Document:** `docs/design/microsoft-365-project-integration.md`

**Why P1:** Seamless Microsoft 365 integration enhances team collaboration, centralizes project communications, and enables future task synchronization between Constellation and Microsoft Planner.

**Prerequisites:**
- Azure AD tenant admin approval for Graph API permissions
- Microsoft 365 Business license for Teams/Planner
- Existing Outlook connector extended or new Teams connector

**Scope:**

- [ ] **Administrative Settings**
  - System settings table additions for M365 integration toggles
  - Master toggle to enable/disable M365 integration
  - Separate toggles for Teams creation and Planner sync
  - Default Team template selection
  - Test connection functionality

- [x] **Database Schema** ✅ COMPLETE
  - `clientTeams` table: Maps clients to Microsoft Teams
  - `projectChannels` table: Maps projects to channels and Planner plans
  - `userAzureMapping` table: Links Constellation users to Azure AD accounts
  - `plannerTaskSync` table: Tracks task sync status per allocation

- [ ] **Microsoft Teams Integration**
  - Automatic Team creation for new clients (first project)
  - Channel creation for subsequent projects in existing client Teams
  - SharePoint site provisioning with Team
  - Team member management (add/remove based on assignments)

- [x] **Microsoft Planner Integration (Phase 1: One-Way Sync)** ✅ COMPLETE
  - Create Planner plan per project
  - Stage-based buckets (not weekly - based on project stages)
  - Task creation from allocations (one task per assignment)
  - Sync status tracking and error handling
  - Automatic 30-minute sync scheduler for enabled projects
  - Manual sync trigger via admin UI
  - Deleted task detection and recreation

- [ ] **Microsoft Planner Integration (Phase 2: Bidirectional Sync)**
  - Microsoft Graph webhooks for change notifications
  - Planner-to-Constellation sync logic
  - Conflict resolution for simultaneous edits
  - Audit trail for sync activities

- [ ] **Project Creation UI Enhancement**
  - M365 integration options in project creation dialog
  - Smart detection: "First project for client" vs "Add to existing Team"
  - Checkbox options for Teams, Planner, auto-member management
  - Visual preview of what will be created

- [x] **Project Detail M365 Tab** ✅ PARTIAL
  - Links to Team, Channel, SharePoint site, Planner
  - Sync status display with manual sync button
  - [x] Planner connection UI with sync toggle
  - [ ] Team member mapping status with retry for failures
  - [ ] External user handling for non-Azure AD consultants

**Dependencies:**
- Extended Microsoft Graph permissions (Team.Create, Channel.Create, Tasks.ReadWrite, etc.)
- Existing Outlook connector or new Teams connector
- User email matching between Constellation and Azure AD

**Timeline:** 4-6 weeks remaining (Teams integration only)  
**Complexity:** High (multiple Microsoft Graph APIs, sync logic, error handling)

### Multi-Tenancy Architecture - NEW
**Status:** DESIGN COMPLETE - Ready for implementation  
**Priority:** P1 - High priority for SaaS enablement  
**Added:** January 2026  
**Design Document:** `docs/design/multi-tenancy-design.md`

**Why P1:** Converts Constellation from single-tenant to multi-tenant SaaS platform, enabling software subscription offerings in 6-12 months. Modeled after Vega's proven multi-tenant architecture.

**Service Plans:**
| Plan | Users | Billing | Features |
|------|-------|---------|----------|
| Trial | 5 | 30-60 days free | Core features, AI, basic branding |
| Team | 5+ (tiers) | Monthly/Annual | Full features, co-branding, SharePoint |
| Enterprise | Generous tiers | Annual | SSO, custom subdomain, priority support |
| Unlimited | Unlimited | Internal | Synozur + priority accounts |

**Key Design Decisions:**
- **Data Retention**: 60 days after trial/subscription expiration
- **Co-Branding**: Supported on all paying plans (logo, colors)
- **Subdomain Routing**: Premium option for Enterprise/Unlimited (`clientname.constellation.synozur.com`)
- **Migration Strategy**: Remix codebase for parallel development, data migration path maintains production continuity

**Scope:**

- [ ] **Phase 1: Foundation (3-4 weeks)**
  - Create multi-tenant schema tables (tenants, tenantUsers, servicePlans, tenantPlans)
  - Add tenantId column to all existing tables
  - Create Synozur as initial tenant
  - Backfill existing data with Synozur tenant ID
  - Add tenant middleware layer

- [ ] **Phase 2: User & Auth (2-3 weeks)**
  - Create tenantUsers table for multi-tenant membership
  - Migrate existing users to tenantUsers
  - Add platform roles (user, constellation_consultant, constellation_admin, global_admin)
  - Update authentication flow with tenant context
  - Add tenant switcher UI

- [ ] **Phase 3: Tenant Admin (2-3 weeks)**
  - Build Tenant Admin pages (users, settings, branding)
  - Implement co-branding (logo, colors)
  - Per-tenant SSO configuration
  - Per-tenant vocabulary
  - User invitation system

- [ ] **Phase 4: Platform Admin (2 weeks)**
  - Build Platform Admin pages
  - Service plan management (Trial, Team, Enterprise, Unlimited)
  - Tenant monitoring dashboard
  - Blocked domains management
  - Consultant access management

- [ ] **Phase 5: Subdomain Routing (1-2 weeks)**
  - Subdomain detection middleware
  - Wildcard DNS and SSL configuration
  - Tenant-specific login pages
  - Subdomain assignment for Enterprise/Unlimited

- [ ] **Phase 6: Self-Service & Plans (2-3 weeks)**
  - Signup flow with domain detection
  - Onboarding wizard
  - Trial plan logic (30/60 days)
  - Plan expiration and grace period handling
  - Data retention enforcement (60 days)

- [ ] **Phase 7: Polish & Testing (2 weeks)**
  - Security audit (tenant isolation)
  - Performance optimization
  - Documentation updates

**Migration Strategy:**
1. **Remix Approach**: Fork codebase for parallel multi-tenant development
2. **Schema First**: Add nullable tenantId columns (backward compatible)
3. **Data Migration**: Backfill existing data to Synozur tenant
4. **Code Cutover**: Deploy multi-tenant version with minimal disruption
5. **Rollback Ready**: 15-minute rollback if issues arise

**Dependencies:**
- Vega architecture reference
- Database schema planning complete
- Production continuity requirements

**Timeline:** 13-17 weeks (phased implementation)  
**Complexity:** Very High (schema changes, auth refactoring, data migration, production continuity)

---

## 📊 P2 - IMPORTANT FEATURES (Weeks 5-8)

### "What's New" Changelog Modal - NEW
**Status:** BACKLOG - Designed, Ready for Implementation  
**Added:** February 7, 2026  
**Priority:** P2 - Important UX Enhancement  
**Complexity:** Medium (schema changes, frontend modal, admin setting, AI summary generation)

**Overview:**  
Present users with a formatted summary of new features/changes on their next login after a changelog update. Users dismiss the modal once and don't see it again until the next notable update. Controlled by a tenant-level admin setting (on by default, can be switched off).

**Design:**

#### Database Schema Changes

**Table: `users` — New column:**
- [ ] `lastDismissedChangelogVersion` (varchar, nullable) — Stores the changelog version string (e.g., "1.2026.02.07") the user last dismissed. When `null`, the user hasn't dismissed any changelog modal yet.

**Table: `tenants` — New column:**
- [ ] `showChangelogOnLogin` (boolean, default `true`) — Tenant-level toggle. When `true`, users in this tenant see the What's New modal. Tenant admins can switch it off in System Settings.

**Table: `system_settings` — New entry:**
- [ ] `CURRENT_CHANGELOG_VERSION` (string) — The current changelog version string (e.g., "1.2026.02.07"). Updated when a new release is published. This is the source of truth for comparison against each user's `lastDismissedChangelogVersion`.

#### Backend API Endpoints

- [ ] `GET /api/changelog/whats-new` — Returns the What's New content for the current user:
  - Checks tenant's `showChangelogOnLogin` flag — if `false`, returns `{ show: false }`
  - Compares `CURRENT_CHANGELOG_VERSION` against user's `lastDismissedChangelogVersion` — if they match, returns `{ show: false }`
  - If new version available: parses `CHANGELOG.md` to extract the current version section, uses AI (`aiService.customPrompt()`) to generate a user-friendly summary, and returns `{ show: true, version: string, date: string, summary: string, highlights: string[] }`
  - Cache the AI-generated summary in `system_settings` as `CHANGELOG_SUMMARY_<VERSION>` to avoid regenerating on every user login
- [ ] `POST /api/changelog/dismiss` — Marks the current changelog version as dismissed for the user:
  - Updates `users.lastDismissedChangelogVersion` to current version
  - Returns `{ success: true }`
- [ ] `PATCH /api/tenants/:id/settings` — Already exists; extend to support `showChangelogOnLogin` toggle

#### Frontend Components

- [ ] **WhatsNewModal** (`client/src/components/WhatsNewModal.tsx`):
  - Modal dialog using existing shadcn `Dialog` component
  - Header: "What's New in Constellation" with version number and release date
  - Body: AI-generated summary with formatted highlights (bullet points, bold labels)
  - Footer: "Got it" dismiss button + optional "View Full Changelog" link to `/changelog`
  - Triggered on app load via `useQuery` to `GET /api/changelog/whats-new`
  - On dismiss: calls `POST /api/changelog/dismiss`, invalidates query cache
  - Only renders when `show: true` in response
  - **Mobile responsive design:**
    - On desktop: centered modal with `max-w-lg` width, comfortable padding
    - On mobile (<640px): full-width bottom sheet style using `sm:max-w-lg w-[calc(100vw-2rem)]` with reduced padding (`p-4` vs `p-6`)
    - Scrollable body with `max-h-[60vh]` so long summaries don't push the dismiss button off-screen
    - Footer buttons stack vertically on mobile (`flex-col sm:flex-row`) with full-width "Got it" button for easy thumb reach
    - Text sizes scale down on mobile: header `text-lg sm:text-xl`, body `text-sm sm:text-base`
    - Highlight bullets use compact spacing on mobile (`gap-2 sm:gap-3`)
    - Touch-friendly dismiss button with minimum 44px tap target height

- [ ] **Layout Integration** (`client/src/components/layout/layout.tsx`):
  - Add `<WhatsNewModal />` component alongside existing `<HelpChat />`
  - Only shown to authenticated users (same pattern as HelpChat)

- [ ] **Admin Setting** (System Settings page):
  - Add toggle: "Show 'What's New' to users on login" under a Notifications or Features section
  - Bound to `tenants.showChangelogOnLogin`
  - Include helper text: "When enabled, users will see a summary of new features after each platform update"

#### AI Summary Generation

- [ ] On first request for a new changelog version, parse `CHANGELOG.md` to extract the latest version section
- [ ] Send to `aiService.customPrompt()` with system prompt:
  - "Summarize these release notes into a friendly, non-technical overview for end users. Group into 3-5 highlights. Use simple language. Format as JSON: `{ summary: string, highlights: string[] }`"
- [ ] Cache the result in `system_settings` to avoid repeated AI calls
- [ ] Invalidate cache when `CURRENT_CHANGELOG_VERSION` changes

#### Version Lifecycle

1. Developer updates `CHANGELOG.md` with new version section
2. Developer/admin updates `CURRENT_CHANGELOG_VERSION` in system_settings (could be automated on deploy)
3. On next login, each user's `lastDismissedChangelogVersion` is compared against current
4. If different → modal shown with AI-generated summary
5. User clicks "Got it" → `lastDismissedChangelogVersion` updated to current version
6. User won't see modal again until next version change

#### Edge Cases & Considerations

- [ ] New users (no `lastDismissedChangelogVersion`): Show modal on first login after feature goes live
- [ ] Tenant admin disables feature: No modal for any users in that tenant, regardless of version mismatch
- [ ] AI service unavailable: Fall back to raw changelog excerpt (first 500 chars of current version section)
- [ ] Multiple rapid releases: Only the latest version matters; users who skip versions see only the current summary
- [ ] Mobile responsiveness: Full-width bottom-sheet layout on small screens, scrollable body, stacked buttons, touch-friendly tap targets (44px+), tested on 375px and 390px widths (iPhone SE / iPhone 14 equivalents)

**Estimated Effort:** 2-3 days  
**Dependencies:** AI service (already integrated), existing Dialog component, tenant settings infrastructure

---

### QuickBooks Online Integration
**Status:** COMPLETELY MISSING - Downgraded from P0

**Why Deferred:** Focus on core UX improvements first. QBO integration valuable but not blocking core operations.

**Scope:**
- [ ] OAuth2 authentication setup with QuickBooks
- [ ] Client → QBO Customer mapping interface
- [ ] Role/Service → QBO Items (Service) mapping
- [ ] Expense categories → QBO Account mappings
- [ ] Invoice Batch → QBO Invoice (Draft) creation with:
  - Service lines with qty/hours × rate
  - Discount lines and zero-charge lines
  - Billable expenses as invoice lines
- [ ] Batch ID deduplication to prevent duplicate exports
- [ ] Retry mechanism and validation error handling
- [ ] Webhook integration for bi-directional sync status
- [ ] QBO sync status dashboard

### Mobile Web Interface Optimization
**Status:** Deferred - Downgraded from P0

**Why Deferred:** Will implement after core UX streamlined (~1 month out). Mobile optimization makes sense once desktop experience is polished.

**Scope:**
- [ ] Touch-first time entry with large touch targets
- [ ] Quick time tracking with start/stop buttons
- [ ] Timer-based time tracking for real-time capture
- [ ] Mobile expense capture with camera integration
- [ ] Offline capability with sync when connected
- [ ] Swipe gestures for common actions
- [ ] Mobile-optimized navigation patterns
- [ ] Location-based automatic project detection
- [ ] Voice notes for descriptions

### SharePoint Embedded UI & Admin Workflows
*Note: Backend and middleware are implemented, UI and admin workflows are missing*

- [ ] Container management UI implementation
- [ ] Document metadata templates interface
- [ ] Custom column configuration UI
- [ ] Permission management interface
- [ ] Container provisioning workflow UI
- [ ] Document search interface with metadata filtering
- [ ] Bulk document operations UI
- [ ] Version history viewer
- [ ] Document approval workflow UI

### Project Status Report Generation - NEW
**Status:** PLANNING - Essential for project visibility and communication

**Why P2:** Important for stakeholder communication and project tracking, but core operations can function without it initially.

**Scope:**
- [ ] **Comprehensive Status Reports**
  - Project overview with vision/description
  - Milestone progress (target vs actual dates)
  - Assignment completion rates by person/role
  - Budget vs actual (time and expenses)
  - Variance analysis and trending
  
- [ ] **Date Range Filtering**
  - Generate reports for specific periods
  - Weekly, monthly, quarterly options
  - Custom date ranges
  - Point-in-time snapshots
  
- [ ] **Report Templates**
  - Executive summary format
  - Detailed technical format
  - Client-facing format (hide internal costs)
  - Custom template builder
  
- [ ] **Export Options**
  - PDF generation with branding
  - Excel export with raw data
  - Email distribution lists
  - Scheduled report generation

**Timeline:** 3-4 weeks (after assignment management complete)

### Advanced Financial Reporting

#### Annual Invoice Reporting - MISSING
- [ ] Year-over-year revenue analysis
- [ ] Monthly/quarterly/annual comparisons
- [ ] Client contribution analysis
- [ ] Service line revenue breakdown
- [ ] Growth rate calculations
- [ ] Revenue forecasting
- [ ] Seasonal trend analysis
- [ ] Interactive dashboard with drill-down

#### Estimate vs Actual Aggregate Reporting - MISSING
- [ ] Portfolio-wide accuracy metrics
- [ ] Variance analysis by:
  - Project type
  - Client industry
  - Team member
  - Service line
- [ ] Trend analysis over time
- [ ] Accuracy improvement tracking
- [ ] Lessons learned repository
- [ ] Predictive accuracy modeling

### Per Diem Expense Calculation - NEW
**Status:** PLANNING - Extension to existing expense workflow  
**Priority:** P2 - Important but not blocking operations  
**Added:** January 2025

**Why P2:** Enhances expense reimbursement accuracy and compliance with GSA standards, but existing expense system functions without it.

**Scope:**
- [ ] **GSA Per Diem Integration**
  - Real-time GSA API integration (https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/per-diem-files)
  - Location lookup by city/state
  - Automatic rate determination (5 tiers: $68, $74, $80, $86, $92)
  - FY 2025/2026 rate support with automatic updates
  - Fallback to standard $68 rate if location not found
  
- [ ] **Per Diem Calculation Engine**
  - Formula: `Full days × daily rate + (arrival/departure days × 75% rate)`
  - Breakdown storage: breakfast, lunch, dinner, incidentals
  - Date range validation (start date ≤ end date)
  - Multi-day trip support
  - First/last day 75% discount application
  
- [ ] **Expense Form Integration**
  - New expense type: "Per Diem"
  - Per diem-specific form fields:
    - Start date picker
    - End date picker  
    - Location autocomplete (city, state)
    - Calculated amount display (read-only)
    - Breakdown display (B/L/D/I amounts per GSA tiers)
  - Seamless integration with existing expense workflow
  
- [ ] **Data Model Extensions**
  - Add to `expenses` table:
    - `perDiemStartDate`, `perDiemEndDate`
    - `perDiemLocation` (city, state)
    - `perDiemTier` (cached M&IE rate)
    - `perDiemBreakdown` (JSON: breakfast/lunch/dinner/incidentals)
  - No changes to approval workflow (uses existing)
  
- [ ] **GSA Rate Caching**
  - Cache rates locally for performance
  - Rate validity period tracking
  - Automatic refresh mechanism
  - Handle rate changes mid-fiscal year
  
- [ ] **Reporting & Compliance**
  - Per diem expense reports by employee
  - Location-based per diem analysis
  - GSA compliance verification
  - Export for tax documentation

**Dependencies:**
- Existing expense system (complete)
- Existing expense approval workflow (complete)
- GSA Per Diem API availability
- SharePoint document storage (for GSA rate cache files)

**Timeline:** 2-3 weeks  
**Complexity:** Medium (API integration, calculation logic, UI enhancements)

### Excel Import/Export Redevelopment
**Status:** HIDDEN FROM UI - Security review required
**Date Hidden:** October 8, 2025

**Why Hidden:** Excel export/import previously exposed cost-sensitive fields (cost rates, margins, profit) that should not be shared externally. Feature hidden pending redevelopment with proper field filtering.

**Decision Options:**
1. **Redevelop with Security Controls**
   - Implement role-based field filtering for Excel exports
   - Remove cost-sensitive columns for non-admin/non-executive users
   - Add clear warnings about data sensitivity
   - Match CSV export security model (cost fields completely hidden)
   
2. **Deprecate Feature**
   - Remove Excel functionality entirely
   - Standardize on CSV for bulk operations (simpler, more secure)
   - Clean up Excel-related code and dependencies
   - Update documentation to reflect CSV-only approach

**Current Status:**
- Excel buttons commented out in estimate detail UI
- Excel backend endpoints still exist but inaccessible from UI
- CSV import/export fully functional with cost-sensitive fields removed
- Users can use CSV for bulk operations without exposing sensitive data

**Recommendation:** Evaluate usage patterns and user feedback before deciding. If Excel offers no significant advantages over CSV, deprecation may be simpler and more maintainable.

### Document Management Enhancements
- [ ] MSA document upload with metadata
- [ ] NDA tracking with expiration alerts
- [ ] Contract document repository
- [ ] Document versioning system
- [ ] Approval workflow for documents
- [ ] Document templates library
- [ ] E-signature integration
- [ ] Document access logging

### Advanced Dashboard Features
- [ ] Customizable dashboard widgets
- [ ] Real-time KPI updates
- [ ] Drill-down capabilities
- [ ] Export dashboard as PDF
- [ ] Scheduled dashboard emails
- [ ] Mobile dashboard optimization
- [ ] Executive dashboard view
- [ ] Team performance dashboards

### Time Tracking UX Improvements
- [ ] **User-Scoped Time Entry View**
  - Default view: show only current user's time entries
  - Admin/PM/Executive roles: "Show All/Hide All" toggle
  - Persist view preference per user
  - Clear indicator of current filter state
  - Quick switch between "My Time" and "All Time"

### Estimate Adjustment Factors - System Defaults
- [ ] **System-Wide Default Adjustment Factors**
  - Admin UI for setting default Size, Complexity, and Confidence factors
  - Stored in system settings table
  - Applied to all new estimates by default
  
- [ ] **Estimate-Level Factor Overrides**
  - Toggle on estimate to enable/disable override
  - When override OFF: estimate inherits system defaults (prevents zeroing out)
  - When override ON: estimate uses custom factors
  - Clear visual indicator of which factor source is active
  
- [ ] **Factor Management Interface**
  - Settings page for system-wide factors
  - Estimate detail page override controls
  - Historical tracking of factor changes
  - Impact preview before applying changes

---

## 🤖 P3 - AI & AUTOMATION (Weeks 9-12)

### AI Chat Interface - COMPLETELY MISSING
- [ ] Database schema (aiChatSessions, aiChatMessages, aiActionProposals)
- [ ] Azure OpenAI (GPT-5) or Claude integration
- [ ] Chat API with SSE streaming
- [ ] Contextual chat UI components
- [ ] Human-in-the-loop approval workflow
- [ ] Chat history management
- [ ] Context preservation across sessions
- [ ] Multi-turn conversation support

### MCP Server for Agentic AI - COMPLETELY MISSING
- [ ] MCP server infrastructure
- [ ] RBAC-enforced AI tools:
  - `create_time_entry()` - AI-assisted time entry
  - `create_expense_from_receipt()` - OCR + categorization
  - `draft_invoice()` - Intelligent invoice generation
  - `generate_estimate_from_prompt()` - Natural language estimates
  - `summarize_variance()` - Performance analysis
  - `suggest_resource_allocation()` - Optimal staffing
- [ ] Audit logging for AI interactions
- [ ] Action proposal system
- [ ] AI confidence scoring
- [ ] Feedback loop for improvement

### AI-Enhanced Workflows
- [ ] **Smart Time Entry**
  - Weekly entry suggestions based on patterns
  - Missing entry detection
  - Anomaly detection for unusual entries
  - Auto-description generation
  
- [ ] **Intelligent Expenses**
  - Receipt OCR with auto-extraction
  - Category prediction
  - Policy violation detection
  - Duplicate expense detection
  
- [ ] **Estimate Intelligence**
  - Similar project suggestions
  - Risk factor identification
  - Margin optimization recommendations
  - Resource availability checking

---

## 🔗 P4 - PLATFORM CAPABILITIES (2026+)

### Extended Integrations Ecosystem

#### HubSpot Integration - LOWER PRIORITY
*Note: Focus on exposing SCDP data to HubSpot rather than deep bidirectional sync*

- [ ] **Core HubSpot Features**
  - Contact synchronization (SCDP clients ↔ HubSpot contacts)
  - Expose proposals/estimates to HubSpot deals
  - Expose projects to HubSpot as custom objects
  - Expose invoices to HubSpot for visibility
  
- [ ] **Automated Deal-to-Project Flow**
  - Auto-create SCDP client when HubSpot deal reaches specified percentage
  - Auto-generate estimate from deal properties
  - Deal stage triggers for project creation
  - Sync deal value to estimate amount

- [ ] **Data Exposure (Read-Only in HubSpot)**
  - Project status and milestones
  - Invoice status and payment tracking
  - Estimate/proposal documents as attachments
  - Budget vs actual visibility

*Not recommended: Resource planning sync, activity tracking sync, time tracking integration (poor conceptual mesh with HubSpot)*

- [ ] **Other CRM Integrations**
  - Salesforce bi-directional sync
  - Microsoft Dynamics 365
  - Custom CRM webhooks
  
- [ ] **Accounting Systems**
  - Xero integration
  - NetSuite connector
  - SAP interface
  - Sage integration
  
- [ ] **Communication Platforms**
  - Slack notifications and commands
  - Microsoft Teams integration
  - Email parsing for time entry
  
- [ ] **Project Management**
  - Jira synchronization
  - Asana integration
  - Monday.com connector
  - Azure DevOps linking

### Accounts Payable (AP) - Contractor Payment Management - NEW
**Status:** PLANNING - New finance module  
**Priority:** P4 - Lower priority, dependent on SharePoint stability  
**Added:** January 2025

**Why P4:** Important for contractor management but not blocking core consulting operations. SharePoint integration must be stable first.

**Overview:** Complete contractor invoice submission, matching, and payment tracking system separate from client AR billing.

**Scope:**

- [ ] **Navigation Restructure - Finance Menu**
  - Create new "Finance" top-level menu (admin/billing-admin/executive only)
  - Move "Billing" (AR) under Finance menu
  - Add "Accounts Payable" (AP) under Finance menu
  - Maintain separate AR and AP workflows

- [ ] **Database Schema - Contractor Invoices**
  - New table: `contractor_invoices`
    - Invoice number, date, due date, total amount
    - Contractor (user) reference
    - PDF file ID (SharePoint reference)
    - Status: submitted → approved → paid
    - Approval and payment tracking fields
    - Payment method, payment reference, notes
  - New table: `contractor_invoice_line_items`
    - Links to time entries and/or expenses
    - Amount, description
    - Expected amount (from cost rate calculation)
    - Variance amount and override reason (for fixed-fee)
    - Matching status
  
- [ ] **User Management Extensions**
  - Add to `users` table:
    - `employment_type` (employee | contractor)
    - `is_ap_eligible` (boolean - can submit AP invoices)
    - Cost rate history tracking (leverage existing `user_rate_schedules`)
  - Low priority compliance fields (future):
    - `w9_on_file`, `operating_agreement_file_id`, `taxpayer_id`
  
- [ ] **Time/Expense Matching Enhancements**
  - Add to `time_entries` table:
    - `ap_invoice_line_id` (FK to contractor_invoice_line_items)
    - `ap_matched_date`
  - Add to `expenses` table:
    - `ap_invoice_line_id` (FK to contractor_invoice_line_items)
    - `ap_matched_date`
  - Prevent double-matching business logic
  
- [ ] **AP Invoice Upload & Storage**
  - PDF upload interface (admin/billing-admin only)
  - SharePoint storage: `/ap-invoices/{contractor_name}/{year}/INV-{number}.pdf`
  - Invoice metadata form (number, date, amount, contractor)
  - Creates invoice in "submitted" status
  
- [ ] **Invoice Matching Interface**
  - Split-view layout:
    - Left: PDF viewer
    - Right: Matching controls
  - Display unbilled time entries for contractor
    - Filter by date range, project
    - Show: Date, Project, Client, Hours, Cost Rate, Amount
    - Manual selection for matching
  - Display unbilled expenses for contractor
    - Filter by date range
    - Show: Date, Project, Description, Amount
    - Manual selection for matching
  - Invoice line items management
    - Add/edit line items
    - Match to selected time/expenses
    - Calculate expected amount (hours × cost_rate)
    - Show variance (invoice amount - expected)
    - Alert if variance > 5%
    - Allow override with required reason field
  
- [ ] **Cost Rate Validation**
  - Calculate expected cost: `hours × contractor_cost_rate` (at time entry date)
  - Variance threshold: 5%
  - Warning indicators for mismatches
  - Override toggle with reason field (for fixed-fee arrangements)
  - Validation summary before approval
  
- [ ] **Approval & Payment Workflow**
  - Status transitions: submitted → approved → paid
  - Approval button (admin/billing-admin only)
  - Validation rules:
    - Must have at least one matched line item
    - All variances must be reviewed
    - All matched items must be unbilled
  - Payment tracking:
    - Payment date picker
    - Payment method dropdown (check, ACH, wire, etc.)
    - Payment reference field (check #, transaction ID)
    - Payment notes
  - Lock matched time/expense entries (prevent future matching)
  
- [ ] **AP Invoice List & Dashboard**
  - Browse all contractor invoices
  - Filter by contractor, status, date range
  - Status badges and quick stats
  - Sortable table: Invoice #, Contractor, Date, Amount, Status
  - Actions: View, Edit (if not paid), Delete (if not approved)
  
- [ ] **User Profile - Contractor Tab**
  - New tab on user detail page (contractors only)
  - Employment settings section:
    - Employment type toggle
    - AP invoice eligible checkbox
    - Current cost rate display + history link
  - Compliance section (future - grayed out):
    - W9 on file checkbox
    - Operating agreement upload
    - Taxpayer ID (encrypted)
  - Invoice history table:
    - All invoices for this contractor
    - Filter by status, date range
    - Quick link to invoice detail
  
- [ ] **AP Reporting**
  - Payment History Report:
    - Filter by contractor, date range
    - Columns: Contractor, Invoice #, Date, Amount, Approved By, Paid Date, Payment Method
    - Subtotals by contractor
    - CSV export
  - Pending AP Invoices Report:
    - All submitted/approved invoices not yet paid
    - Aging buckets (0-30, 31-60, 61-90, 90+ days)
    - Total pending by contractor
    - CSV export
  - Cost Variance Report (nice-to-have):
    - Compare invoiced amounts to expected costs
    - Identify contractors with frequent overrides
    - Spot rate discrepancies
  
- [ ] **Business Rules & Validation**
  - Matching rules:
    - Time/expense can match only ONE invoice line
    - Once matched and approved, entry is locked
    - Unbilled = no AR invoice AND no AP match
  - Approval rules:
    - Only admin/billing-admin can approve
    - Must have matched items
    - Variances reviewed (or override reason provided)
  - Payment rules:
    - Can only mark paid if status = approved
    - Requires payment date and method
    - Payment reference optional
  - Contractor eligibility:
    - Only users with `employment_type = contractor` AND `is_ap_eligible = true`
    - Dropdown filters show only eligible contractors

**Dependencies:**
- SharePoint Online document storage (stable)
- Existing user management system
- Role-based access control (billing-admin role)
- Time entries and expenses tables
- Cost rate tracking in user profiles

**Implementation Phases:**

**Phase 1: Foundation** (1-2 weeks)
- Database schema migration
- User employment type and AP eligibility fields
- Navigation restructure (Finance menu)

**Phase 2: Core Invoice Management** (2-3 weeks)
- AP invoice list page
- Invoice upload functionality
- PDF storage in SharePoint
- Basic invoice status tracking

**Phase 3: Matching Interface** (3-4 weeks)
- Invoice detail page with PDF viewer
- Unbilled time/expense fetching
- Manual matching interface
- Cost rate variance calculation

**Phase 4: Approval Workflow** (1-2 weeks)
- Approval logic and status transitions
- Payment tracking
- Lock matched entries

**Phase 5: Reporting & User Management** (1-2 weeks)
- Payment history report
- Pending invoices report
- Contractor invoices tab in user management

**Phase 6: Enhancements** (Future - P5)
- W9 and compliance tracking
- Cost variance reports
- Email notifications for approvals
- Batch payment processing

**Total Timeline:** 8-13 weeks  
**Complexity:** High (new module, complex matching logic, SharePoint integration)

### API Platform Development
- [ ] **Public API**
  - RESTful API v2
  - GraphQL endpoint
  - OpenAPI/Swagger documentation
  - Interactive API explorer
  
- [ ] **Developer Experience**
  - API key management UI
  - Rate limiting and quotas
  - Usage analytics dashboard
  - Webhook management interface
  - SDK generation (Python, JS, Ruby)
  - Developer portal with guides
  
- [ ] **Security & Governance**
  - OAuth2 server implementation
  - Scope-based permissions
  - API versioning strategy
  - Deprecation notices

### Internationalization & Localization
- [ ] **Multi-Language Support**
  - Spanish, French, German translations
  - RTL language support (Arabic, Hebrew)
  - Language detection and switching
  - Translation management system
  
- [ ] **Multi-Currency**
  - Real-time FX rate updates
  - Dual ledger accounting
  - Currency conversion at invoice time
  - Multi-currency reporting
  
- [ ] **Regional Compliance**
  - GDPR compliance tools
  - Regional tax calculations
  - Local date/time formats
  - Regional invoice requirements

### Performance & Scalability
- [ ] **Data Optimization**
  - Implement data pagination
  - Lazy loading for large datasets
  - Query optimization
  - Database indexing strategy
  
- [ ] **Real-time Features**
  - WebSocket implementation
  - Live collaboration features
  - Real-time notifications
  - Activity feeds
  
- [ ] **Caching & CDN**
  - Redis caching layer
  - CDN for static assets
  - Edge computing for global users
  - Response caching strategies

### Advanced Security & Compliance
- [ ] **Enterprise Security**
  - SOC 2 Type II preparation
  - Penetration testing
  - Security audit logging
  - Data encryption enhancements
  
- [ ] **Compliance Features**
  - Data retention policies
  - Right to be forgotten
  - Data portability tools
  - Compliance reporting
  
- [ ] **Advanced Authentication**
  - Biometric authentication
  - Hardware key support (FIDO2)
  - Passwordless authentication
  - Risk-based authentication

### Client Portal - DEPRIORITIZED
- [ ] Client project dashboard
- [ ] Invoice viewing and payment
- [ ] Document sharing
- [ ] Time entry approval
- [ ] Change request submission
- [ ] Project status tracking
- [ ] Client reporting access
- [ ] Secure messaging

---

## 📋 SUMMARY

**Total Features**: ~107 genuinely missing features across 16 categories

### Implementation Roadmap

**Phase 1 (Q4 2025)**: Critical Infrastructure
- QuickBooks Online integration (P0)
- Mobile optimization (P0)
- Core notifications system (P1)

**Phase 2 (Q1 2026)**: Business Logic
- Commercial schemes (P1)
- Pricing privacy (P1)
- Vocabulary customization (P1)
- SPE UI/admin workflows (P2)
- Per Diem expense calculation (P2)

**Phase 3 (Q2 2026)**: Intelligence & Reporting
- Advanced reporting suite (P2)
- AI chat interface (P3)
- MCP server implementation (P3)

**Phase 4 (Q3-Q4 2026+)**: Platform Evolution
- Extended integrations (P4)
- Accounts Payable module (P4)
- API platform (P4)
- Internationalization (P4)
- Performance optimizations (P4)

---

**Last Updated**: January 2025
**Version**: 2.1 - Added Per Diem and Accounts Payable modules

## Notes on Already Implemented Features (NOT in backlog)
- ✅ Expense bulk upload with CSV/Excel
- ✅ MFA via Azure Entra ID
- ✅ Project and estimate milestones
- ✅ Basic burn rate tracking
- ✅ Estimate accuracy reporting
- ✅ Portfolio metrics
- ✅ Time/expense import templates
- ✅ Change order management
- ✅ SOW management
- ✅ Invoice batch PDF generation
- ✅ Financial reports API endpoints
- ✅ Dashboard KPIs
- ✅ Company branding settings