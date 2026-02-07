# Constellation Product Roadmap

**Synozur Consulting Delivery Platform (SCDP)**

Strategic product roadmap outlining planned features, enhancements, and future direction for Constellation.

---

## Table of Contents

1. [Vision & Strategy](#vision--strategy)
2. [Current Focus (Q1 2026)](#current-focus-q1-2026)
3. [Near-Term Priorities (Q2 2026)](#near-term-priorities-q2-2026)
4. [Medium-Term Goals (H2 2026)](#medium-term-goals-h2-2026)
5. [Long-Term Vision (2027+)](#long-term-vision-2027)
6. [Feature Status Legend](#feature-status-legend)

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

## Current Focus (Q1 2026)

### 🎯 Priority: Project Reporting & Resource Analytics

**Status:** 🚧 In Progress  
**Target Completion:** February 2026  
**Value Proposition:** Leaders need real-time visibility into project performance, resource allocation, and financial health to make informed decisions.

#### Deliverables
- **Comprehensive Reporting API**
  - Project list with advanced filtering (status, date range, PM, client)
  - Cost vs. revenue analysis with role-based visibility controls
  - Budget utilization metrics and variance tracking
  - Resource allocation summaries across projects
  - Time entry aggregations by project, person, and period
  - Dynamic vocabulary labels in all reports

- **Interactive Dashboards**
  - Executive dashboard with organization-wide KPIs
  - Project Manager dashboard with portfolio health
  - Resource utilization visualization
  - Financial performance trends

- **Export & Distribution**
  - Excel export with formatted worksheets
  - PDF report generation with branding
  - Scheduled report delivery via email

---

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

### 🏢 Priority: Multi-Tenancy Architecture

**Status:** 📋 Planned (Design Complete)  
**Target Completion:** June 2026  
**Value Proposition:** Transform Constellation from single-tenant to multi-tenant SaaS platform, enabling software subscription offerings and revenue diversification.

#### Why Multi-Tenancy?
- **Market Opportunity:** Enable SaaS business model with recurring revenue
- **Proven Architecture:** Based on Vega's successful multi-tenant implementation
- **Scalability:** Support unlimited client organizations on shared infrastructure
- **Flexibility:** Configurable service plans from Trial to Enterprise

#### Service Plans

| Plan | Users | Billing | Key Features |
|------|-------|---------|--------------|
| **Trial** | Up to 5 | 30-60 days free | Core features, AI assistance, basic branding |
| **Team** | 5+ (tiered) | Monthly/Annual | Full features, co-branding, SharePoint integration |
| **Enterprise** | Generous tiers | Annual contracts | SSO, custom subdomain, priority support, SLA |
| **Unlimited** | Unlimited | Internal use | Synozur operations + strategic accounts |

#### Implementation Phases

**Phase 1: Foundation (3-4 weeks)**
- Multi-tenant database schema (tenants, tenantUsers, servicePlans, tenantPlans)
- Add `tenantId` column to all existing tables
- Create initial Synozur tenant
- Backfill existing data with tenant context
- Implement tenant isolation middleware

**Phase 2: User & Authentication (2-3 weeks)**
- Multi-tenant user membership model
- Enhanced authentication with tenant context
- Platform-level roles (global_admin, constellation_consultant, etc.)
- Tenant switcher UI for users with multiple memberships
- Migrate existing users to new model

**Phase 3: Tenant Administration (2-3 weeks)**
- Tenant admin dashboard
- User management within tenant
- Per-tenant settings and branding
- Per-tenant SSO configuration
- Vocabulary customization per tenant
- User invitation system

**Phase 4: Platform Administration (2 weeks)**
- Global platform admin interface
- Service plan management
- Tenant monitoring and health dashboard
- Blocked domains management
- Consultant access provisioning
- Usage analytics and billing metrics

**Phase 5: Subdomain Routing (1-2 weeks)**
- Subdomain detection middleware
- Wildcard DNS and SSL certificate configuration
- Tenant-specific login pages
- Subdomain assignment for Enterprise/Unlimited plans
- Custom domain support (future)

**Phase 6: Self-Service & Plans (2-3 weeks)**
- Self-service signup flow with domain validation
- Interactive onboarding wizard
- Trial plan activation and tracking
- Plan expiration handling with grace periods
- Automated data retention enforcement (60 days post-expiration)
- Upgrade/downgrade workflows

**Phase 7: Polish & Testing (2 weeks)**
- Comprehensive security audit (tenant isolation verification)
- Performance optimization and load testing
- Documentation updates (user and admin guides)
- Migration runbook finalization
- Rollback procedures

**Migration Strategy:**
- **Parallel Development:** Remix approach with codebase fork
- **Backward Compatibility:** Nullable tenantId columns initially
- **Data Migration:** Systematic backfill to Synozur tenant
- **Minimal Disruption:** Deploy with 15-minute rollback capability

**Design Reference:** `docs/design/multi-tenancy-design.md`

---

### 💼 Priority: Commercial Schemes Implementation

**Status:** 📋 Planned  
**Target Completion:** May 2026  
**Value Proposition:** Support diverse billing models to accommodate various client engagement types and commercial structures.

#### Deliverables

**Retainer/Drawdown Tracking**
- Pre-paid and post-paid retainer models
- Automatic drawdown from time entries and expenses
- Balance threshold alerts and notifications
- Top-up change order support
- Monthly retainer reconciliation reports
- Retainer aging analysis

**Milestone Fixed Fee Management**
- Milestone definition with acceptance criteria
- Percentage complete tracking interface
- Milestone payment scheduling
- Partial milestone billing support
- Milestone variance reporting
- Client acceptance workflow with digital sign-off

**Enhanced Time & Materials (T&M)**
- Rate calculation at service date
- Comprehensive rate precedence implementation
- Effective discount display
- Not-to-exceed (NTE) budget tracking with alerts
- T&M profitability analysis
- Progress-to-budget real-time reporting

**Pricing Privacy & Rate Management**
- Separate rack rates (internal) from charge rates (client-facing)
- Rate margin calculations and reporting
- Discount percentage tracking
- Field-level security to hide cost data from non-admins
- Rate precedence system (project → client → role)
- Rate grandfathering for existing engagements

---

### 🤝 Priority: Microsoft 365 Teams Integration

**Status:** 📋 Planned (Planner sync complete)  
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

## Medium-Term Goals (H2 2026)

### 📱 Mobile Web Optimization

**Status:** 🔮 Future  
**Target Timeframe:** Q3 2026  
**Value Proposition:** Enable field consultants to track time, submit expenses, and stay connected while on-site with clients.

#### Planned Features
- Touch-optimized time entry interface with large buttons
- Quick start/stop timer for real-time time tracking
- Mobile expense capture with camera integration for receipts
- Offline capability with automatic sync when connected
- Swipe gestures for common actions (approve, delete, mark complete)
- Mobile-optimized navigation with bottom tab bar
- Location-based automatic project detection
- Voice notes for time entry descriptions
- Push notifications for mobile devices

---

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

### 🎯 Advanced Resource Management

**Status:** 🔮 Future  
**Target Timeframe:** Q4 2026  
**Prerequisites:** Project assignments foundation (completed October 2025)

#### Planned Features

**Cross-Project Workload View**
- Unified timeline view of each person's assignments across all projects
- Visual Gantt-style representation of concurrent assignments
- Capacity utilization percentage (total allocation across projects)
- Over-allocation alerts (>100% capacity)
- Available capacity indicators with forecasting

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

**Capacity Planning Analytics**
- Team capacity dashboard with trends
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
- Chat-based report queries
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

### 💰 Per Diem & Advanced Expense Features

**Status:** 🔮 Future  
**Target Timeframe:** 2027

#### Planned Features

**GSA Per Diem Integration**
- Real-time GSA API integration (rates by city/state)
- Automatic rate determination (5 tiers: $68-$92)
- FY 2025/2026+ rate support with automatic updates
- OCONUS (outside continental US) rate support
- Travel day calculation (75% rate for partial days)
- Automatic M&IE (Meals & Incidental Expenses) calculation

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

*Last Updated: February 1, 2026*  
*Maintained by: Synozur Product Team*  
*Questions or suggestions? Contact: ITHelp@synozur.com*
