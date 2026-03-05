# Constellation User Guide

**Welcome to Constellation - The Synozur Consulting Delivery Platform**

Version 1.5 | Last Updated: March 5, 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Core Features](#core-features)
5. [Project Governance (RAIDD)](#project-governance-raidd)
6. [Deliverable Tracking](#deliverable-tracking)
7. [AI-Powered Status Reports](#ai-powered-status-reports)
8. [Portfolio Management](#portfolio-management)
9. [User Roles](#user-roles)
10. [Common Workflows](#common-workflows)
11. [Microsoft 365 Integration](#microsoft-365-integration)
12. [HubSpot CRM Integration](#hubspot-crm-integration)
13. [Settings & Preferences](#settings--preferences)
14. [Tips & Best Practices](#tips--best-practices)
15. [Troubleshooting](#troubleshooting)
16. [Detailed Documentation](#detailed-documentation)

---

## Introduction

### What is Constellation?

Constellation is a comprehensive Consulting Delivery Platform designed to help organizations manage the entire lifecycle of consulting projects. Built by Synozur, Constellation streamlines operations from initial estimation through final billing, providing tools for resource allocation, time tracking, expense recording, and automated invoice generation.

### Key Features

- **Project Management**: Complete project lifecycle from estimation to delivery
- **Resource Allocation**: Assign team members to projects with role-based staffing
- **Time & Expense Tracking**: Comprehensive time and expense management with approval workflows
- **Financial Management**: Invoice generation, expense reimbursement, and financial reporting
- **Client Management**: Organize clients with custom vocabulary and branding
- **Microsoft 365 Integration**: Seamless integration with Teams, Planner, SharePoint, and Azure AD
- **Role-Based Access**: Six-tier permission system tailored to your responsibilities
- **HubSpot CRM Integration**: Connect your sales pipeline with project delivery
- **Vocabulary Customization**: Use your organization's terminology throughout the platform

### Who Should Use This Guide?

This guide is designed for all Constellation users, including:
- Consultants and employees tracking time and expenses
- Project managers overseeing project delivery
- Billing administrators managing invoices and reimbursements
- Executives monitoring organizational performance
- System administrators configuring platform settings

---

## Getting Started

### Creating an Account

#### Method 1: Microsoft Single Sign-On (SSO) - Production

If your organization uses Microsoft 365:

1. Navigate to the Constellation login page
2. Click **"Sign in with Microsoft"**
3. Enter your Microsoft 365 credentials
4. Grant permissions when prompted (first-time only)
5. You'll be automatically redirected to Constellation

**Benefits of Microsoft SSO:**
- No separate password to remember
- More secure authentication through Azure AD
- Automatic account provisioning
- Seamless integration with Microsoft services

#### Method 2: Email and Password - Development

For development and testing environments:

1. Navigate to the Constellation login page
2. Enter your email address
3. Enter your password
4. Click **"Sign In"**

**Note**: Development environments display "Development -" in the browser title bar. Contact your IT administrator at ITHelp@synozur.com for login credentials.

### First Login

After logging in for the first time:

1. **Review Your Profile**: Navigate to the About page to see your role and access level
2. **Explore the Dashboard**: Familiarize yourself with your personalized dashboard
3. **Check Assignments**: Review any projects you're assigned to in "My Assignments"
4. **Complete Required Training**: If prompted, review onboarding materials

### Understanding the Interface

#### Main Navigation (Left Sidebar)

The navigation menu adapts based on your role:

**For All Users:**
- **Dashboard**: Your personalized home screen with key metrics
- **My Assignments**: View your project allocations and responsibilities
- **Time Tracking**: Log hours worked on projects
- **Expenses**: Submit and track expense reports

**For Project Managers (Additional):**
- **Projects**: View and manage all projects
- **Clients**: Manage client relationships and information
- **Estimates**: Create project estimates and proposals
- **Cross-Project Resource**: View resource allocation across projects

**For Billing Administrators (Additional):**
- **Billing**: Create and manage invoices
- **Expense Approval**: Review and approve expense reports
- **Financial Reports**: Access billing and financial analytics

**For Administrators (Additional):**
- **Users**: Manage user accounts and permissions
- **Admin Settings**: Configure system settings, rates, and vocabulary
- **Scheduled Jobs**: Monitor automated processes

#### Top Bar

- **Search**: Quickly find projects, clients, or documents (coming soon)
- **Notifications**: View alerts and updates (coming soon)
- **Theme Toggle**: Switch between light and dark mode
- **Profile Menu**: Access about, help, and logout options

---

## Dashboard Overview

The Dashboard is your central hub for tracking work and priorities.

### Dashboard Sections

#### For Employees

**Active Projects**
- Projects you're currently assigned to
- Your role and allocation percentage
- Project status and health indicators
- Quick links to time entry

**Recent Time Entries**
- Your last 10 time entries for quick reference
- Edit or delete recent entries
- Jump to full time tracking page

**Expense Reports**
- Status of submitted expense reports
- Pending approvals
- Reimbursement tracking

#### For Project Managers

**Project Portfolio**
- Overview of all active projects
- Budget utilization and health scores
- Team capacity and utilization
- Projects requiring attention

**Team Workload**
- Resource allocation across projects
- Over-allocated team members
- Available capacity

#### For Executives

**Organization Metrics**
- Revenue and profitability trends
- Project pipeline and forecast
- Resource utilization
- Client portfolio health

---

## Core Features

### 1. Project Management

**Project Structure:**
- **Stages**: Major phases of work (e.g., Discovery, Design, Development, Deployment)
- **Epics**: Large bodies of work within a stage
- **Activities**: Specific tasks or deliverables
- **Assignments**: Team member allocations with hours and rates

**Key Capabilities:**
- Create projects from estimates or from scratch
- Define project timeline with start/end dates
- Set up custom project stages and milestones
- Allocate team members with specific roles
- Track budget vs. actuals in real-time
- Upload SOWs, change orders, and project documents

### 2. Time Tracking

**Logging Time:**
- Select project, stage, epic, and activity
- Enter hours worked
- Add descriptions of work performed
- Mark time as billable or non-billable
- Submit for approval (if required)

**Time Entry Views:**
- **Daily View**: Quick entry for today's work
- **Weekly View**: Grid view for bulk time entry across the week
- **Calendar View**: Visual calendar with drag-and-drop (coming soon)

**Approval Workflow:**
- Project Managers review and approve time entries
- Approved time becomes available for invoicing
- Rejected time requires correction and resubmission

### 3. Expense Management

**Submitting Expenses:**
1. Navigate to Expenses page
2. Click "New Expense Report"
3. Select project and expense type
4. Enter amount and description
5. Upload receipt image
6. Mark as billable or non-billable
7. Submit for approval

**Expense Categories:**
- Travel (airfare, mileage, rental car, parking)
- Meals & Entertainment
- Lodging
- Materials & Supplies
- Software & Subscriptions
- Other (with description)

**Approval Workflow:**
- Project Manager approval (first level)
- Executive approval for expenses over $500
- Approved expenses move to reimbursement processing
- Monthly reimbursement batches via ACH or check

### 4. Resource Allocation

**My Assignments Page:**
- View all your project assignments
- See role, allocation percentage, and hours
- Update assignment status (open → in progress → completed)
- Track hours logged vs. allocated hours
- View assignment timeline and dates

**For Project Managers:**
- Assign team members to projects
- Define roles, responsibilities, and allocation
- Set billing rates and pricing mode
- Manage assignment dates and capacity
- View cross-project resource utilization

### 5. Invoicing & Billing

**Creating Invoices (Billing Administrators):**
1. Navigate to Billing page
2. Select time period and projects
3. Review unbilled time entries and expenses
4. Create invoice batch
5. Preview invoice details
6. Generate PDF for client delivery
7. Export to QuickBooks Online (if configured)

**Invoice Components:**
- Billable time entries grouped by role or activity
- Billable expenses with receipts
- Fixed-fee line items for milestone billing
- Discounts and adjustments
- Payment terms and due dates

### 6. Program Estimates

Program Estimates are a specialized estimate type designed for large, multi-phase engagements that span multiple workstreams or delivery tracks.

**Creating a Program Estimate:**
1. Navigate to the Estimates page
2. Click **New Estimate**
3. Select **Program** as the estimate type
4. Enter program details (name, client, description)
5. Define staffing blocks with roles, hours, and rates
6. Use the PM Wizard to auto-generate project structure

**Estimate Types:**
Constellation supports four estimate types:
- **T&M (Time & Materials)**: Billed based on actual hours worked at agreed rates
- **Fixed Price**: Billed against defined milestones and deliverables
- **Retainer**: Ongoing monthly engagement with reserved capacity
- **Program**: Large-scale engagements with multiple phases, staffing blocks, and Gantt visualization

**Program Estimate Features:**
- **Staffing Blocks**: Define resource allocation blocks with specific roles, team members, start/end dates, and hours per block
- **Gantt View**: Visual timeline showing all staffing blocks across the program duration with drag-and-drop scheduling
- **PM Wizard**: Automated project setup wizard that converts a program estimate into a fully configured project with stages, epics, and assignments
- **Phase Management**: Organize work into distinct phases with separate budgets and timelines
- **Block Editing**: Add, modify, or remove staffing blocks with real-time total recalculation

**Converting a Program Estimate to a Project:**
1. Open the program estimate
2. Click **Convert to Project** or use the **PM Wizard**
3. The wizard creates project stages from estimate phases
4. Staffing blocks become resource assignments
5. Budget and rate information carries over automatically

### 7. Estimate Sharing

You can share estimates with other users to give them read-only access. This is useful for letting stakeholders review an estimate without granting them full project access.

**Sharing an Estimate:**
1. Open the estimate you want to share
2. Click the **Share** button in the toolbar
3. Search for and select the user you want to share with
4. The user will now see the estimate in their estimates list with a "Shared" badge

**What Shared Viewers Can See:**
- All line items, phases, and structure of the estimate
- Gantt timeline view (for program estimates)
- Total hours and billing amounts

**What Shared Viewers Cannot See:**
- Cost rates and total cost
- Margin and margin percentage
- Shared viewers cannot edit the estimate

**Important:** If a shared user already has a higher-level role (admin, billing admin, PM, or portfolio manager), their existing permissions are preserved — sharing does not restrict their access.

**Revoking Access:**
1. Open the estimate
2. Click the **Share** button
3. Find the user in the current shares list
4. Click **Revoke** to remove their access

Only admins, billing admins, PMs, and portfolio managers can share or revoke estimate access.

### 8. Invoice Report & Financial Analytics

The Invoice Report provides a comprehensive view of all finalized invoices with powerful filtering and comparison tools.

**Accessing the Invoice Report:**
1. Navigate to Financial Reports from the sidebar
2. The Invoice Report page opens with the current year's data by default

**Report Tab Features:**
- **Date Filtering**: Set custom start and end dates to view invoices for any period
- **Quick Date Buttons**: Use "Prior Year" to instantly view last year's invoices, or "Current Year" to reset to the current year
- **Client Filter**: Filter invoices by a specific client to focus on individual client portfolios
- **Invoice Type Filter**: Filter by Services, Expenses, or All Types
- **Subtotal Grouping**: Group subtotals by Month or Quarter for period-level summaries
- **Invoice Links**: Click any invoice number to jump directly to the full invoice batch detail
- **Excel Export**: Download the full report as an Excel spreadsheet

**Year-over-Year Comparison Tab:**
The YoY Comparison view lets you compare financial performance between the prior year and current year side by side.
- **Quarter Selection**: Check or uncheck Q1 through Q4 to compare specific quarters
- **Comparison Cards**: At-a-glance metrics showing Total Invoiced, Pre-Tax Amount, Amount Paid, and Outstanding for both years with variance indicators
- **Quarter-over-Quarter Table**: Detailed breakdown by quarter showing invoice counts, totals, and paid amounts with dollar and percentage variance
- **Year-over-Year Summary**: Full-year totals for all financial metrics (Invoice Count, Pre-Tax Amount, Tax, Total Invoiced, Amount Paid, Outstanding)
- **Variance Indicators**: Green arrows for growth, red arrows for decline, with both dollar amounts and percentages
- **Export**: Download the comparison data as an Excel file

---

## Project Governance (RAIDD)

The RAIDD Log provides a structured way to track and manage Risks, Action Items, Issues, Dependencies, and Decisions within each project. It improves governance, accountability, and visibility into items that can impact project delivery.

### Accessing the RAIDD Log

1. Navigate to any project detail page
2. Click the **RAIDD** tab
3. The RAIDD register shows all entries for that project

### Entry Types

| Type | Purpose | Example |
|------|---------|---------|
| **Risk** | Potential future problems | "Key developer may leave mid-project" |
| **Issue** | Current problems needing resolution | "API integration failing in staging environment" |
| **Action Item** | Tasks that need to be completed | "Schedule stakeholder review meeting" |
| **Dependency** | External dependencies the project relies on | "Waiting on client to provide access credentials" |
| **Decision** | Important decisions that have been made | "Decided to use Azure over AWS for hosting" |

### Creating a RAIDD Entry

1. Click **Add Entry** on the RAIDD tab
2. Select the entry **Type** (Risk, Issue, Action Item, Dependency, or Decision)
3. Enter a **Title** and optional **Description**
4. Set **Priority** (Critical, High, Medium, Low)
5. For risks: set **Impact** and **Likelihood** levels
6. Assign an **Owner** and optionally an **Assignee**
7. Set a **Due Date** if applicable
8. Add a **Category** for organization
9. For risks: add a **Mitigation Plan**
10. Click **Save**

### Managing RAIDD Entries

**Filtering & Sorting:**
- Filter by type, status, priority, owner, or due date
- Sort columns to find specific entries quickly
- Overdue action items are highlighted in red

**Status Workflow:**
- **Open** → **In Progress** → **Mitigated/Resolved/Closed**
- Items can also be **Deferred** or **Superseded**
- Decisions become locked (immutable) once their status changes from Open
- Risks can be converted to Issues while preserving lineage

**Exporting:**
- Click the **Export** button to download the RAIDD log as an Excel spreadsheet
- Export respects your current filters

### Governance Rules

- **Decisions** are immutable once they move past the "Open" status — this preserves the integrity of the decision record
- **Risks** can be converted to **Issues** when they materialize, maintaining a link to the original risk entry
- **Action Items** support parent entry references for traceability

---

## Deliverable Tracking

The Deliverables tab provides a structured way to track project deliverables from inception through client acceptance. Each deliverable is assigned an owner and follows a clear status workflow, giving the team and stakeholders visibility into what has been promised, what is in progress, and what has been accepted.

### Accessing Deliverables

1. Navigate to any project detail page
2. Click the **Deliverables** tab
3. The deliverables table shows all tracked items for that project

### Creating a Deliverable

1. Click **Add Deliverable** on the Deliverables tab
2. Enter a **Name** (required) and optional **Description**
3. Select an **Owner** (required) — the team member responsible for delivering this item
4. Optionally link to an **Epic** or **Stage** for traceability
5. Set a **Target Date** for when the deliverable is expected to be complete
6. Click **Save**

### Status Workflow

Each deliverable moves through a defined lifecycle:

| Status | Meaning |
|--------|---------|
| **Not Started** | Deliverable has been identified but work has not begun |
| **In Progress** | Active work is underway |
| **In Review** | Work is complete and under review or awaiting approval |
| **Accepted** | Client or stakeholder has formally accepted the deliverable |
| **Rejected** | Deliverable was reviewed and sent back for rework |

Status changes are automatically recorded in the deliverable's history, creating an audit trail of when each transition happened and who made the change.

### Viewing Status History

1. Click the history icon on any deliverable row
2. A dialog shows every status change with timestamps, the previous and new status, and the person who made the change
3. Use this to understand the timeline and any rework cycles

### AI-Powered Extraction from Narratives

If you have a project proposal, SOW, or scope document, Constellation can use AI to identify candidate deliverables automatically:

1. Click **Extract from Narrative** on the Deliverables tab
2. Paste the relevant text from your proposal or SOW into the text area
3. Click **Extract** — the AI will analyze the text and return a list of candidate deliverables
4. Review the candidates, check the ones you want to add, and assign an owner to each
5. Click **Add Selected** to create them all at once

This saves time when onboarding new projects with lengthy scope documents. Existing deliverables are automatically filtered out to prevent duplicates.

### Deliverables in Status Reports

Deliverables are automatically included in both AI-generated status reports and PowerPoint status report slides. The AI summarizes deliverable progress alongside milestones, time entries, expenses, and RAIDD items, giving stakeholders a complete picture of project health.

---

## AI-Powered Status Reports

Constellation can generate AI-powered status reports for any project, summarizing recent activity and governance items into a professional narrative.

### Generating a Status Report

1. Navigate to the project detail page
2. Click the **Generate Status Report** button
3. Select the reporting period (weekly or monthly)
4. Choose a summary style:
   - **Executive Brief** — High-level summary for leadership
   - **Detailed Update** — Comprehensive activity breakdown
   - **Client-Facing** — Polished report suitable for client communication
5. Click **Generate** to create the AI-powered report

### What's Included in the Report

The AI analyzes and summarizes:
- **Time entries** — Hours logged by team members and roles
- **Expenses** — Costs incurred during the period
- **Assignment status** — Team member allocations and progress
- **Milestone progress** — Payment milestones and deliverable status
- **Deliverables** — Current status of all tracked deliverables, including owner, target dates, and acceptance status
- **RAIDD items** — Open risks, issues, action items, dependencies, and recent decisions
  - Critical and overdue items are highlighted
  - RAIDD counts appear in the metadata bar above the report

### Using the Report

- **Copy** the report to clipboard for pasting into emails, Teams messages, or documents
- **Download** as formatted text
- Edit the text before sharing — AI output is a starting point you can refine

---

## Portfolio Management

### Portfolio Timeline

The Portfolio Timeline page (`/portfolio/timeline`) provides a cross-project Gantt-style view of all active project schedules, helping you visualize overlapping timelines and resource demands.

### Portfolio RAIDD Dashboard

The Portfolio RAIDD page (`/portfolio/raidd`) provides a cross-project view of all RAIDD entries across your active projects. This is available to administrators, project managers, and executives.

**Summary Cards:**
- Open Risks, Open Issues, Action Items, and Dependencies at a glance
- Critical and High priority item counts
- Overdue action items count
- Items closed this month
- Number of projects with RAIDD entries

**Filtering & Grouping:**
- **Status filter** — Show Open, In Progress, Closed, or All entries
- **Type filter** — Focus on just Risks, Issues, Action Items, Dependencies, or Decisions
- **Priority filter** — View only Critical, High, Medium, or Low items
- **Project filter** — Focus on a single project's entries
- **Group By** — Organize the table by Project, Type, Priority, or Status with count headers

**Exporting:**
- Click **Export** to download filtered entries as an Excel spreadsheet for stakeholder reporting or offline analysis

**Navigation:**
- Click any project name in the table to navigate directly to that project's RAIDD tab for detailed management

---

### 9. Client Management

**Client Records:**
- Basic information (name, address, contacts)
- Custom vocabulary overrides
- Project history and portfolio
- Billing settings and payment terms
- Associated Microsoft Teams (if configured)

**Vocabulary Customization:**
- Override system terminology per client
- Example: Change "Epic" to "Work Package"
- Cascades to all client projects automatically
- Maintains consistency in client communications

---

## User Roles

Constellation uses a six-tier role hierarchy. Each role inherits lower-tier capabilities and adds new permissions.

### Employee (Tier 1)
**Can:**
- Track time on assigned projects
- Submit expense reports
- View own assignments
- Access personal dashboard

**Cannot:**
- Create projects or clients
- Approve expenses
- Generate invoices
- Manage system settings

**Typical Users:** Consultants, Analysts, Developers

### Project Manager (Tier 2)
**Everything Employee can do, PLUS:**
- Create and manage clients
- Build detailed estimates
- Create and configure projects
- Allocate team resources
- Manage project budgets
- Upload project documents

**Typical Users:** Project Managers, Delivery Leads

### Portfolio Manager (Tier 3)
**Everything Project Manager can do, PLUS:**
- View all projects across the portfolio
- Access Portfolio Timeline and Portfolio RAIDD dashboards
- Monitor cross-project resource allocation
- View financial summaries and project health metrics
- Generate portfolio-level status reports

**Cannot:**
- Create or manage invoices
- Approve expense reports
- Manage billing rates or system settings
- Administer user accounts

**Typical Users:** Program Managers, Portfolio Directors, Delivery Managers

### Billing Administrator (Tier 4)
**Everything Employee can do, PLUS:**
- Create and manage invoices
- Process reimbursement batches
- Approve expense reports
- Manage billing rates
- Export financial data

**Typical Users:** Finance Team, Accounting

### Executive (Tier 5)
**Everything Employee can do, PLUS:**
- Approve high-value expenses ($500+)
- View organization-wide reports
- Access cross-project analytics
- Monitor resource utilization
- View profitability by client/project

**Typical Users:** C-Level, Directors, VP

### Administrator (Tier 6)
**Everything, including:**
- Manage user accounts
- Configure system settings
- Set up vocabulary defaults
- Configure Microsoft 365 integration
- Manage SharePoint containers
- Access scheduled jobs monitoring
- Platform administration

**Typical Users:** IT Administrators, System Admins

---

## Common Workflows

### End-to-End Project Workflow

**1. Estimation Phase (PM)**
- Create client record
- Build detailed estimate with phases, roles, and hours
- Define assumptions and exclusions
- Generate estimate PDF for proposal
- Convert approved estimate to project

**2. Project Setup (PM)**
- Configure project stages and milestones
- Set up epics and activities
- Allocate team members with roles
- Define billing rates and pricing
- Upload SOW and contract documents
- (Optional) Create Microsoft Team and Planner

**3. Execution (All Team)**
- Team members log time daily or weekly
- Submit expenses with receipts
- Update assignment status
- PM monitors budget vs. actuals
- PM reviews and approves time/expenses

**4. Billing (Billing Admin)**
- Review unbilled time and expenses
- Create invoice batch
- Generate invoice PDFs
- Export to QuickBooks (if configured)
- Send invoices to clients
- Track payment status

**5. Project Close (PM)**
- Complete final time and expense entries
- Generate final invoices
- Archive project documents
- Mark project as closed
- Conduct lessons learned review

### Weekly Time Entry Workflow

**Employee Process:**
1. **Monday Morning**: Review assignments for the week
2. **Daily**: Log time at end of each day (or use timer)
3. **Friday EOD**: Review and submit all time for the week
4. **Following Week**: Address any PM feedback or rejections

**PM Review:**
1. **Monday**: Review team's submitted time from previous week
2. **Review Each Entry**: Verify project, role, and hours are accurate
3. **Approve or Reject**: Provide feedback on rejections
4. **Escalate Issues**: Contact team members if clarification needed

### Expense Reimbursement Workflow

**1. Employee Submission**
- Submit expenses within 30 days of incurrence
- Upload clear receipt images
- Categorize expenses correctly
- Mark as billable or non-billable
- Add detailed descriptions

**2. PM Approval**
- Review expense amount and category
- Verify receipt is clear and complete
- Confirm project allocation is correct
- Approve or reject with comments

**3. Executive Approval (if >$500)**
- Review high-value expenses
- Verify business justification
- Approve or escalate

**4. Reimbursement Processing**
- Billing Admin creates monthly reimbursement batch
- Export to accounting system
- Process ACH payments
- Update reimbursement status

---

## Microsoft 365 Integration

### Overview

Constellation integrates seamlessly with your Microsoft 365 environment to enhance collaboration and reduce duplicate data entry.

### Features

**Azure AD Authentication (SSO)**
- Single sign-on with Microsoft credentials
- Automatic user provisioning
- Role mapping from Azure AD groups (configurable)

**Microsoft Teams Integration**
- Automatic Team creation for new clients
- Dedicated channels for each project
- Team member management based on assignments
- SharePoint site provisioned with Team

**Microsoft Planner Integration**
- Automatic Planner plan creation per project
- Tasks created from project assignments
- Bidirectional sync (coming soon)
- Stage-based buckets for organization
- Assignment status synchronization

**SharePoint Document Storage**
- Project document repository
- SOW and contract storage
- Receipt and invoice storage
- Metadata tagging for easy retrieval
- Version control and history

### Enabling M365 Integration

**For Administrators:**
1. Navigate to Admin Settings → Microsoft 365
2. Configure Azure AD app registration
3. Set Graph API permissions
4. Enable desired integration features
5. Test connection with sample project

**For Project Managers:**
1. When creating a project, check "Create Microsoft Team"
2. Select "Create Planner" for task management
3. Enable "Auto-sync assignments to Planner"
4. Team and Planner are created automatically

### Troubleshooting M365 Integration

**Issue**: Microsoft SSO not working
- Verify Azure AD app registration is complete
- Check that tenant admin has granted consent
- Ensure user has active Microsoft 365 license
- Try clearing browser cache and cookies

**Issue**: Planner sync not working
- Verify Outlook is connected first (prerequisite)
- Check that Graph API permissions include Tasks.ReadWrite
- Ensure project has "Sync Enabled" toggled on
- Review scheduled jobs log for error messages

---

## HubSpot CRM Integration

### Overview

Constellation integrates with HubSpot CRM to bridge the gap between sales pipeline and project delivery. This integration allows you to view CRM deals, import contacts, and link deals to Constellation projects.

### CRM Deals Page

The CRM Deals page (`/crm/deals`) provides a unified view of your HubSpot pipeline within Constellation.

**Accessing CRM Deals:**
1. Navigate to **CRM Deals** from the sidebar (available to Project Managers, Executives, and Administrators)
2. View all active deals from your HubSpot pipeline
3. Filter deals by stage, owner, or amount

**Deal Information Displayed:**
- Deal name and pipeline stage
- Deal amount and close date
- Associated contacts and company
- Deal owner and last activity date
- Link to the full deal in HubSpot

### Contact Import

Import HubSpot contacts as Constellation client contacts to avoid duplicate data entry.

**Importing Contacts:**
1. Open a deal on the CRM Deals page
2. Click **Import Contacts** to pull associated contacts from HubSpot
3. Review and confirm the contact details
4. Contacts are added to the linked Constellation client record

### Deal-to-Project Linking

Link HubSpot deals to Constellation projects for end-to-end visibility from sales to delivery.

**Linking a Deal:**
1. Navigate to CRM Deals
2. Select a deal from the list
3. Click **Link to Project** and choose an existing Constellation project (or create a new one)
4. Once linked, the project detail page shows the associated deal information
5. Deal stage changes in HubSpot are reflected in Constellation

### Configuration

**For Administrators:**
1. Navigate to **Admin Settings → Integrations**
2. Enter your HubSpot API key or connect via OAuth
3. Configure sync frequency and field mappings
4. Test the connection with a sample deal pull
5. Enable the CRM Deals sidebar item for appropriate roles

---

## Settings & Preferences

### User Profile Settings

**Personal Information:**
- Name and email address
- Phone number
- Job title and department
- Time zone preference

**Notification Preferences (Coming Soon):**
- Email notification settings
- In-app notification preferences
- Digest frequency (daily, weekly)
- Notification types to receive

**Display Preferences:**
- Theme (light/dark mode)
- Language preference
- Date and time format
- Default dashboard view

### Organization Settings (Administrators)

**Vocabulary Configuration:**
- Set organization-wide terminology
- Define custom labels for all modules
- Configure industry-specific terminology
- Preview vocabulary changes before applying

**Billing Rates:**
- Standard rates by role
- Client-specific rate overrides
- Project-specific rate overrides
- Effective date management
- Rate history and auditing

**System Settings:**
- Company name and branding
- Fiscal year configuration
- Expense approval thresholds
- Time entry requirements
- Invoice numbering format

---

## Tips & Best Practices

### For All Users

**Time Entry Best Practices:**
- Log time daily for accuracy (don't wait until Friday!)
- Provide detailed descriptions of work performed
- Use consistent activity names for better reporting
- Review time entries before submitting
- Keep track of non-billable admin time

**Expense Management Tips:**
- Take clear photos of receipts immediately
- Submit expenses within 30 days
- Categorize expenses accurately
- Include project codes for billable expenses
- Save digital copies of all receipts

**Communication:**
- Use Microsoft Teams for project collaboration
- Tag team members in Planner tasks
- Update assignment status regularly
- Notify PM of any blockers or issues early
- Participate in project retrospectives

### For Project Managers

**Project Setup:**
- Define clear stages and milestones upfront
- Assign team members with realistic allocations
- Set up vocabulary at the client level for consistency
- Configure Microsoft Teams integration early
- Upload SOW and contract documents immediately

**Resource Management:**
- Monitor team capacity and utilization weekly
- Avoid over-allocating team members (>100%)
- Balance workload across the team
- Identify and address resource conflicts early
- Use cross-project resource view regularly

**Budget Monitoring:**
- Review budget vs. actuals weekly
- Address variances promptly
- Communicate budget concerns to stakeholders early
- Track change orders separately
- Use estimate accuracy to improve future estimates

**Time & Expense Approval:**
- Review and approve time weekly (don't let it pile up)
- Provide constructive feedback on rejections
- Follow up on missing time entries
- Spot check billable vs. non-billable classifications
- Address expense issues within 48 hours

### For Billing Administrators

**Invoice Generation:**
- Review unbilled time/expenses before creating batches
- Verify billing rates are correct
- Check for client-specific billing requirements
- Preview invoices before finalizing
- Export to QBO immediately after creation

**Month-End Close:**
- Generate all invoices by the 5th of the month
- Process reimbursement batches by the 15th
- Reconcile payments received
- Archive invoice PDFs
- Run financial reports for leadership

### For Administrators

**System Maintenance:**
- Review scheduled jobs daily
- Monitor system performance
- Keep vocabulary definitions current
- Audit user permissions quarterly
- Update rate tables as needed

**User Management:**
- Provision new users within 24 hours of request
- Assign appropriate roles based on responsibilities
- Disable accounts promptly when employees leave
- Review user activity logs for security
- Provide onboarding training for new users

**Data Quality:**
- Archive completed projects regularly
- Clean up test data
- Verify client information is current
- Audit billing rates for accuracy
- Remove duplicate records

---

## Troubleshooting

### Common Issues

#### Login Problems

**Issue**: "Invalid credentials" error
- **Solution**: 
  - Verify email and password are correct
  - Check if caps lock is on
  - Try password reset (development mode only)
  - Contact IT admin if SSO is not working

**Issue**: Microsoft SSO not working
- **Solution**:
  - Verify your organization has enabled Microsoft SSO
  - Check with IT admin for Azure AD tenant consent
  - Clear browser cookies and cache
  - Try a different browser (Chrome or Edge recommended)
  - Ensure you have an active Microsoft 365 license

**Issue**: Account locked or disabled
- **Solution**:
  - Contact IT support at ITHelp@synozur.com
  - Verify employment status with HR
  - Check if account has "Can Login" enabled

#### Data Not Appearing

**Issue**: Projects or assignments not visible
- **Solution**:
  - Check filter settings (active vs. closed)
  - Verify you have permissions to view that data
  - Try refreshing the page (Ctrl+F5 or Cmd+Shift+R)
  - Clear browser cache if problem persists

**Issue**: Time entries not showing
- **Solution**:
  - Check date range filter
  - Verify project selection is correct
  - Ensure time entries were saved (check for error messages)
  - Contact PM if entries were rejected

**Issue**: Microsoft Planner tasks not syncing
- **Solution**:
  - Verify project has "Sync Enabled" toggled on
  - Check that Microsoft 365 connection is active in Settings
  - Review scheduled jobs log for sync errors
  - Try manual sync trigger in project settings
  - Ensure you have Planner license in Microsoft 365

#### Performance Issues

**Issue**: Application is slow or unresponsive
- **Solution**:
  - Check your internet connection speed
  - Close unnecessary browser tabs
  - Clear browser cache and cookies
  - Try a different browser
  - Disable browser extensions temporarily
  - Contact IT support if problem persists

**Issue**: Page not loading or white screen
- **Solution**:
  - Hard refresh the page (Ctrl+F5 or Cmd+Shift+R)
  - Check browser console for errors (F12)
  - Verify JavaScript is enabled
  - Try incognito/private mode
  - Contact IT support with error details

#### File Upload Issues

**Issue**: Receipt or document upload fails
- **Solution**:
  - Check file size (max 10MB per file)
  - Verify file format is supported (PDF, PNG, JPG, DOCX)
  - Try compressing large images
  - Ensure stable internet connection
  - Try uploading one file at a time

### Getting Help

#### Documentation Resources
- **This User Guide**: Overview and common tasks
- **[Detailed User Guide](user-guide/SCDP-User-Guide.md)**: Comprehensive feature documentation
- **[Administrator Guide](user-guide/SCDP-Administrator-Guide.md)**: System configuration and admin tasks
- **[Changelog](CHANGELOG.md)**: Version history and release notes
- **[Roadmap](ROADMAP.md)**: Planned features and future direction

#### Support Channels

**IT Support:**
- Email: ITHelp@synozur.com
- Response time: Within 4 business hours
- For: Technical issues, account problems, system errors

**Your Project Manager:**
- For: Project-specific questions, assignment issues, time approval questions

**Your Administrator:**
- For: Access requests, permission issues, configuration questions

**Training Resources:**
- Onboarding guide for new users
- Video tutorials (coming soon)
- Monthly office hours (check with administrator)

#### Reporting Issues

When reporting problems, please include:
1. Your name and email
2. Version number (from About page)
3. Steps to reproduce the issue
4. Expected vs. actual behavior
5. Screenshots or error messages
6. Browser type and version
7. Date and time the issue occurred

---

## Detailed Documentation

This guide provides an overview of Constellation's key features and workflows. For more detailed information, refer to these comprehensive resources:

### Core Documentation

**[SCDP User Guide](user-guide/SCDP-User-Guide.md)**
- Complete feature-by-feature guide
- Detailed workflows with screenshots
- Role-specific instructions
- Advanced tips and tricks
- 3500+ lines of comprehensive documentation

**[SCDP Administrator Guide](user-guide/SCDP-Administrator-Guide.md)**
- System configuration and setup
- User and permission management
- Vocabulary and rate configuration
- Microsoft 365 integration setup
- SharePoint configuration
- Scheduled jobs monitoring
- Troubleshooting and maintenance

### Product Information

**[Changelog](CHANGELOG.md)**
- Complete version history
- Release notes for all versions
- New features and enhancements
- Bug fixes and improvements
- Upgrade notes and breaking changes

**[Roadmap](ROADMAP.md)**
- Product vision and strategy
- Planned features and enhancements
- Timeline and priorities
- Feature status updates
- How to provide feedback

### Technical Documentation

**Design Documents:**
- [Multi-Tenancy Design](design/multi-tenancy-design.md)
- [Microsoft 365 Integration](design/microsoft-365-project-integration.md)
- [Task Assignment Notifications](design/task-assignment-notifications.md)

**Implementation Plans:**
- [Notifications Plan](../notifications-plan.md)
- [File Migration Plan](../FILE_MIGRATION_PLAN.md)

---

## Appendix: Glossary

**Assignment**: Allocation of a person to a project with a specific role, hours, and time period.

**Billable**: Time or expenses that can be invoiced to the client.

**Client**: Organization that purchases consulting services.

**Epic**: Large body of work within a project stage, typically comprising multiple activities.

**Estimate**: Preliminary project scope, timeline, and cost calculation created during the sales process.

**Program Estimate**: A specialized estimate type for large, multi-phase engagements with staffing blocks, Gantt visualization, and PM Wizard conversion.

**Invoice Batch**: Collection of time entries and expenses grouped together for client billing.

**Non-Billable**: Time or expenses that cannot be invoiced to the client (internal, administrative, or overhead).

**Project**: Defined body of work delivered for a client, including scope, timeline, team, and budget.

**Rack Rate**: Internal standard rate before discounts (hidden from non-admins).

**Reimbursement Batch**: Collection of approved expense reports processed together for employee payment.

**SOW (Statement of Work)**: Contract document defining project scope, deliverables, timeline, and terms.

**Stage**: Major phase of work within a project (e.g., Discovery, Design, Development, Deployment).

**Vocabulary**: Customizable terminology used throughout the platform (org, client, or project level).

---

*Last Updated: March 1, 2026*  
*Version: 1.4*  
*Maintained by: Synozur IT Team*  
*Questions? Contact ITHelp@synozur.com*
