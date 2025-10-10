# SCDP Product Backlog - Corrected Comprehensive Version

## ✅ Recently Completed (Week of Oct 7-11, 2025)

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

---

## 📊 P2 - IMPORTANT FEATURES (Weeks 5-8)

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

**Total Features**: ~105 genuinely missing features across 15 categories

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

**Phase 3 (Q2 2026)**: Intelligence & Reporting
- Advanced reporting suite (P2)
- AI chat interface (P3)
- MCP server implementation (P3)

**Phase 4 (Q3-Q4 2026)**: Platform Evolution
- Extended integrations (P4)
- API platform (P4)
- Internationalization (P4)
- Performance optimizations (P4)

---

**Last Updated**: October 2025
**Version**: 2.0 - Corrected after comprehensive code review

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