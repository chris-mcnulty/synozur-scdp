# SCDP Product Backlog - Corrected Comprehensive Version

## 🚨 P0 - CRITICAL GAPS (Week 1)

### QuickBooks Online Integration - COMPLETELY MISSING
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
- [ ] Touch-first time entry with large touch targets
- [ ] Quick time tracking with start/stop buttons
- [ ] Timer-based time tracking for real-time capture
- [ ] Mobile expense capture with camera integration
- [ ] Offline capability with sync when connected
- [ ] Swipe gestures for common actions
- [ ] Mobile-optimized navigation patterns
- [ ] Location-based automatic project detection
- [ ] Voice notes for descriptions

---

## 🔔 P1 - HIGH PRIORITY (Weeks 2-4)

### Comprehensive Notifications System - ENTIRELY MISSING
- [ ] **Email Notifications Infrastructure**
  - SendGrid/SMTP integration
  - HTML email templates
  - Notification preferences per user
  - Unsubscribe management
  
- [ ] **Notification Triggers**
  - Time entry submission reminders
  - Expense approval requests
  - Invoice batch finalization notices
  - Budget threshold alerts (80%, 90%, 100%)
  - Project deadline reminders
  - Missing time entry warnings
  
- [ ] **In-App Notification Center**
  - Bell icon with unread count
  - Notification feed with history
  - Mark as read/unread functionality
  - Filter by type and date
  - Quick actions from notifications
  
- [ ] **Approval Workflows**
  - Time entry approval chains
  - Expense reimbursement workflows
  - SOW approval processes
  - Estimate sign-off workflows
  - Multi-stage approval support
  
- [ ] **Escalation Rules**
  - Automatic escalation for overdue items
  - Manager notification chains
  - SLA tracking and alerts
  - Custom escalation paths per client

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

### Vocabulary Customization System
*Note: Database fields (epicLabel/stageLabel/activityLabel) exist but UI is missing*

- [ ] **Global Vocabulary Settings**
  - Admin UI for terminology management
  - Default terminology configuration
  - Industry-specific presets
  
- [ ] **Client-Specific Vocabulary**
  - Override terminology per client
  - Custom field labels per client
  - Client vocabulary in reports/exports
  
- [ ] **Context-Sensitive Terms**
  - Apply vocabulary throughout UI
  - Update all labels dynamically
  - Export with client terminology
  - Email templates with custom terms

---

## 📊 P2 - IMPORTANT FEATURES (Weeks 5-8)

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