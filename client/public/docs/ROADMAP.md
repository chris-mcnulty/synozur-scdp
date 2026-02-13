# Constellation Product Roadmap

**Synozur Consulting Delivery Platform (SCDP)**

Strategic product roadmap outlining planned features, enhancements, and future direction for Constellation.

---

## Table of Contents

1. [Vision & Strategy](#vision--strategy)
2. [Recently Completed](#recently-completed)
3. [Current Focus (Q1 2026)](#current-focus-q1-2026)
4. [Near-Term Priorities (Q2 2026)](#near-term-priorities-q2-2026)
5. [Medium-Term Goals (H2 2026)](#medium-term-goals-h2-2026)
6. [Long-Term Vision (2027+)](#long-term-vision-2027)
7. [Feature Status Legend](#feature-status-legend)

---

## Vision & Strategy

### Our Mission
Constellation empowers consulting organizations to deliver exceptional client value by providing a comprehensive platform that streamlines project delivery, resource management, and financial operations from initial estimation through final billing.

### Strategic Pillars

**1. User Experience Excellence**
- Intuitive workflows that reduce administrative burden
- Mobile-optimized interfaces for field consultants
- Personalized dashboards based on role and responsibilities

**2. Intelligent Automation**
- AI-powered project insights and recommendations
- Automated synchronization with Microsoft 365 ecosystem
- Smart notifications and proactive alerts

**3. Enterprise Integration**
- Seamless Microsoft 365 integration (Teams, Planner, SharePoint)
- QuickBooks Online bidirectional sync
- API-first architecture for extensibility

**4. Multi-Tenant SaaS Platform**
- Scalable architecture supporting multiple organizations
- Flexible service plans (Trial, Team, Enterprise, Unlimited)
- Self-service onboarding and management

### Success Metrics
- **User Adoption:** 95% active user engagement within 30 days
- **Time Savings:** 40% reduction in administrative overhead
- **Accuracy:** 90% estimate accuracy within ±15%
- **Client Satisfaction:** NPS score of 50+
- **Platform Reliability:** 99.5% uptime SLA

---

## Recently Completed

The following major features have been delivered and are live in production. See the [Changelog](/changelog) for detailed release notes.

### ✅ Multi-Tenancy Architecture
**Completed:** February 2026 (Phases 1-4, 6)
- UUID-based tenant IDs with full data isolation
- Service plans (Trial, Team, Enterprise, Unlimited) with plan management UI
- Self-service signup flow (3-step wizard: org info, admin account, plan selection)
- Plan lifecycle enforcement with 14-day grace period and warning banners
- Scheduled plan expiration job (daily at 2:00 AM)
- Tenant switcher for users with multiple memberships
- Platform admin UI for managing tenants, service plans, and users
- Automatic tenant assignment on login via Azure AD mapping, email domain, or fallback
- Platform roles (`global_admin`, `constellation_admin`) with elevated cross-tenant access
- Tenant-specific settings: company info, branding, invoice footer, email templates
- Tenant-scoped vocabulary customization
- Per-tenant SSO configuration support
- Subdomain routing deferred (requires custom DNS + wildcard SSL)

### ✅ Retainer & Commercial Schemes
**Completed:** January 2026
- Retainer estimate type with creation wizard and auto-generated structure
- Optional multi-rate tiers per month (e.g., Senior at $250/hr for 35hrs + Junior at $150/hr for 20hrs)
- Live retainer month management at project level (independent of locked estimates)
- Add/edit/delete/extend retainer stages with month status indicators
- Auto-generated end-of-month payment milestones from rate tier calculations
- Utilization tracking for retainer engagements
- Project-level billing and cost rate overrides (Contracts > Rate Overrides tab)

### ✅ Resource Management & Capacity Planning
**Completed:** January 2026
- Dual List/Timeline views for resource allocation
- Capacity planning dashboard with utilization metrics
- Conflict detection for over-allocated resources
- Portfolio timeline view (dedicated page) for cross-project visibility
- Project engagement tracking with role, workstream, and hours allocation

### ✅ Per Diem & Expense Automation
**Completed:** December 2025
- GSA Per Diem API integration for CONUS rates (automatic by city/state/zip)
- OCONUS per diem rate database (DoD rates) with admin management
- Travel day calculation (75% rate for partial days)
- Automatic M&IE (Meals & Incidental Expenses) calculation
- Airport code reference database (5,163 IATA codes)
- Comprehensive expense approval workflow with finite state machine
- Contractor expense invoices with PDF and QuickBooks CSV export
- Receipt bundle download for expense reports

### ✅ Financial Reporting
**Completed:** January 2026
- Revenue, cost, profit, and margin reporting by client and project
- KPI summary dashboard with health scoring
- Budget utilization metrics and variance tracking
- Role-based visibility controls for financial data
- Dynamic vocabulary labels in all reports

### ✅ Mobile Web Optimization
**Completed:** December 2025
- Responsive navigation with mobile-optimized sidebar and bottom navigation
- Touch-friendly interfaces across all modules
- Mobile-responsive modals (bottom-sheet design pattern)
- Optimized table views and data displays for smaller screens

### ✅ AI-Powered Features
**Completed:** February 2026
- AI help chat widget accessible from every page
- AI-generated estimate and invoice narratives
- "What's New" changelog modal with AI-generated summaries
- Tenant-level admin toggle for update notifications
- Chat-based report queries

### ✅ Microsoft Planner Integration
**Completed:** January 2026
- Bidirectional sync of project assignments with Planner tasks
- Automatic sync every 30 minutes for enabled projects
- Task creation with bucket mapping based on project stages
- User assignment mapping between Constellation and Azure AD
- Status synchronization and date synchronization
- Scheduled job monitoring with admin UI

### ✅ Scheduled Jobs System
**Completed:** January 2026
- Background job system for expense reminders, time reminders, and Planner sync
- Admin monitoring UI with execution history and statistics
- Manual trigger buttons for on-demand execution
- Multi-tenant scoping for job configuration

---

## Current Focus (Q1 2026)

> **Priorities informed by February 2026 user feedback session** — Stack ranking (Borda scores), marketplace coin allocation, and 2×2 priority matrix exercises identified clear consensus around accounting integration, AI-driven status reporting, and a high-impact quick-win bug fix.

### ✅ Quick Win: Fix Export PDF Bug for Expense Reports

**Status:** ✅ Complete  
**Completed:** February 2026  
**Priority Matrix:** High Impact / Low Effort  
**User Feedback:** Identified unanimously as the top quick win — a high-impact fix that delivered immediate value with minimal effort.

---

### ✅ Priority: Enhanced Status Reporting

**Status:** ✅ Complete  
**Completed:** February 2026  
**User Feedback:** Ranked #2 overall in stack ranking with strong marketplace coin support. The cohort expressed high interest in AI-driven efficiency enhancements for project communication.  
**Value Proposition:** Transform existing project activity data into polished, AI-generated status reports that can be viewed, shared, and delivered on a recurring schedule — reducing the manual effort of writing weekly and monthly project updates.

#### Phase 1: Interactive Status Report Generation ✅ Complete

**On-Screen Report Viewer**
- New dialog/modal accessible from the project detail page
- Displays the generated text summary of project activity for a selected time period
- Supports weekly and monthly period selection
- Copy-to-clipboard button for easy pasting into emails or documents
- Download as plain text or formatted document

**AI-Powered Report Processing**
- AI-generated narrative summary from raw activity data (time entries, expenses, assignments, milestones)
- Configurable summary style (executive brief, detailed update, client-facing)
- Editable output — PMs can review and tweak the AI-generated text before sharing
- RAIDD integration — open risks, issues, action items, dependencies, and decisions automatically included
- Critical and overdue items highlighted in reports
- RAIDD counts displayed in the report metadata bar
- Consistent formatting across all projects for uniform reporting

**Export & Sharing**
- Copy-to-clipboard for easy pasting into emails
- Download generated report as formatted text

#### Phase 2: Automated Scheduling (Future Enhancement)

**Scheduled Report Delivery**
- Project-level setting to enable automatic weekly or monthly reports
- Configurable delivery day and recipients (PM, stakeholders, client contacts)
- Reports auto-generated and emailed on schedule
- Report history archive accessible from project detail page
- Admin dashboard for monitoring scheduled report delivery across all projects

---

### ✅ Priority: RAIDD Log

**Status:** ✅ Complete  
**Completed:** February 2026  
**Value Proposition:** Provide project managers with a structured, trackable register for Risks, Action Items, Issues, Dependencies, and Decisions (RAIDD) — improving project governance, accountability, and visibility into items that can impact delivery.

#### Core Features ✅ Complete

**RAIDD Register**
- Dedicated RAIDD tab within the project detail page
- Entry types: Risk, Issue, Action Item, Dependency, Decision
- Fields per entry: title, description, type, status, priority/severity, impact, likelihood, owner, assignee, due date, resolution notes, category, tags, mitigation plan
- Filterable and sortable table view by type, status, priority, owner, or due date
- Status workflow: Open → In Progress → Mitigated/Resolved/Closed/Deferred/Superseded
- Color-coded severity indicators (Critical, High, Medium, Low)
- Governance rules: decisions immutable after status change, risks convert to issues with lineage preserved

**Assignment & Tracking**
- Assign each item to a project team member (owner and assignee)
- Due date tracking with overdue highlighting
- Reference numbering for organized tracking
- Category tagging for classification

**Export & Reporting**
- Export full RAIDD log as Excel spreadsheet
- Filtered export (e.g., only open risks, only decisions)
- Summary view showing counts by type and status

**AI Integration**
- AI-generated summary of open risks and issues included in status reports
- RAIDD data automatically pulled into Enhanced Status Reports
- Critical and overdue warnings highlighted in AI-generated narratives

**Portfolio RAIDD Dashboard ✅ Complete**
- Cross-project RAIDD dashboard at `/portfolio/raidd` for portfolio-level risk visibility
- Summary cards: open risks, issues, action items, dependencies, critical/high counts, overdue items, closed this month
- Filterable by status, type, priority, and project
- Grouping by project, type, priority, or status
- XLSX export for stakeholder reporting
- Role-restricted access (admin, PM, executive)

#### Future Enhancements
- Link RAIDD items to specific project milestones or stages
- Notification triggers when items approach or pass due dates (integrates with Notifications System)
- RAIDD templates with pre-populated common risks by project type

---

## Near-Term Priorities (Q2 2026)

### 💹 Priority: QuickBooks Online Integration for Consultants

**Status:** 📋 Planned  
**Target Completion:** Q2 2026  
**User Feedback:** Ranked #1 overall in stack ranking with the highest marketplace coin allocation (94 coins), indicating strong consensus on its importance. Two QuickBooks-related ideas (Accounting Integration and Tool Integrations) collectively dominated the feedback session. The 2×2 priority matrix scored it as high impact but also high effort, so detailed scoping and resource planning is recommended before implementation begins.  
**Value Proposition:** Bidirectional sync with QuickBooks Online eliminates manual data entry and ensures financial accuracy for consultants managing their own books.

#### Deliverables
- OAuth2 authentication with QuickBooks Online
- Client → QBO Customer mapping interface
- Role/Service → QBO Items mapping
- Expense categories → QBO Account mappings
- Automated invoice creation in QBO (draft status)
- Batch ID deduplication to prevent duplicates
- Webhook integration for sync status updates
- QBO sync dashboard with error reporting
- Retry mechanism for failed syncs
- Real-time validation and error handling

**Implementation Note:** Given the high effort rating from user feedback, a detailed scoping and resource allocation plan should be completed before development begins.

---

### 🤝 Priority: Microsoft 365 Teams Integration

**Status:** 📋 Planned  
**Target Completion:** Q2 2026  
**Value Proposition:** Seamless Microsoft 365 integration enhances team collaboration and centralizes project communications.

#### Deliverables

**Microsoft Teams Automation**
- Automatic Team creation for new clients (first project)
- Channel creation for subsequent client projects
- SharePoint site provisioning with Team
- Team member management based on project assignments
- Automated member add/remove on assignment changes

**Enhanced Planner Integration (Phase 2)**
- Bidirectional sync with Microsoft Graph webhooks
- Planner-to-Constellation change notifications
- Conflict resolution for simultaneous edits
- Comprehensive audit trail for all sync activities
- Multitenant app registration (so other tenants can consent without creating their own app)

**Project Creation UX Enhancement**
- M365 integration options in project creation dialog
- Smart detection: "First project" vs "Add to existing Team"
- Visual preview of resources to be created
- Checkbox options for Teams, Planner, auto-member management

**External User Support**
- Graceful handling of non-Azure AD consultants
- Guest user invitation workflow
- External collaborator permissions management

**Design Reference:** `docs/design/microsoft-365-project-integration.md`

---

### 💼 Priority: Advanced Commercial Schemes

**Status:** 📋 Planned  
**Target Completion:** May 2026  
**Value Proposition:** Expand billing model support beyond retainers to cover all engagement types.

#### Deliverables

**Milestone Fixed Fee Management**
- Milestone definition with acceptance criteria
- Percentage complete tracking interface
- Milestone payment scheduling
- Partial milestone billing support
- Milestone variance reporting
- Client acceptance workflow with digital sign-off

**Enhanced Time & Materials (T&M)**
- Rate calculation at service date
- Not-to-exceed (NTE) budget tracking with alerts
- T&M profitability analysis
- Progress-to-budget real-time reporting

**Pricing Privacy & Rate Management**
- Separate rack rates (internal) from charge rates (client-facing)
- Rate margin calculations and reporting
- Field-level security to hide cost data from non-admins
- Rate grandfathering for existing engagements

---

### 🔔 Notifications System (Deprioritized)

**Status:** 📋 Planned  
**Target Completion:** Q2–Q3 2026  
**User Feedback:** Ranked lower in user feedback session. Deprioritized to make room for QuickBooks integration and Status Reporting, which received significantly stronger support. Will be revisited in future feedback sessions to assess evolving organizational needs.  
**Value Proposition:** Keep users informed with timely, relevant notifications that drive action and improve operational efficiency.

#### Deliverables
- In-app notification center (bell icon, dropdown, full page view)
- Email notifications via SendGrid (time reminders, expense approvals, budget alerts)
- User preferences with granular per-type controls
- Admin controls for system-wide notification management

**Detailed Plan:** See `notifications-plan.md` for comprehensive implementation details

---

## Medium-Term Goals (H2 2026)

### 📊 Advanced Financial Reporting

**Status:** 🚧 In Progress  
**Target Timeframe:** Q1-Q4 2026

#### ✅ Completed (February 2026)

**Year-over-Year Invoice Comparison**
- Year-over-year revenue analysis with side-by-side prior/current year view
- Quarter-over-quarter comparison with multi-select Q1-Q4 filtering
- Variance analysis with dollar and percentage change indicators
- Comparison metric summary cards with trend indicators
- Year-over-Year summary table for all financial metrics
- Quick date filters (Prior Year / Current Year buttons)
- Clickable invoice numbers linking to batch details
- Excel export for comparison data
- Client filter on both Report and YoY Comparison views
- Three-year data support for broader historical analysis
- Batch type filtering and improved date handling

#### Planned Features

**Annual Invoice Reporting (Remaining)**
- Client contribution analysis and rankings
- Service line revenue breakdown
- Growth rate calculations and projections
- Revenue forecasting based on pipeline
- Seasonal trend analysis
- Interactive dashboard with drill-down capabilities

**Estimate vs. Actual Analytics**
- Portfolio-wide accuracy metrics
- Variance analysis by project type, client, team member
- Trend analysis over time with improvement tracking
- Accuracy improvement recommendations
- Lessons learned repository
- Predictive accuracy modeling with ML

---

### 🎨 Advanced Vocabulary Features

**Status:** 🔮 Future  
**Target Timeframe:** Q4 2026  
**Note:** Core vocabulary system completed in October 2025

#### Planned Enhancements
- PDF templates with custom terminology
- Email notification templates using client vocabulary
- Excel exports with client-specific column headers
- Multi-language support with user language preferences
- Locale-aware terminology
- Industry preset templates (consulting, IT, professional services)
- One-click vocabulary template application

---

### 🏗️ Codebase Modularization (Routes & Storage)

**Status:** 🔮 Future  
**Target Timeframe:** Q3-Q4 2026  
**Motivation:** The core backend files `routes.ts` (20,500+ lines, ~396 endpoints) and `storage.ts` (11,600+ lines) have grown to a size that increases maintenance risk, slows developer tooling, and makes isolated testing difficult. Splitting them into domain-focused modules will improve maintainability, reduce merge conflicts, and enable faster development.

#### Current State
- `server/routes.ts` — 20,500+ lines containing all API endpoints
- `server/storage.ts` — 11,600+ lines containing all database operations
- `server/routes/platform.ts` — Already extracted (proof of pattern)

#### Proposed Module Structure

**Phase 1: Route Extraction (Lower Risk)**

Split `server/routes.ts` into domain-focused route files under `server/routes/`:

| Module | Endpoints | Description |
|--------|-----------|-------------|
| `projects.ts` | ~64 | Projects, allocations, assignments, SOWs, change orders, portfolio, capacity, dashboard |
| `estimates.ts` | ~47 | Estimates, epics, stages, line items, milestones |
| `invoicing.ts` | ~50 | Invoice batches, invoice lines, adjustments, billing, payment milestones, reimbursement batches |
| `expenses.ts` | ~60 | Expenses, expense reports, pending receipts, per diem, OCONUS, airports |
| `documents.ts` | ~40 | SharePoint, file management, SharePoint Embedded containers |
| `users.ts` | ~26 | Users, roles, rates, authentication |
| `admin.ts` | ~40 | Scheduled jobs, system settings, vocabulary, changelog |
| `planner.ts` | ~16 | Microsoft Planner integration |
| `time-entries.ts` | ~9 | Time entry CRUD and export |
| `tenant.ts` | ~10 | Tenant settings, email branding |
| `ai.ts` | ~7 | AI chat and narrative generation |
| `reports.ts` | ~6 | Financial reporting |
| `platform.ts` | Existing | Platform admin (already extracted) |

Each module exports a function `registerXxxRoutes(app, storage)` that the main `routes.ts` calls, keeping the entry point as a thin orchestrator.

**Phase 2: Storage Layer Extraction (Higher Risk)**

Split `server/storage.ts` into domain-focused storage modules under `server/storage/`:

| Module | Description |
|--------|-------------|
| `projects.ts` | Project, allocation, and assignment queries |
| `estimates.ts` | Estimate structure and line item queries |
| `invoicing.ts` | Invoice, batch, and payment milestone queries |
| `expenses.ts` | Expense, per diem, and receipt queries |
| `documents.ts` | File and container queries |
| `users.ts` | User, role, and rate queries |
| `admin.ts` | Settings, vocabulary, and job queries |
| `time-entries.ts` | Time entry queries |
| `index.ts` | Re-exports all modules, maintains `IStorage` interface |

The `IStorage` interface remains unified but its implementation is composed from domain modules.

**Phase 3: Shared Middleware & Utilities**

- Extract common middleware (auth, role checks, tenant scoping) into `server/middleware/`
- Consolidate shared utilities (pagination, error handling, validation) into `server/utils/`

#### Implementation Principles
- **Zero functionality changes** — Pure refactor, no new features or API changes
- **Incremental extraction** — One domain at a time, fully tested before moving to the next
- **Backward compatible** — All existing API contracts and response shapes remain identical
- **Route-first** — Extract routes before storage, since routes are the higher-risk surface
- **Test after each domain** — Verify all endpoints for the extracted domain work correctly before proceeding

#### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Breaking existing endpoints | Extract one domain at a time with full API testing |
| Circular dependencies | Clear dependency direction: routes → storage → schema |
| Shared state (middleware, auth) | Extract middleware first as shared utilities |
| Large merge conflicts during transition | Complete each domain extraction in a single focused session |

---

### 🎯 Advanced Resource Management

**Status:** 📋 Planned  
**Target Timeframe:** Q2-Q3 2026  
**Note:** Core resource management, capacity planning, and portfolio timeline completed in January 2026  
**Design Document:** `docs/design/advanced-resource-management.md`

#### Key Concepts

**Multi-Role Capability Mapping**
- Map each person to multiple generic roles they can fill (e.g., Senior Consultant who can also serve as BA or Project Lead)
- Proficiency levels: primary, secondary, learning
- Optional per-role cost/billing rate overrides per person
- Used to power smart assignment suggestions and rebalancing

**Per-Person Capacity Profiles**
- Configurable weekly capacity hours (default 40) per person
- Accounts for part-time staff, day-off schedules, contractual limits
- Used as utilization denominator in all capacity calculations

#### Planned Phases (~7-8 weeks total)

**Phase 1: Role Capabilities & Capacity Profiles (~1 week)**
- New `user_role_capabilities` table for many-to-many user-role mapping
- Per-person `weeklyCapacityHours` on users table
- UI on user profile and user list pages

**Phase 2: Planner Sync Protection for Generic Roles (~2-3 days)**
- Preserve roleId on allocations through Planner sync cycles
- Include role name in Planner task titles for unassigned allocations
- Define sync field whitelist (Constellation-owned vs Planner-owned fields)

**Phase 3: Smart Assignment Suggestions (~2 weeks)**
- Suggestion engine in project assignment module (not during estimate conversion)
- Candidates ranked by role proficiency, availability, cost variance, and salaried status
- Bulk assignment with review screen and cost impact summary

**Phase 4: Cross-Project Workload & Rebalancing (~2 weeks)**
- Timeline view and utilization heat map at `/resource-planning`
- "Find Replacement" with cost impact analysis and margin preview
- Filters by role, project, date range, utilization threshold

**Phase 5: Capacity Planning Analytics (~1-2 weeks)**
- KPI dashboard, bench list, role demand vs supply gap analysis
- Forecast tool for pipeline impact on team utilization
- Cost variance trends over time

**Phase 6: Bulk Import & Polish (~1 week)**
- CSV/Excel templates for bulk role capability and capacity imports
- Performance optimization and historical trend charts

---

## Long-Term Vision (2027+)

### 🤖 AI & Intelligent Automation

**Status:** 🔮 Vision  
**Target Timeframe:** 2027

#### Planned Capabilities

**Project Intelligence**
- AI-powered project risk assessment
- Predictive budget overrun warnings
- Automated project health scoring
- Resource optimization recommendations
- Intelligent staffing suggestions based on skills and availability

**Natural Language Interfaces**
- Conversational time entry ("Worked 3 hours on Project Phoenix today")
- Voice-activated expense recording
- AI assistant for project management tasks

**Predictive Analytics**
- Client churn prediction
- Revenue forecasting with ML models
- Project success probability scoring
- Capacity planning optimization
- Price optimization recommendations

---

### 🔗 Platform Capabilities & Integrations

**Status:** 🔮 Vision  
**Target Timeframe:** 2027+

#### Planned Integrations
- Salesforce CRM integration for client management
- Jira integration for technical project tracking
- Slack notifications and bot commands
- Microsoft Power BI embedded analytics
- DocuSign for digital contract execution
- ADP/Workday integration for HR data sync

#### API Ecosystem
- Public REST API with comprehensive documentation
- Webhook support for third-party integrations
- Developer portal with sample code and SDKs
- OAuth2 authentication for external applications
- Rate limiting and usage analytics

---

### 📄 SharePoint Embedded UI Enhancement

**Status:** 🔮 Future  
**Target Timeframe:** 2027  
**Note:** Backend implementation complete (September 2025)

#### Planned UI Features
- Container management interface
- Document metadata templates
- Custom column configuration UI
- Visual permission management
- Container provisioning workflow
- Advanced document search with metadata filtering
- Bulk document operations
- Version history viewer with comparison
- Document approval workflow interface

---

### 💰 Advanced Travel & Expense Features

**Status:** 🔮 Future  
**Target Timeframe:** 2027  
**Note:** Core per diem (GSA CONUS & OCONUS), expense approval workflow, and contractor invoices completed in 2025-2026

#### Planned Enhancements

**Lodging Reimbursement**
- Receipt-based actual cost reimbursement
- Government lodging rate validation
- Hotel tax and fee handling
- Non-standard accommodation support

**Travel Expense Automation**
- Mileage calculation with Google Maps integration
- Rental car rate validation
- Airfare receipt parsing with OCR
- Parking and toll tracking
- Taxi/Uber receipt integration

---

## Feature Status Legend

- 🎯 **In Progress** - Actively being developed
- 📋 **Planned** - Prioritized and scheduled
- 🔮 **Future** - On roadmap, timing flexible
- 🚧 **Design Phase** - Requirements gathering and design
- ✅ **Complete** - Delivered and in production
- 🔄 **Iterating** - Released with ongoing improvements

---

## Roadmap Principles

### Flexibility & Responsiveness
This roadmap represents our current strategic direction but remains flexible to accommodate:
- User feedback and feature requests
- Market opportunities and competitive dynamics
- Technical dependencies and prerequisites
- Organizational priorities and resource availability

### User-Centric Development
- Regular user feedback collection and incorporation
- Beta testing programs for new features
- Iterative releases with continuous improvement
- Documentation and training materials for all releases

### Quality & Reliability
- Comprehensive testing before production releases
- Performance benchmarking and optimization
- Security audits and vulnerability assessments
- Backward compatibility and migration support

---

## Feedback & Influence

### Have Input on the Roadmap?

We welcome feedback from users, administrators, and stakeholders on roadmap priorities and features.

**Ways to Provide Feedback:**
- Contact your system administrator
- Email suggestions to ITHelp@synozur.com
- Participate in user feedback sessions
- Join beta testing programs for early access

**What Makes a Good Feature Request:**
- Clear description of the problem or need
- Explanation of business value and impact
- Examples of current workarounds (if any)
- Similar features in other tools (if applicable)
- Estimated number of users who would benefit

---

## Recent Roadmap Updates

**February 13, 2026 — Project Governance & Portfolio Insights**
- Marked Enhanced Status Reporting as ✅ Complete (Phase 1: interactive generation with AI narratives, RAIDD integration, copy/download)
- Marked RAIDD Log as ✅ Complete (full register, governance rules, AI integration, Excel export, portfolio dashboard)
- Added Portfolio RAIDD dashboard to completed RAIDD deliverables (cross-project view with summary cards, filters, grouping, export)
- Updated Advanced Financial Reporting with client filter, three-year data support, and batch type filtering
- Updated Per Diem & Expense Automation with city lookup, airport codes, exchange rates, and improved calculations

**February 12, 2026 — Advanced Resource Management Design**
- Completed detailed design document for Advanced Resource Management (`docs/design/advanced-resource-management.md`)
- Moved from "Future" to "Planned" (Q2-Q3 2026) with 6-phase implementation plan (~7-8 weeks)
- Key additions: multi-role capability mapping, per-person capacity profiles, Planner sync protection for generic roles
- Estimate-to-project conversion stays fast; smart assignment suggestions happen in the project assignment module
- Cost variance analysis drives staffing decisions with budget impact visibility

**February 11, 2026 — User Feedback Session Reprioritization**
- Reprioritized roadmap based on February 2026 user feedback session (stack ranking, marketplace coins, 2×2 priority matrix)
- Elevated QuickBooks Online Integration from H2 2026 to Near-Term Q2 2026 (#1 ranked idea, 94 coins)
- Added user feedback validation to Enhanced Status Reporting (#2 ranked, strong AI-driven efficiency interest)
- Marked expense report PDF export bug fix as completed (quick win from 2×2 high impact / low effort quadrant)
- Deprioritized Notifications System from Q1 Current Focus to Q2–Q3 2026 (lower user ranking)
- Role Definitions noted as lower priority per feedback — revisit in future sessions

**February 10, 2026**
- Added Enhanced Status Reporting to Current Focus (Q1 2026) — AI-powered project status report generation with on-screen viewer, copy/download/email, and future automated scheduling
- Added RAIDD Log to Current Focus (Q1 2026) — structured Risk, Assumption, Issue, Dependency, Decision tracking with assignments, due dates, export, and AI integration into status reports
- Added Codebase Modularization plan to Medium-Term Goals (Q3-Q4 2026)
- Three-phase plan: Route extraction → Storage layer extraction → Middleware/utilities
- 13 domain modules identified for routes, 8 for storage
- Follows existing `platform.ts` extraction pattern

**February 8, 2026**
- Moved completed features to new "Recently Completed" section
- Multi-Tenancy, Retainers, Resource Management, Per Diem, Financial Reporting, Mobile Optimization, AI Features, and Planner Integration all marked as complete
- Updated Current Focus to Notifications System (Q1 2026)
- Refined Near-Term priorities to Teams Integration and Advanced Commercial Schemes
- Updated Medium/Long-Term sections to reflect completed prerequisites

**January 31, 2026**
- Added Project Reporting & Analytics to Q1 2026 focus
- Updated Notifications System timeline to March 2026
- Refined Multi-Tenancy phases based on design completion

**December 15, 2025**
- Moved QBO Integration from P0 to Q3 2026 (prioritizing core UX)
- Promoted Multi-Tenancy to Q2 2026 (strategic importance)
- Updated Microsoft 365 Teams integration target

**October 11, 2025**
- Completed Project Assignment Management and Vocabulary System
- Reprioritized based on user feedback
- Added detailed implementation phases for multi-tenancy

---

*Last Updated: February 13, 2026*  
*Maintained by: Synozur Product Team*  
*Questions or suggestions? Contact: ITHelp@synozur.com*
