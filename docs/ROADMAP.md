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
**Completed:** January 2026
- UUID-based tenant IDs with full data isolation
- Service plans (Trial, Team, Enterprise, Unlimited) with plan management UI
- Subdomain routing for tenant-specific access
- Platform admin UI for managing tenants, service plans, and users
- Automatic tenant assignment on login via Azure AD mapping, email domain, or fallback
- Platform roles (`global_admin`, `constellation_admin`) with elevated cross-tenant access
- Tenant-specific settings: company info, branding, invoice footer, email templates
- Tenant-scoped vocabulary customization
- Per-tenant SSO configuration support

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

### 🔔 Priority: Comprehensive Notifications System

**Status:** 📋 Planned  
**Target Completion:** March 2026  
**Value Proposition:** Keep users informed and engaged with timely, relevant notifications that drive action and improve operational efficiency.

#### Deliverables
- **In-App Notification Center**
  - Bell icon with unread count in top navigation
  - Dropdown preview of recent notifications
  - Full-page notification history with filtering
  - Mark as read/unread functionality
  - Notification archiving

- **Email Notifications (SendGrid)**
  - Time entry reminders (requires project staffing)
  - Expense approval requests ($500+ threshold)
  - Expense status updates (approved/rejected)
  - Invoice batch status notices
  - Budget threshold alerts (75%, 90%, 100%)
  - Project deadline reminders

- **User Preferences**
  - Granular controls per notification type
  - Email vs. in-app preference selection
  - Notification frequency settings
  - Do not disturb scheduling

- **Admin Controls**
  - System-wide notification type toggles
  - Default preference templates
  - Notification template customization
  - Delivery rate monitoring

**Implementation Phases:**
1. **Phase 1 (Weeks 1-2):** Core notification infrastructure, in-app notification center
2. **Phase 2 (Weeks 3-4):** Email integration with SendGrid, preference management
3. **Phase 3 (Weeks 5-6):** Admin controls, template customization, testing

**Detailed Plan:** See `notifications-plan.md` for comprehensive implementation details

---

## Near-Term Priorities (Q2 2026)

### 🤝 Priority: Microsoft 365 Teams Integration

**Status:** 📋 Planned  
**Target Completion:** April 2026  
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

## Medium-Term Goals (H2 2026)

### 💹 QuickBooks Online Integration

**Status:** 🔮 Future  
**Target Timeframe:** Q3 2026  
**Value Proposition:** Bidirectional sync with QuickBooks Online eliminates manual data entry and ensures financial accuracy.

#### Planned Features
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

---

### 📊 Advanced Financial Reporting

**Status:** 🔮 Future  
**Target Timeframe:** Q4 2026

#### Planned Features

**Annual Invoice Reporting**
- Year-over-year revenue analysis
- Monthly/quarterly/annual comparisons
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

### 🎯 Advanced Resource Management Enhancements

**Status:** 🔮 Future  
**Target Timeframe:** Q4 2026  
**Note:** Core resource management, capacity planning, and portfolio timeline completed in January 2026

#### Planned Enhancements

**Resource Rebalancing Tools**
- Drag-and-drop reassignment interface
- Rescheduling tools to shift assignment dates
- AI-powered workload rebalancing suggestions
- Impact analysis before making changes
- Bulk assignment operations
- What-if scenario modeling

**Assignment Bulk Import**
- Excel/CSV bulk import for project assignments
- Downloadable template with required fields
- Validation and error reporting
- Support for role-based and person-based assignments
- Bulk update capabilities

**Advanced Capacity Analytics**
- Utilization forecasting by role and person
- Bench time visibility and optimization
- Resource demand vs. supply analysis
- Historical utilization trends
- Hiring recommendations based on demand

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

*Last Updated: February 8, 2026*  
*Maintained by: Synozur Product Team*  
*Questions or suggestions? Contact: ITHelp@synozur.com*
