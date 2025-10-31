# SCDP User Guide
## Synozur Consulting Delivery Platform

**Version:** 1.0  
**Last Updated:** October 31, 2025  
**Document Type:** Employee User Guide

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Core Features by Role](#3-core-features-by-role)
4. [Common Workflows](#4-common-workflows)
5. [Feature-by-Feature Guide](#5-feature-by-feature-guide)
6. [Tips & Best Practices](#6-tips--best-practices)
7. [Getting Help](#7-getting-help)

---

## 1. Getting Started

### 1.1 Accessing SCDP

#### Production Login (Microsoft SSO)

![Login Screen - Microsoft SSO](screenshots/01-login-sso.png)  
*Figure 1: SCDP login screen with Microsoft authentication*

**Steps:**
1. Navigate to your SCDP URL (provided by IT administrator)
2. Click the **"Sign in with Microsoft"** button
3. Enter your company Microsoft 365 credentials
4. You'll be automatically redirected to your dashboard

**What you need:**
- Active Microsoft 365 account
- SCDP user account with "Can Login" enabled
- Modern web browser (Chrome, Edge, Firefox, Safari)

#### Development Login (Email/Password)

![Login Screen - Development Mode](screenshots/01-login-dev.png)  
*Figure 2: Development environment login with email/password*

For development and testing environments:
1. Enter your email address
2. Enter your password
3. Click **"Sign In"**

**Note:** Development mode displays "Development -" in the browser title bar.

---

### 1.2 Your Dashboard

![Employee Dashboard](screenshots/02-dashboard-employee.png)  
*Figure 3: Employee dashboard showing active projects and recent activity*

After logging in, you'll see your personalized dashboard with:

**Top Section:**
- **Welcome message** with your name
- **Quick stats** showing your current workload
- **Pending actions** requiring your attention

**Main Content:**
- **Active Projects** - Projects you're currently assigned to
- **Recent Time Entries** - Your last 10 time entries
- **Expense Reports** - Status of your submitted expenses
- **Upcoming Deadlines** - Milestones and deliverables

**Dashboard varies by role:**
- Employees see personal assignments and time tracking
- Project Managers see project portfolio and team capacity
- Administrators see system health and user activity
- Executives see organization-wide metrics

![Project Manager Dashboard](screenshots/02-dashboard-pm.png)  
*Figure 4: Project Manager dashboard with portfolio view*

![Administrator Dashboard](screenshots/02-dashboard-admin.png)  
*Figure 5: Administrator dashboard with system overview*

---

### 1.3 Navigation

![Main Navigation Menu](screenshots/03-navigation-menu.png)  
*Figure 6: Main navigation organized by user persona*

The navigation menu adapts based on your role and permissions:

#### For All Users:
- **Dashboard** - Your personalized home screen
- **Time Tracking** - Log and manage your hours
- **My Assignments** - View your project allocations
- **Expenses** - Submit and track expense reports

#### For Project Managers:
- **Projects** - View and manage all projects
- **Clients** - Client database and contacts
- **Estimates** - Create and manage project estimates
- **Resource Management** - Allocate team members to projects

#### For Billing Administrators:
- **Billing** - Create invoices and manage payments
- **Expense Approval** - Review submitted expenses
- **Reimbursement Batches** - Process employee reimbursements

#### For Administrators:
- **Users** - Manage user accounts and permissions
- **Rates** - Configure billing rates and overrides
- **System Settings** - Configure vocabulary and defaults
- **SharePoint** - Configure document storage

#### For Executives:
- **Reports** - Access analytics and dashboards
- **Expense Approval** - Review team expenses
- **Cross-Project Resource** - Organization-wide resource view

---

## 2. User Roles & Permissions

SCDP uses a five-tier role hierarchy. Each role inherits capabilities and adds new permissions.

### 2.1 Employee (Basic User)

![Employee Role Badge](screenshots/04-role-employee.png)

**Primary Functions:**
- Track time on assigned projects
- Submit expense reports with receipts
- View personal assignments and schedule
- Access personal dashboard

**Permissions:**
✅ Log time entries  
✅ Create expense reports  
✅ View own assignments  
✅ View assigned project details  
❌ Create or edit projects  
❌ Approve expenses  
❌ Generate invoices  
❌ Manage users or settings  

**Typical Users:** Consultants, Analysts, Developers, Designers

---

### 2.2 Project Manager (PM)

![Project Manager Role Badge](screenshots/04-role-pm.png)

**Everything an Employee can do, PLUS:**

**Primary Functions:**
- Create and manage client records
- Build detailed estimates
- Create and configure projects
- Allocate resources to projects
- Track project budgets and progress
- Upload SOWs and change orders
- Manage project structure (epics, stages, activities)

**Additional Permissions:**
✅ Create/edit clients  
✅ Create/edit estimates  
✅ Create/edit projects  
✅ Allocate team resources  
✅ Upload project documents  
✅ View team capacity  
❌ Approve expense reports  
❌ Generate invoices  
❌ Process reimbursements  
❌ Manage system settings  

**Typical Users:** Project Managers, Delivery Leads, Practice Leads

---

### 2.3 Billing Administrator

![Billing Admin Role Badge](screenshots/04-role-billing.png)

**Everything an Employee can do, PLUS:**

**Primary Functions:**
- Create and manage invoices
- Process reimbursement batches
- Approve expense reports
- Manage payment milestones
- Track invoice status and payments
- Export billing data

**Additional Permissions:**
✅ Create invoice batches  
✅ Approve expense reports  
✅ Process reimbursements  
✅ Manage payment milestones  
✅ View all financial data  
✅ Export billing reports  
❌ Create/edit projects  
❌ Manage users  
❌ Configure system settings  

**Typical Users:** Finance Managers, Billing Coordinators, Accounting Staff

---

### 2.4 Executive

![Executive Role Badge](screenshots/04-role-executive.png)

**Broad View Access:**

**Primary Functions:**
- View all projects and reports
- Approve expense reports (high-level)
- Access organization-wide analytics
- Review financial dashboards
- Monitor resource utilization across projects

**Permissions:**
✅ View all projects (read-only)  
✅ Approve expense reports  
✅ Access all reports and analytics  
✅ View cross-project resources  
✅ View financial summaries  
❌ Edit projects directly  
❌ Process billing or reimbursements  
❌ Manage users or settings  

**Typical Users:** Partners, Directors, C-Level Executives

---

### 2.5 Administrator

![Administrator Role Badge](screenshots/04-role-admin.png)

**Full System Access:**

**Primary Functions:**
- Everything all other roles can do
- Manage user accounts and permissions
- Configure system settings
- Set up SharePoint integration
- Manage rates and pricing
- Customize vocabulary and terminology
- Access audit logs and system diagnostics

**Complete Permissions:**
✅ All employee capabilities  
✅ All project manager capabilities  
✅ All billing administrator capabilities  
✅ All executive capabilities  
✅ Manage users and permissions  
✅ Configure system settings  
✅ Set up integrations  
✅ Access system administration  

**Typical Users:** IT Administrators, System Administrators, Operations Managers

---

## 3. Core Features by Role

### 3.1 For All Employees

#### Time Tracking

![Time Tracking Interface](screenshots/05-time-tracking.png)  
*Figure 7: Time tracking interface with recent entries*

**Adding a Time Entry:**

![Add Time Entry Dialog](screenshots/05-time-entry-add.png)  
*Figure 8: Add time entry dialog*

1. Navigate to **Time Tracking** from the main menu
2. Click the **"Add Time Entry"** button
3. Fill in the required information:
   - **Project:** Select from dropdown (shows only your assigned projects)
   - **Date:** Date you performed the work
   - **Hours:** Enter in decimal format (e.g., 2.5 for 2 hours 30 minutes)
   - **Description:** Detailed description of work performed
   - **Epic/Stage/Activity:** (Optional) Link to project structure
4. Click **"Save"** to record your entry

**Tips for Accurate Time Tracking:**
- ✅ **Track daily** for best memory retention
- ✅ **Be specific** in descriptions (helps with client billing)
- ✅ **Use decimals** correctly: 2.25 = 2 hours 15 minutes
- ✅ **Link to project structure** when possible for better reporting
- ❌ **Don't wait** until Friday to track the whole week
- ❌ **Don't use vague** descriptions like "work" or "meeting"

**Editing Time Entries:**

![Edit Time Entry](screenshots/05-time-entry-edit.png)  
*Figure 9: Editing an existing time entry*

- Click on any unbilled entry to edit
- Cannot edit entries that have been invoiced
- All changes are logged in the audit trail

**Mobile-Optimized:**

![Mobile Time Tracking](screenshots/05-time-tracking-mobile.png)  
*Figure 10: Time tracking on mobile devices*

The time tracking interface is optimized for phone and tablet use, making it easy to log hours on the go.

---

#### Expense Management

![Expense Reports List](screenshots/06-expenses-list.png)  
*Figure 11: List of expense reports with status indicators*

**Creating an Expense Report:**

![Create Expense Report](screenshots/06-expense-create.png)  
*Figure 12: Creating a new expense report*

1. Navigate to **Expenses** → **My Expense Reports**
2. Click **"Create Expense Report"**
3. Enter report details:
   - **Report Name:** Descriptive name (e.g., "October Travel Expenses")
   - **Description:** Optional context
4. Click **"Create Report"**

**Adding Individual Expenses:**

![Add Expense Item](screenshots/06-expense-add-item.png)  
*Figure 13: Adding an expense item with receipt*

1. Within your expense report, click **"Add Expense"**
2. Fill in expense details:
   - **Date:** When expense was incurred
   - **Amount:** Dollar amount (no currency symbol needed)
   - **Category:** Select from dropdown:
     - Meals & Entertainment
     - Travel (flights, trains, etc.)
     - Lodging (hotels)
     - Ground Transportation (taxi, rideshare, parking)
     - Supplies & Materials
     - Other
   - **Description:** What the expense was for
   - **Project:** (Optional) Link to specific project
3. **Upload Receipt:**
   - Click **"Upload Receipt"** or drag-and-drop
   - Supported formats: JPG, PNG, PDF
   - Max size: 10MB per file
4. Click **"Add Expense"**

**Submitting for Approval:**

![Submit Expense Report](screenshots/06-expense-submit.png)  
*Figure 14: Submitting expense report for approval*

1. Review all expenses in your report
2. Ensure all receipts are uploaded
3. Click **"Submit for Approval"**
4. You'll receive email confirmation of submission

**Expense Report Workflow:**

![Expense Workflow Diagram](screenshots/06-expense-workflow.png)  
*Figure 15: Expense report approval workflow*

| Status | Description | Your Actions |
|--------|-------------|--------------|
| **Draft** | Still being edited | Add expenses, upload receipts |
| **Submitted** | Awaiting manager review | Wait for approval, monitor email |
| **Approved** | Ready for reimbursement | No action needed, wait for payment |
| **Rejected** | Needs revision | Read comments, make corrections, resubmit |
| **Reimbursed** | Payment processed | Check your paycheck |

**Email Notifications:**

![Expense Approval Email](screenshots/06-expense-email.png)  
*Figure 16: Email notification for expense approval*

You'll receive automated emails for:
- Submission confirmation
- Approval notification
- Rejection notification (with comments)
- Reimbursement confirmation

**Important Rules:**
- 📸 **Upload receipts immediately** - Don't lose them!
- 📅 **Submit within 30 days** of expense
- 💰 **Personal expenses** must be separate
- 📝 **Accurate categorization** helps with reporting
- ✅ **Complete reports** process faster

---

#### Viewing Your Assignments

![My Assignments View](screenshots/07-my-assignments.png)  
*Figure 17: Personal assignments view showing all allocated projects*

**Understanding Your Assignments:**

1. Navigate to **My Assignments** from the menu
2. View all projects where you're allocated:
   - **Project Name** and client
   - **Your Role** on the project
   - **Allocation** (hours per week or percentage)
   - **Date Range** (when you're assigned)
   - **Project Manager** contact

**Assignment Details:**

![Assignment Details](screenshots/07-assignment-details.png)  
*Figure 18: Detailed view of a single assignment*

Click on any assignment to see:
- Full project description
- Your specific responsibilities
- Project timeline and milestones
- Team members
- Budget utilization

**Calendar View:**

![Assignment Calendar](screenshots/07-assignment-calendar.png)  
*Figure 19: Calendar view of assignments over time*

Switch to calendar view to see:
- Visual timeline of all assignments
- Overlapping projects
- Available capacity
- Upcoming start/end dates

---

### 3.2 For Project Managers

#### Managing Clients

![Clients List](screenshots/08-clients-list.png)  
*Figure 20: Client database with status indicators*

**Creating a New Client:**

![Create Client Form](screenshots/08-client-create.png)  
*Figure 21: New client creation form*

1. Navigate to **Clients** → **Add Client**
2. Enter basic information:
   - **Client Name:** Full legal name
   - **Status:** 
     - Pending (leads, prospects)
     - Active (current clients)
     - Inactive (paused relationships)
     - Archived (past clients)
   - **Currency:** Default is USD
3. Add contact information:
   - **Billing Contact:** Primary billing contact name
   - **Contact Name:** Main point of contact
   - **Contact Address:** Physical or mailing address
4. Click **"Create Client"**

**Document Management:**

![Client Documents](screenshots/08-client-documents.png)  
*Figure 22: Client document management section*

**Upload MSA (Master Services Agreement):**
1. Go to client detail page
2. Scroll to **"MSA Information"** section
3. Click **"Upload MSA"**
4. Select PDF file
5. Enter **MSA Date** (when signed)
6. Document uploads to SharePoint automatically

**Upload NDA (Non-Disclosure Agreement):**
- Same process as MSA
- Both documents stored in SharePoint
- Direct links available from client record

**Client Detail View:**

![Client Detail Page](screenshots/08-client-detail.png)  
*Figure 23: Complete client detail page*

From the client detail page you can:
- Edit client information
- View all associated projects
- Access estimates created for client
- See billing history
- Download documents (MSA, NDA)
- Track relationship timeline

---

#### Building Estimates

![Estimates List](screenshots/09-estimates-list.png)  
*Figure 24: List of estimates with status and client*

**Creating a New Estimate:**

![Create Estimate Dialog](screenshots/09-estimate-create.png)  
*Figure 25: New estimate creation dialog*

1. Navigate to **Estimates** → **Create Estimate**
2. Choose estimate type:
   - **Detailed Estimate:** Line-by-line breakdown with resources
   - **Block Estimate:** Simple total (hours or dollars)
3. Select **Pricing Type:**
   - **Hourly:** Rate × hours calculation
   - **Fixed:** Set price regardless of hours
4. Select **Client** from dropdown
5. (Optional) Link to existing project
6. Click **"Create Estimate"**

---

##### Detailed Estimates

![Detailed Estimate Builder](screenshots/09-estimate-detailed.png)  
*Figure 26: Detailed estimate builder interface*

**Adding Line Items:**

![Add Line Item](screenshots/09-estimate-add-line.png)  
*Figure 27: Adding a line item to estimate*

1. Click **"Add Line Item"**
2. Enter details:
   - **Description:** Specific task or deliverable
   - **Epic/Stage/Activity:** Organizational structure
   - **Workstream:** (Optional) Parallel work track
   - **Base Hours:** Core time estimate
   - **Factor:** Multiplier (e.g., 4 interviews × 3 hours each = factor of 4)
   - **Size:** Small/Medium/Large (applies multiplier)
   - **Complexity:** Small/Medium/Large (applies multiplier)
   - **Confidence:** High/Medium/Low (applies buffer)
   - **Rate:** Billing rate (pre-populated from roles)
   - **Cost Rate:** Internal cost (for margin calculation)
   - **Assigned User:** (Optional) Specific resource

3. System automatically calculates:
   - **Adjusted Hours** = Base Hours × Factor × Size × Complexity × Confidence
   - **Total Amount** = Adjusted Hours × Rate
   - **Margin** = Total Amount - (Adjusted Hours × Cost Rate)

**Inline Editing:**

![Inline Edit Estimate](screenshots/09-estimate-inline-edit.png)  
*Figure 28: Inline editing of estimate values*

- Click any cell to edit directly
- Changes auto-save
- Calculations update in real-time
- Locked after estimate marked "Final"

**Organizing by Structure:**

![Estimate Hierarchy](screenshots/09-estimate-hierarchy.png)  
*Figure 29: Hierarchical view with epics, stages, and activities*

**Create Epics:**
1. Click **"Manage Epics"**
2. Add epic names (e.g., "Discovery Phase," "Design Phase")
3. Set order
4. Link line items to epics

**Create Stages within Epics:**
1. Within epic, click **"Add Stage"**
2. Name stage (e.g., "Requirements Gathering")
3. Link line items to stages

**Create Activities within Stages:**
1. Within stage, click **"Add Activity"**
2. Name activity (e.g., "Stakeholder Interviews")
3. Link line items to activities

This creates a hierarchy:
```
Epic: Discovery Phase
  └─ Stage: Requirements Gathering
      └─ Activity: Stakeholder Interviews
          └─ Line Item: Conduct 4 stakeholder interviews (4 × 3 hrs)
```

**Payment Milestones:**

![Payment Milestones](screenshots/09-estimate-milestones.png)  
*Figure 30: Payment milestone configuration*

For milestone-based billing:
1. Click **"Add Payment Milestone"**
2. Enter:
   - **Milestone Name** (e.g., "Phase 1 Completion")
   - **Description** of deliverables
   - **Amount** (fixed dollar amount) OR
   - **Percentage** (of total project value)
   - **Due Date** (when payment expected)
3. Milestones carry over to project when created

**Estimate Totals:**

![Estimate Summary](screenshots/09-estimate-summary.png)  
*Figure 31: Estimate summary showing totals and margins*

The summary section shows:
- **Total Hours:** Sum of all adjusted hours
- **Total Fees:** Sum of all line item charges
- **Margin:** Total profit (fees - costs)
- **Margin %:** Profit percentage
- **Presented Total:** Amount shown to customer (can override)

---

##### Block Estimates

![Block Estimate Form](screenshots/09-estimate-block.png)  
*Figure 32: Block estimate for retainer or fixed-price work*

For simpler retainer or fixed-price estimates:

1. Enter **Block Hours:** Total hours allocated
2. Enter **Block Dollars:** Total dollar amount
3. Enter **Block Description:** Scope of work
4. Optionally set **Fixed Price:** Override calculated amount

Block estimates are ideal for:
- Monthly retainers
- Fixed-price projects
- Quick quotes
- Simple engagements

---

##### Estimate Status Workflow

![Estimate Status Flow](screenshots/09-estimate-status.png)  
*Figure 33: Estimate status progression*

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| **Draft** | Work in progress | Full editing, can delete |
| **Final** | Ready for client | Line items locked, can export |
| **Sent** | Delivered to client | No editing, awaiting response |
| **Approved** | Client accepted | Can create project |
| **Rejected** | Client declined | Can revise or archive |

**Changing Status:**
1. Open estimate
2. Click status dropdown in header
3. Select new status
4. Confirm the change

**⚠️ Important:** Once marked "Final," line items cannot be edited. This prevents accidental changes to client-facing estimates.

**Export Options:**

![Estimate Export](screenshots/09-estimate-export.png)  
*Figure 34: Estimate export options*

- **Excel:** Full data export for analysis
- **PDF:** Client-ready presentation
- **AI Text:** Generate proposal narrative
- **CSV:** Import to other systems

---

#### Creating Projects

![Projects List](screenshots/10-projects-list.png)  
*Figure 35: Project portfolio view*

**Two Ways to Create Projects:**

##### Option 1: From Approved Estimate

![Create Project from Estimate](screenshots/10-project-from-estimate.png)  
*Figure 36: Creating project from approved estimate*

1. Open approved estimate
2. Click **"Create Project"** button
3. System automatically:
   - Copies estimate structure (epics, stages, activities)
   - Sets budget from estimate totals
   - Generates project code
   - Links back to source estimate
4. You add:
   - Project manager
   - Start and end dates
   - Commercial scheme
   - SOW document

**Benefit:** Maintains traceability from estimate to delivery.

##### Option 2: Manual Project Creation

![Create Project Manually](screenshots/10-project-create.png)  
*Figure 37: Manual project creation form*

1. Navigate to **Projects** → **Create Project**
2. Enter project details:
   - **Client:** Select from dropdown
   - **Project Name:** Descriptive name
   - **Project Code:** Unique identifier (auto-generated or custom)
   - **Description:** Vision statement/overview
   - **Start Date** and **End Date**
   - **Project Manager:** Assign from users
   - **Commercial Scheme:**
     - **Retainer:** Monthly ongoing fee
     - **Milestone:** Payment tied to deliverables
     - **Time & Materials (T&M):** Bill for actual hours
   - **Status:** Active, On-Hold, or Completed

**Project Structure:**

![Project Structure](screenshots/10-project-structure.png)  
*Figure 38: Project epic/stage/activity hierarchy*

Build project structure manually or copy from estimate:
- **Epics:** Major project phases or deliverables
- **Stages:** Sub-phases within epics
- **Activities:** Specific tasks within stages
- **Workstreams:** Parallel work tracks

---

**Statement of Work (SOW):**

![Upload SOW](screenshots/10-project-sow.png)  
*Figure 39: SOW upload and management*

1. In project detail, click **"Upload SOW"**
2. Select PDF file
3. Enter **SOW Date:** When signed
4. Enter **SOW Value:** Contract amount
5. Document automatically stored in SharePoint under `/sows/`
6. Link appears in project details

**Change Orders:**

![Change Orders](screenshots/10-project-change-orders.png)  
*Figure 40: Managing project change orders*

Track contract modifications:
1. Click **"Upload Change Order"**
2. Upload PDF document
3. Describe changes to scope/budget
4. Document stored in SharePoint under `/changeorders/`
5. Update project budget accordingly

---

#### Resource Management

![Resource Management Overview](screenshots/11-resource-management.png)  
*Figure 41: Resource management with capacity indicators*

**Two View Modes:**

##### List View

![Resource List View](screenshots/11-resource-list.png)  
*Figure 42: List view of resource allocations*

**Features:**
- Tabular display of all allocations
- Sortable by person, project, date, utilization
- Filterable by:
  - Team member
  - Project
  - Date range
  - Utilization level
- Export to Excel
- Capacity summary panel

**Adding an Allocation:**

![Add Resource Allocation](screenshots/11-resource-add.png)  
*Figure 43: Adding a new resource allocation*

1. Click **"Add Allocation"**
2. Select:
   - **Person:** Team member to assign
   - **Project:** Which project
   - **Start Date** and **End Date**
   - **Allocated Hours:** Weekly hours OR
   - **Percentage:** % of capacity
3. System shows:
   - Current capacity used
   - Conflicts (over-allocation warnings)
   - Available hours
4. Click **"Save Allocation"**

**Capacity Summary:**

![Capacity Summary](screenshots/11-capacity-summary.png)  
*Figure 44: Capacity summary with utilization breakdown*

View for each person:
- **Total Capacity:** Standard hours (default 40/week)
- **Allocated Hours:** Sum of all assignments
- **Available Hours:** Remaining capacity
- **Utilization %:** Allocated / Total
- **Status:** 
  - 🟢 Green: Under 100% (available)
  - 🟡 Yellow: At 100% (fully booked)
  - 🔴 Red: Over 100% (conflict!)

---

##### Timeline View

![Resource Timeline](screenshots/11-resource-timeline.png)  
*Figure 45: Timeline/Gantt view of resource allocations*

**Visual Features:**
- Calendar-based Gantt chart
- Color-coded by utilization level:
  - 🟢 Green bars: Under capacity
  - 🟡 Yellow bars: At capacity
  - 🔴 Red bars: Over-allocated
- Drag-and-drop to adjust dates
- Hover for allocation details
- Zoom in/out for different time scales

**Conflict Detection:**

![Resource Conflicts](screenshots/11-resource-conflicts.png)  
*Figure 46: Conflict warning for over-allocation*

System automatically warns when:
- Person allocated over 100% capacity
- Overlapping assignments exceed hours available
- New allocation creates conflict

**Resolving Conflicts:**
- Adjust allocation percentages
- Shift dates
- Reassign to different resource
- Increase capacity (PTO exceptions, overtime approval)

---

**Filters and Search:**

![Resource Filters](screenshots/11-resource-filters.png)  
*Figure 47: Filtering options for resource view*

Filter allocations by:
- **Date Range:** Specific weeks/months
- **Team Member:** Individual or team
- **Project:** Single or multiple projects
- **Utilization:** Over/under allocated
- **Status:** Active, upcoming, past

---

#### Managing Milestones

![Project Milestones](screenshots/12-milestones.png)  
*Figure 48: Project milestones list*

SCDP supports two types of milestones:

##### Delivery Milestones

![Delivery Milestone](screenshots/12-milestone-delivery.png)  
*Figure 49: Delivery milestone configuration*

Track project deliverables and gates:
- **Not Started:** Planning phase
- **In Progress:** Work underway
- **Completed:** Deliverable achieved
- **Cancelled:** No longer required

**Fields:**
- Name and description
- Target date
- Actual completion date
- Budget hours
- Linked epic/stage

##### Payment Milestones

![Payment Milestone](screenshots/12-milestone-payment.png)  
*Figure 50: Payment milestone for invoicing*

Control when invoices are generated:
- **Planned:** Not yet invoiced
- **Invoiced:** Invoice created
- **Paid:** Payment received

**Fields:**
- Name and description
- Amount (dollar value)
- Target/due date
- Link to invoice (once created)
- SOW reference

**Creating Milestones:**
1. In project detail, navigate to **Milestones** tab
2. Click **"Add Milestone"**
3. Choose type: Delivery or Payment
4. Fill in details
5. Set target date
6. Link to project structure if applicable
7. Click **"Save"**

---

### 3.3 For Billing Administrators

#### Creating Invoices

![Billing Dashboard](screenshots/13-billing-dashboard.png)  
*Figure 51: Billing dashboard with unbilled items*

**Two Invoicing Methods:**

##### Time & Materials Invoicing

![Create T&M Invoice](screenshots/13-invoice-tm.png)  
*Figure 52: Creating a time & materials invoice*

1. Navigate to **Billing** → **Create Batch**
2. Select:
   - **Client:** Who to invoice
   - **Project:** Which project
   - **Billing Period:** Date range
3. System displays:
   - **Unbilled Time Entries** for period
   - **Approved Expenses** not yet invoiced
4. Review items:
   - Check/uncheck items to include
   - Verify hours and rates
   - Review expense details and receipts
5. Add adjustments:
   - Discounts
   - Write-offs
   - Additional charges
6. Click **"Generate Invoice"**

**Invoice Preview:**

![Invoice Preview](screenshots/13-invoice-preview.png)  
*Figure 53: Invoice preview before generation*

Preview shows:
- Invoice number (auto-generated)
- Client and project information
- Itemized time entries
- Expense line items with receipt thumbnails
- Subtotals and total amount
- Payment terms

**Auto-Generated PDF:**

![Invoice PDF](screenshots/13-invoice-pdf.png)  
*Figure 54: Auto-generated invoice PDF*

System automatically creates PDF with:
- Company branding
- Detailed time breakdown
- Expense details
- Attached receipt images
- Payment information
- Professional formatting

---

##### Milestone Invoicing

![Milestone Invoice](screenshots/13-invoice-milestone.png)  
*Figure 55: Creating a milestone-based invoice*

For milestone-based payment:

1. Navigate to **Billing** → **Milestone Invoicing**
2. View payment milestones with status "Planned"
3. Select milestone to invoice
4. Click **"Create Invoice"**
5. System automatically:
   - Creates invoice with "INV" prefix
   - Uses milestone amount
   - Links invoice to milestone
   - Updates milestone status to "Invoiced"
6. Upload or use auto-generated PDF
7. Send to client

**Benefits:**
- No time entry required
- Fixed amount from contract
- Tied to deliverables
- Clear payment schedule

---

#### Managing Invoice Batches

![Billing History](screenshots/13-billing-history.png)  
*Figure 56: Billing history with batch tracking*

**Batch Details:**

![Batch Detail View](screenshots/13-batch-detail.png)  
*Figure 57: Detailed view of an invoice batch*

For each batch, view:
- All included time entries
- All included expenses
- Batch total
- Invoice PDF
- Creation date and creator
- Payment status
- Client and project

**Invoice Management:**

![Invoice Actions](screenshots/13-invoice-actions.png)  
*Figure 58: Invoice action menu*

Available actions:
- **View PDF:** Open in browser
- **Download PDF:** Save locally
- **Replace PDF:** Upload new version
- **Update Payment Status:** Mark as paid
- **Export:** Download batch data
- **Email:** Send to client (if configured)

---

#### Approving Expense Reports

![Expense Approval Queue](screenshots/14-expense-approval.png)  
*Figure 59: Expense approval queue*

**Approval Workflow:**

1. Navigate to **Expense Approval**
2. View all submitted reports awaiting approval
3. Click on a report to review

**Review Screen:**

![Expense Review](screenshots/14-expense-review.png)  
*Figure 60: Reviewing an expense report*

For each report, review:
- Employee name and submission date
- Report description
- Individual expense items:
  - Date, amount, category
  - Description
  - Project association
  - Receipt image (click to enlarge)

![Receipt Viewer](screenshots/14-receipt-viewer.png)  
*Figure 61: Full-screen receipt viewer*

**Taking Action:**

![Approve/Reject Expense](screenshots/14-expense-actions.png)  
*Figure 62: Expense approval actions*

**To Approve:**
1. Click **"Approve"** button
2. Confirm approval
3. Report moves to "Approved" status
4. Employee receives email notification
5. Report queued for next reimbursement batch

**To Reject:**
1. Click **"Reject"** button
2. **Required:** Enter rejection reason/comments
3. Report returns to employee with "Rejected" status
4. Employee receives email with your comments
5. Employee can revise and resubmit

**Email Notifications:**

![Expense Approval Email](screenshots/14-approval-email.png)  
*Figure 63: Automated approval email to employee*

Employees automatically receive:
- Approval confirmation
- Rejection notice with comments
- Professional HTML-formatted emails
- Direct link to their expense report

**Best Practices:**
- ✅ Review receipts carefully for legitimacy
- ✅ Verify amounts match receipts
- ✅ Check expense categories are appropriate
- ✅ Provide clear comments when rejecting
- ✅ Process reports promptly (within 3 business days)
- ❌ Don't approve without receipt verification
- ❌ Don't reject without explanation

---

#### Processing Reimbursements

![Reimbursement Batches](screenshots/15-reimbursement-batches.png)  
*Figure 64: Reimbursement batch management*

**Creating a Reimbursement Batch:**

![Create Reimbursement Batch](screenshots/15-batch-create.png)  
*Figure 65: Creating a new reimbursement batch*

1. Navigate to **Reimbursement Batches**
2. Click **"Create New Batch"**
3. System shows all approved, unreimbursed expenses
4. Review by employee:

![Batch Preview](screenshots/15-batch-preview.png)  
*Figure 66: Reimbursement batch preview grouped by employee*

- Grouped by employee name
- Total per employee
- Individual expense details
- Receipt references
- Project associations

5. Verify totals are correct
6. Click **"Generate Batch"**
7. Batch is created and marked "Pending"

**Batch Export:**

![Export for Payroll](screenshots/15-batch-export.png)  
*Figure 67: Exporting batch for payroll system*

Export batch data for your payroll/accounting system:
- **CSV:** Import to most systems
- **Excel:** Full detail with formatting
- **PDF:** Summary report
- **Custom Format:** Configure in settings

**Processing Payment:**

After processing through payroll:
1. Open batch detail
2. Click **"Mark as Processed"**
3. Enter processing date
4. System updates:
   - Batch status to "Processed"
   - All expense reports to "Reimbursed"
   - Employees notified via email

![Reimbursement Email](screenshots/15-reimbursement-email.png)  
*Figure 68: Reimbursement notification email*

**Reimbursement Schedule:**

Best practices for regular processing:
- **Weekly:** High-volume organizations
- **Bi-weekly:** Most common, aligns with payroll
- **Monthly:** Lower volume, simple process

**Tracking:**

![Batch History](screenshots/15-batch-history.png)  
*Figure 69: Historical reimbursement batches*

View historical batches:
- Date processed
- Number of employees
- Total amount reimbursed
- Batch status
- Created by
- Export records

---

### 3.4 For Executives

#### Cross-Project Resource Dashboard

![Cross-Project Dashboard](screenshots/16-cross-project.png)  
*Figure 70: Organization-wide resource dashboard*

View entire organization's resource allocation:

**Key Metrics:**
- **Total Headcount:** Active team members
- **Total Capacity:** Available hours
- **Total Allocated:** Hours assigned to projects
- **Overall Utilization:** Organization-wide percentage
- **Available Capacity:** Unallocated hours

**Team View:**

![Team Utilization](screenshots/16-team-utilization.png)  
*Figure 71: Team utilization breakdown*

See every team member:
- Current project assignments
- Utilization percentage
- Over/under allocation status
- Time range filters
- Department/team grouping

**Project View:**

![Project Resource View](screenshots/16-project-resources.png)  
*Figure 72: Resource allocation by project*

View by project:
- All projects and their teams
- Resource counts per project
- Budget vs actual hours
- Project health indicators
- Critical resource needs

**Filtering:**

![Executive Filters](screenshots/16-filters.png)  
*Figure 73: Advanced filtering options*

Filter by:
- Date range (quarter, year, custom)
- Department or team
- Project status
- Utilization level (over/under)
- Client
- Project manager

**Export Capabilities:**

![Executive Reports](screenshots/16-export.png)  
*Figure 74: Export options for executive reporting*

Export data for leadership meetings:
- PowerPoint-ready charts
- Excel detailed data
- PDF executive summary
- Custom date ranges

---

#### Reports & Analytics

![Reports Dashboard](screenshots/17-reports.png)  
*Figure 75: Reports and analytics dashboard*

**Available Reports:**

##### Project Profitability

![Project Profitability Report](screenshots/17-report-profitability.png)  
*Figure 76: Project profitability analysis*

View for each project:
- Estimated total (from contract)
- Actual costs (time + expenses)
- Billed total (invoices)
- Profit margin ($ and %)
- Variance from estimate
- Trend over time

##### Resource Utilization

![Utilization Report](screenshots/17-report-utilization.png)  
*Figure 77: Resource utilization trends*

Track team utilization:
- By person
- By department
- Over time (weekly, monthly, quarterly)
- Billable vs non-billable
- Bench time (unallocated)
- Target utilization comparison

##### Time Tracking Summary

![Time Report](screenshots/17-report-time.png)  
*Figure 78: Time tracking summary report*

Analyze time entries:
- Hours by project
- Hours by person
- Hours by client
- Billable vs non-billable breakdown
- Trends and patterns
- Missing time entries

##### Expense Trends

![Expense Trends](screenshots/17-report-expenses.png)  
*Figure 79: Expense analysis and trends*

Review organizational expenses:
- Total by category
- Top spenders
- Project expense breakdown
- Reimbursement velocity
- Approval rates
- Trend analysis

##### Invoice Aging

![Invoice Aging](screenshots/17-report-aging.png)  
*Figure 80: Invoice aging report*

Track outstanding invoices:
- 0-30 days
- 31-60 days
- 61-90 days
- 90+ days (collections risk)
- By client
- Total AR (accounts receivable)

**Custom Reports:**

![Custom Report Builder](screenshots/17-report-custom.png)  
*Figure 81: Custom report configuration*

Build custom reports:
- Select metrics
- Choose dimensions
- Set filters
- Configure grouping
- Schedule delivery
- Save templates

---

### 3.5 For Administrators

#### Managing Users

![User Management](screenshots/18-users-list.png)  
*Figure 82: User management interface*

**Adding a New User:**

![Create User](screenshots/18-user-create.png)  
*Figure 83: Creating a new user account*

1. Navigate to **Users** → **Add User**
2. Enter user information:
   - **Email:** For SSO authentication (optional for contractors)
   - **First Name** and **Last Name**
   - **Full Name:** Display name
   - **Initials:** For shortcuts (e.g., JD for John Doe)
   - **Title:** Job title
   - **Role:** Select from:
     - Employee
     - Project Manager
     - Billing Administrator
     - Executive
     - Administrator
   - **Can Login:** Toggle on/off
   - **Is Assignable:** Can be assigned to projects
   - **Default Billing Rate:** Hourly rate for estimates
   - **Default Cost Rate:** Internal cost rate
   - **Is Active:** Active/inactive status
3. Click **"Create User"**

**User Permissions Explained:**

![User Permissions](screenshots/18-user-permissions.png)  
*Figure 84: User permission toggles*

**Can Login:**
- ✅ ON: User can authenticate and access SCDP
- ❌ OFF: User exists for tracking but cannot log in
- Use case: Contractors without email, historical tracking

**Is Assignable:**
- ✅ ON: Appears in resource allocation dropdowns
- ❌ OFF: Hidden from project assignments
- Use case: Inactive employees, non-delivery staff

**Editing Users:**

![Edit User](screenshots/18-user-edit.png)  
*Figure 85: Editing user details*

Click any user to edit:
- Update contact information
- Change role (permissions update immediately)
- Adjust rates
- Enable/disable login
- Deactivate (preserves historical data)

**⚠️ Important:** Never delete users who have time entries, expenses, or project associations. Instead, deactivate them by setting "Is Active" to false.

**User Audit:**

![User Audit Log](screenshots/18-user-audit.png)  
*Figure 86: User activity audit log*

Track for each user:
- Last login date
- Time entries count
- Projects assigned
- Expense reports submitted
- Role change history

---

#### Rate Management

![Rate Management](screenshots/19-rates.png)  
*Figure 87: Rate management dashboard*

**Rate Hierarchy:**

SCDP uses a three-tier rate system:

```
1. System Default (lowest priority)
   └─ 2. Client Override
      └─ 3. Project Override (highest priority)
```

##### Role-Based Rates

![Role Rates](screenshots/19-rates-roles.png)  
*Figure 88: Managing role-based rates*

**Creating a Role:**
1. Navigate to **Rates** → **Roles**
2. Click **"Add Role"**
3. Enter:
   - **Role Name:** (e.g., "Senior Consultant")
   - **Default Rack Rate:** Standard hourly rate
4. Click **"Save"**

**Common Roles:**
- Partner
- Director
- Senior Consultant
- Consultant
- Analyst
- Project Manager
- Designer
- Developer

##### Client-Specific Overrides

![Client Rate Override](screenshots/19-rates-client.png)  
*Figure 89: Setting client-specific rate overrides*

Override rates for specific clients:
1. Open client detail page
2. Navigate to **"Rate Overrides"** section
3. Click **"Add Override"**
4. Select role
5. Enter client-specific rate
6. All new projects for this client use override rate

**Use case:** Special pricing agreements, volume discounts, contract terms

##### Project-Specific Overrides

![Project Rate Override](screenshots/19-rates-project.png)  
*Figure 90: Setting project-specific rate overrides*

Override rates for individual projects:
1. Open project detail page
2. Navigate to **"Rate Overrides"** section
3. Click **"Add Override"**
4. Select role or person
5. Enter project-specific rate
6. Only this project uses the override

**Use case:** Custom contract rates, temporary adjustments, special circumstances

**Rate Snapshot:**

![Rate Snapshot](screenshots/19-rates-snapshot.png)  
*Figure 91: Rate snapshot in estimate*

**Important:** When an estimate is created:
- Current rates are "snapshotted" and saved
- Future rate changes don't affect existing estimates
- Ensures estimate accuracy over time
- Can view historical rates from snapshot

---

#### System Settings

![System Settings](screenshots/20-system-settings.png)  
*Figure 92: System settings configuration*

**Vocabulary Management:**

![Vocabulary Settings](screenshots/20-vocabulary.png)  
*Figure 93: Vocabulary catalog and customization*

Customize project terminology:

**Vocabulary Types:**
- **Epic** (default alternatives: Program, Release, Initiative, Theme)
- **Stage** (default alternatives: Phase, Sprint, Iteration, Cycle)
- **Workstream** (default alternatives: Track, Stream, Discipline)
- **Milestone** (default alternatives: Gate, Checkpoint, Deliverable)
- **Activity** (default alternatives: Task, Work Item, Ticket)

**Managing Vocabulary:**

![Add Vocabulary Term](screenshots/20-vocabulary-add.png)  
*Figure 94: Adding a custom vocabulary term*

1. Navigate to **Vocabulary** section
2. Select term type (Epic, Stage, etc.)
3. Click **"Add Term"**
4. Enter:
   - **Term Value:** The actual word (e.g., "Sprint")
   - **Description:** When to use this term
   - **Sort Order:** Display order in dropdowns
5. Click **"Save"**

**Organization Defaults:**

![Organization Vocabulary](screenshots/20-vocabulary-org.png)  
*Figure 95: Setting organization-wide vocabulary defaults*

Set system-wide defaults:
- Select preferred term for each type
- These become defaults for new projects
- Can be overridden at client or project level

**Vocabulary Cascade:**

```
Organization Default
   ↓ (can override)
Client Setting
   ↓ (can override)
Project Setting
   ↓ (display only)
Estimate Labels
```

**General Settings:**

![General Settings](screenshots/20-settings-general.png)  
*Figure 96: General system configuration*

Configure:
- **Default Capacity:** Standard hours/week (default: 40)
- **Estimate Multipliers:** Size, complexity, confidence defaults
- **Currency Settings:** Default currency, formatting
- **Date Formats:** Regional preferences
- **Email Templates:** Customize notification text
- **Invoice Numbering:** Prefix, format, starting number

**Save Settings:**
- Changes apply immediately
- No restart required
- Affects new records only (doesn't change existing data)

---

#### SharePoint Configuration

![SharePoint Settings](screenshots/21-sharepoint.png)  
*Figure 97: SharePoint integration configuration*

**Environment-Specific Configuration:**

SCDP separates development and production document storage:

![SharePoint Dev Config](screenshots/21-sharepoint-dev.png)  
*Figure 98: Development environment SharePoint settings*

**Development Settings:**
1. Navigate to **Admin** → **SharePoint**
2. Under **Development Configuration:**
   - **Site URL:** SharePoint site URL
     - Example: `https://synozur.sharepoint.com/sites/RevOps/`
     - Supports: Root sites, /sites/ paths, multi-level paths
   - **Library Name:** Document library name
     - Example: `SCDP-Dev`
3. Click **"Save Development Settings"**

![SharePoint Prod Config](screenshots/21-sharepoint-prod.png)  
*Figure 99: Production environment SharePoint settings*

**Production Settings:**
1. Under **Production Configuration:**
   - **Site URL:** Production SharePoint site
     - Example: `https://synozur.sharepoint.com/sites/RevOps/`
   - **Library Name:** Production document library
     - Example: `SCDP-Prod`
2. Click **"Save Production Settings"**

**Default Configuration:**
```
Development:
  Site: https://synozur.sharepoint.com/sites/RevOps/
  Library: SCDP-Dev

Production:
  Site: https://synozur.sharepoint.com/sites/RevOps/
  Library: SCDP-Prod
```

**Document Organization:**

![SharePoint Structure](screenshots/21-sharepoint-structure.png)  
*Figure 100: Automatic folder organization in SharePoint*

SCDP automatically creates and manages folders:

```
SharePoint Library Root
├── receipts/          ← Expense receipts
├── invoices/          ← Invoice PDFs
├── sows/              ← Statements of Work
└── changeorders/      ← Contract change orders
```

**Authentication:**

![SharePoint Auth](screenshots/21-sharepoint-auth.png)  
*Figure 101: SharePoint authentication status*

- Uses Replit SharePoint Connector
- OAuth-based Microsoft Graph API
- Automatic token refresh
- No manual certificate management required

**Testing Connection:**

![Test SharePoint](screenshots/21-sharepoint-test.png)  
*Figure 102: Testing SharePoint connection*

1. Click **"Test Connection"** button
2. System verifies:
   - Site is accessible
   - Library exists
   - Permissions are correct
   - Folders can be created
3. View test results:
   - ✅ Success: All systems ready
   - ❌ Error: Shows specific issue

**Troubleshooting:**

Common issues and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| Site not found | Invalid URL | Verify SharePoint site URL is correct |
| Library not found | Wrong library name | Check library name spelling |
| Permission denied | Insufficient access | Contact SharePoint admin for permissions |
| Auth failed | Token expired | Refresh browser, re-authenticate |

**Permissions Required:**

SharePoint site must grant SCDP:
- **Read:** View existing files
- **Write:** Upload new files
- **Delete:** Remove files when needed
- **Create Folders:** Auto-create organization structure

---

## 4. Common Workflows

### 4.1 End-to-End Project Workflow

![Project Workflow Diagram](screenshots/22-workflow-project.png)  
*Figure 103: Complete project lifecycle workflow*

#### Phase 1: Client Onboarding (PM)

![Client Onboarding](screenshots/22-workflow-client.png)  
*Figure 104: Client onboarding checklist*

**Steps:**
1. ✅ Create client record
2. ✅ Enter contact information
3. ✅ Upload MSA (if available)
4. ✅ Upload NDA (if available)
5. ✅ Set billing contact
6. ✅ Configure client-specific rates (if applicable)
7. ✅ Set vocabulary preferences (if client requires specific terms)

**Timeline:** Day 1 of engagement

---

#### Phase 2: Estimation (PM)

![Estimation Workflow](screenshots/22-workflow-estimate.png)  
*Figure 105: Estimate creation workflow*

**Steps:**
1. ✅ Create new estimate for client
2. ✅ Choose estimate type (detailed vs block)
3. ✅ Build estimate structure:
   - Add epics
   - Add stages within epics
   - Add activities within stages
4. ✅ Add line items with:
   - Descriptions
   - Hours and factors
   - Rates
   - Assignments (optional)
5. ✅ Add payment milestones (if milestone-based billing)
6. ✅ Review totals and margins
7. ✅ Mark as "Final" (locks line items)
8. ✅ Export to PDF/Excel for client
9. ✅ Mark as "Sent"
10. ✅ Upon client acceptance, mark as "Approved"

**Timeline:** 1-2 weeks for complex estimates

---

#### Phase 3: Project Creation (PM)

![Project Creation](screenshots/22-workflow-project-create.png)  
*Figure 106: Creating project from estimate*

**Steps:**
1. ✅ Open approved estimate
2. ✅ Click "Create Project"
3. ✅ System auto-populates:
   - Project structure from estimate
   - Budget from estimate totals
   - Payment milestones
4. ✅ Set project details:
   - Project manager
   - Start and end dates
   - Commercial scheme (retainer/milestone/T&M)
5. ✅ Upload signed SOW
6. ✅ Configure project-specific settings
7. ✅ Create project

**Timeline:** Same day as contract signature

---

#### Phase 4: Resource Allocation (PM)

![Resource Allocation](screenshots/22-workflow-resource.png)  
*Figure 107: Allocating team to project*

**Steps:**
1. ✅ Open Resource Management
2. ✅ For each team member:
   - Add allocation to project
   - Set start/end dates
   - Set hours or percentage
3. ✅ Review capacity summary
4. ✅ Resolve any conflicts (over-allocation)
5. ✅ Communicate assignments to team
6. ✅ Team members see assignments in "My Assignments"

**Timeline:** Within 1 week of project start

---

#### Phase 5: Execution (Team)

![Project Execution](screenshots/22-workflow-execution.png)  
*Figure 108: Day-to-day project work*

**Daily:**
- ✅ Team members log time
- ✅ Team links time to project structure
- ✅ PM monitors progress

**Weekly:**
- ✅ Team submits expense reports
- ✅ PM reviews budget vs actual
- ✅ PM adjusts allocations if needed

**Monthly:**
- ✅ PM reviews overall progress
- ✅ PM updates project status
- ✅ Billing admin creates invoices

**Timeline:** Project duration (weeks to months)

---

#### Phase 6: Billing (Billing Admin)

![Billing Workflow](screenshots/22-workflow-billing.png)  
*Figure 109: Invoice creation and management*

**For Time & Materials:**
1. ✅ Navigate to Billing
2. ✅ Select client and project
3. ✅ Choose billing period
4. ✅ Review unbilled time and expenses
5. ✅ Generate invoice batch
6. ✅ Review/download PDF
7. ✅ Send to client
8. ✅ Track payment status

**For Milestone-Based:**
1. ✅ Verify milestone deliverable completed
2. ✅ Navigate to Milestone Invoicing
3. ✅ Select milestone with "Planned" status
4. ✅ Create invoice (auto-uses milestone amount)
5. ✅ Review PDF
6. ✅ Send to client
7. ✅ Milestone auto-updates to "Invoiced"
8. ✅ When paid, mark as "Paid"

**Timeline:** Weekly, bi-weekly, or monthly per contract terms

---

#### Phase 7: Reimbursement (Billing Admin)

![Reimbursement Workflow](screenshots/22-workflow-reimbursement.png)  
*Figure 110: Employee reimbursement process*

**Steps:**
1. ✅ Managers approve submitted expense reports
2. ✅ Billing admin creates reimbursement batch
3. ✅ System groups by employee
4. ✅ Review totals
5. ✅ Generate batch
6. ✅ Export for payroll
7. ✅ Process payments
8. ✅ Mark batch as "Processed"
9. ✅ Employees receive email confirmation

**Timeline:** Bi-weekly or monthly

---

### 4.2 Expense Approval Workflow

![Expense Workflow Complete](screenshots/23-workflow-expense.png)  
*Figure 111: Complete expense report lifecycle*

#### Employee Perspective

![Employee Expense Flow](screenshots/23-expense-employee.png)  
*Figure 112: Employee expense submission flow*

**Steps:**
1. 📸 Incur business expense
2. 📸 Capture receipt (photo or scan)
3. 💻 Log into SCDP
4. 💻 Create expense report
5. 💻 Add expense item with details
6. 📤 Upload receipt image
7. 📤 Submit report for approval
8. 📧 Receive email confirmation of submission
9. ⏳ Wait for manager review
10. 📧 Receive approval/rejection email
11. ✅ If approved: Wait for reimbursement
12. ❌ If rejected: Read comments, revise, resubmit

**Timeline:** Submit within 30 days of expense

---

#### Approver Perspective

![Approver Expense Flow](screenshots/23-expense-approver.png)  
*Figure 113: Manager approval process*

**Steps:**
1. 📧 Receive email: "New expense report submitted"
2. 💻 Log into SCDP
3. 💻 Navigate to Expense Approval
4. 🔍 Review report details:
   - Verify receipt images
   - Check amounts
   - Validate categories
   - Confirm business purpose
5. ✅ **If valid:** Click "Approve"
   - Report moves to approved status
   - Employee notified
   - Queued for reimbursement
6. ❌ **If invalid:** Click "Reject"
   - Enter clear comments explaining why
   - Report returns to employee
   - Employee can revise

**Timeline:** Review within 3 business days

---

#### Finance Perspective

![Finance Reimbursement Flow](screenshots/23-expense-finance.png)  
*Figure 114: Finance reimbursement processing*

**Steps:**
1. 📅 On schedule (weekly/bi-weekly/monthly)
2. 💻 Log into SCDP
3. 💻 Navigate to Reimbursement Batches
4. 💻 Click "Create New Batch"
5. 🔍 Review all approved, unreimbursed expenses
6. 📊 Verify totals by employee
7. 📤 Generate batch
8. 📥 Export for payroll system
9. 💰 Process payments through payroll
10. ✅ Mark batch as "Processed"
11. 📧 Employees auto-notified

**Timeline:** Regular schedule (e.g., every other Friday)

---

### 4.3 Milestone Invoicing Workflow

![Milestone Invoice Workflow](screenshots/24-workflow-milestone.png)  
*Figure 115: Milestone-based invoicing process*

#### Setup Phase (PM)

**Creating Payment Milestones:**

![Milestone Setup](screenshots/24-milestone-setup.png)  
*Figure 116: Setting up payment milestones*

**During Project Creation:**
1. ✅ Copy milestones from estimate OR
2. ✅ Create new payment milestones:
   - Name (e.g., "Phase 1 Complete - Requirements")
   - Amount or percentage of total
   - Target/due date
   - Link to deliverable/epic
   - SOW reference

**Example Milestones:**
```
Project: CRM Implementation - $500,000
├─ Kickoff Payment (20%) - $100,000 - Due: Week 1
├─ Phase 1: Requirements (15%) - $75,000 - Due: Week 6
├─ Phase 2: Design (15%) - $75,000 - Due: Week 12
├─ Phase 3: Development (30%) - $150,000 - Due: Week 24
└─ Go-Live Payment (20%) - $100,000 - Due: Week 32
```

---

#### Invoicing Phase (Billing Admin)

**Creating Milestone Invoice:**

![Create Milestone Invoice](screenshots/24-milestone-invoice.png)  
*Figure 117: Generating invoice from milestone*

**When Milestone Reached:**
1. ✅ PM confirms deliverable complete
2. ✅ Billing admin logs into SCDP
3. ✅ Navigates to Billing → Milestone Invoicing
4. ✅ Views list of "Planned" milestones
5. ✅ Selects milestone to invoice
6. ✅ Clicks "Create Invoice"
7. ✅ System automatically:
   - Generates invoice with "INV" prefix
   - Uses milestone amount (no time required)
   - Links invoice to milestone
   - Updates status to "Invoiced"
8. ✅ Reviews/downloads PDF
9. ✅ Sends to client

**Timeline:** Same day milestone is achieved

---

#### Payment Tracking

**Updating Payment Status:**

![Milestone Payment Tracking](screenshots/24-milestone-payment.png)  
*Figure 118: Tracking milestone payment status*

**When Payment Received:**
1. ✅ Finance confirms payment cleared
2. ✅ Billing admin opens milestone
3. ✅ Updates status to "Paid"
4. ✅ Enters payment date
5. ✅ Project financial reports update automatically

**Payment Status Flow:**
```
Planned → Invoiced → Paid
```

**Dashboard View:**

![Milestone Dashboard](screenshots/24-milestone-dashboard.png)  
*Figure 119: Dashboard view of all payment milestones*

Track across all projects:
- Upcoming milestones
- Outstanding invoices
- Payment aging
- Revenue recognition

---

## 5. Feature-by-Feature Guide

### 5.1 Estimates

![Estimate Features](screenshots/25-estimates-overview.png)  
*Figure 120: Estimate management overview*

#### Estimate Types

##### Detailed Estimate

![Detailed Estimate](screenshots/25-estimate-detailed-full.png)  
*Figure 121: Detailed estimate with full line item breakdown*

**Best for:**
- Complex projects
- Time & materials contracts
- Resource-specific planning
- Detailed client proposals

**Components:**
- Line-by-line task breakdown
- Hour calculations with factors
- Resource assignments (optional)
- Rate-based pricing
- Epic/Stage/Activity hierarchy
- Size/Complexity/Confidence multipliers

**Calculations:**
```
Adjusted Hours = Base Hours × Factor × Size × Complexity × Confidence
Total Amount = Adjusted Hours × Rate
Margin = Total Amount - (Adjusted Hours × Cost Rate)
```

---

##### Block Estimate

![Block Estimate](screenshots/25-estimate-block-full.png)  
*Figure 122: Block estimate for fixed-price work*

**Best for:**
- Retainer agreements
- Fixed-price projects
- Quick quotes
- Simple scope definitions

**Components:**
- Total hours OR total dollars
- High-level scope description
- Optional fixed price override
- Payment schedule

**Use Cases:**
- Monthly retainer: $10,000/month
- Fixed project: $50,000 for defined scope
- Block of hours: 100 hours at $150/hr

---

#### Key Features

##### Inline Editing

![Inline Editing](screenshots/25-estimate-inline.png)  
*Figure 123: Inline editing of estimate values*

- Click any cell to edit
- Changes auto-save
- Calculations update in real-time
- Works on desktop and tablet

##### Excel Import/Export

![Excel Import](screenshots/25-estimate-excel-import.png)  
*Figure 124: Importing estimate from Excel*

**Import:**
1. Download template
2. Fill in Excel
3. Upload file
4. System validates and creates line items

**Export:**
1. Click "Export to Excel"
2. Full data export with formulas
3. Manipulate in Excel
4. Re-import if needed

##### AI Text Export

![AI Text Export](screenshots/25-estimate-ai-export.png)  
*Figure 125: AI-generated proposal text*

Generate proposal narrative:
1. Click "AI Text Export"
2. System analyzes estimate structure
3. Generates professional text describing:
   - Scope of work
   - Deliverables
   - Timeline
   - Pricing
4. Copy/paste into proposal document

##### Version Control

![Estimate Versions](screenshots/25-estimate-versions.png)  
*Figure 126: Estimate version history*

Track changes over time:
- Version number increments
- Change history logged
- Can compare versions
- Previous versions read-only

##### Status Locking

![Status Lock](screenshots/25-estimate-lock.png)  
*Figure 127: Locked estimate preventing edits*

**Protection:**
- "Draft" = Fully editable
- "Final" = Line items locked
- "Sent" = No changes allowed
- "Approved" = Can create project

**Why:** Prevents accidental changes to client-facing estimates

##### Rate Snapshots

![Rate Snapshot](screenshots/25-estimate-snapshot.png)  
*Figure 128: Historical rate snapshot in estimate*

**Preserved:**
- All rates at time of creation
- Future rate changes don't affect estimate
- Can view historical rates
- Ensures pricing accuracy

---

### 5.2 Projects

![Projects Overview](screenshots/26-projects-overview.png)  
*Figure 129: Project portfolio management*

#### Commercial Schemes

##### Retainer

![Retainer Project](screenshots/26-project-retainer.png)  
*Figure 130: Retainer-based project tracking*

**Characteristics:**
- Monthly recurring fee
- Track retainer balance
- Monthly billing cycles
- Often block estimates

**Billing:**
- Invoice same amount monthly
- Track hours against retainer
- Alert when hours exceed balance
- Can "bank" unused hours

**Use Cases:**
- Ongoing support contracts
- Advisory services
- Fractional executive roles

---

##### Milestone

![Milestone Project](screenshots/26-project-milestone.png)  
*Figure 131: Milestone-based project*

**Characteristics:**
- Payment tied to deliverables
- Invoice when milestones achieved
- Track completion status

**Billing:**
- No time entries required
- Based on deliverable completion
- Fixed amounts from contract
- Clear payment schedule

**Use Cases:**
- Implementation projects
- Phased delivery contracts
- Fixed-price engagements

---

##### Time & Materials (T&M)

![T&M Project](screenshots/26-project-tm.png)  
*Figure 132: Time & materials project*

**Characteristics:**
- Bill for actual hours worked
- Include approved expenses
- Periodic invoicing

**Billing:**
- Based on time entries
- Plus reimbursable expenses
- Weekly, bi-weekly, or monthly
- Variable amounts each period

**Use Cases:**
- Open-ended engagements
- Staff augmentation
- Hourly consulting

---

#### Project Structure

![Project Structure Details](screenshots/26-project-structure-details.png)  
*Figure 133: Project structure hierarchy*

**Hierarchy:**

```
Project
├── Epic 1: Discovery
│   ├── Stage 1.1: Requirements
│   │   └── Activity 1.1.1: Stakeholder Interviews
│   └── Stage 1.2: Analysis
│       └── Activity 1.2.1: Current State Assessment
├── Epic 2: Design
│   └── Stage 2.1: Solution Design
│       ├── Activity 2.1.1: Architecture Design
│       └── Activity 2.1.2: UI/UX Design
└── Workstream A: Change Management
    └── (Parallel to epics)
```

**Epics:**
- Major project phases or deliverables
- High-level grouping
- Budget tracked at epic level

**Stages:**
- Sub-phases within epics
- Sequential or parallel
- Milestones often align to stages

**Activities:**
- Specific tasks within stages
- Granular work breakdown
- Link to time entries

**Workstreams:**
- Parallel work tracks
- Cross-cutting concerns
- Independent from epic hierarchy

---

#### Project Tracking

![Project Dashboard](screenshots/26-project-dashboard.png)  
*Figure 134: Project tracking dashboard*

**Financial Tracking:**

![Financial Tracking](screenshots/26-project-financial.png)  
*Figure 135: Project financial metrics*

Monitor:
- **Estimated Total:** From contract
- **SOW Total:** Signed contract value
- **Actual Cost:** Time + expenses incurred
- **Billed Total:** Invoices sent
- **Profit Margin:** Remaining profit
- **Budget Variance:** Over/under budget

**Hour Tracking:**

![Hour Tracking](screenshots/26-project-hours.png)  
*Figure 136: Budget vs actual hours*

View by:
- Epic
- Workstream
- Team member
- Time period

Metrics:
- Budgeted hours
- Actual hours logged
- Remaining hours
- % complete

**Burn Rate:**

![Burn Rate](screenshots/26-project-burn.png)  
*Figure 137: Project burn rate chart*

Visualize:
- Hours per week
- Spend per week
- Trend vs plan
- Projected completion date
- Early warning indicators

---

### 5.3 Time Tracking

![Time Tracking Details](screenshots/27-time-tracking-full.png)  
*Figure 138: Comprehensive time tracking interface*

#### Best Practices

##### Track Daily

![Daily Tracking](screenshots/27-time-daily.png)  
*Figure 139: Daily time tracking habit*

**Why:**
- ✅ Most accurate memory
- ✅ Fewer missed entries
- ✅ Better descriptions
- ✅ Easier to link to structure

**When:**
- End of each day (5-10 minutes)
- Or: Real-time as tasks complete
- Set daily reminder

##### Be Specific

![Specific Descriptions](screenshots/27-time-specific.png)  
*Figure 140: Examples of good vs poor time descriptions*

**Good Descriptions:**
```
✅ "Conducted stakeholder interviews with Finance team (4 participants)"
✅ "Developed user authentication module - implemented JWT tokens"
✅ "Client call: Status update and blocker resolution"
✅ "Code review for PR #123 - payment processing feature"
```

**Poor Descriptions:**
```
❌ "Work"
❌ "Meeting"
❌ "Development"
❌ "Project tasks"
```

**Why it matters:**
- Helps clients understand value
- Supports invoice backup
- Improves project estimation
- Aids audit defense

##### Use Project Structure

![Link to Structure](screenshots/27-time-structure.png)  
*Figure 141: Linking time entries to project structure*

Link entries to:
- Epic (major phase)
- Stage (sub-phase)
- Activity (specific task)
- Workstream (parallel track)

**Benefits:**
- Better reporting by deliverable
- Visibility into epic progress
- Identifies bottlenecks
- Supports change orders

##### Round Appropriately

![Time Rounding](screenshots/27-time-rounding.png)  
*Figure 142: Decimal time format guide*

**Use Decimals:**
```
15 minutes = 0.25 hours
30 minutes = 0.5 hours
45 minutes = 0.75 hours
1 hour 30 minutes = 1.5 hours
2 hours 15 minutes = 2.25 hours
```

**Conversion Table:**
| Minutes | Decimal | Minutes | Decimal |
|---------|---------|---------|---------|
| 6 | 0.1 | 36 | 0.6 |
| 12 | 0.2 | 42 | 0.7 |
| 18 | 0.3 | 48 | 0.8 |
| 24 | 0.4 | 54 | 0.9 |
| 30 | 0.5 | 60 | 1.0 |

##### Review Weekly

![Weekly Review](screenshots/27-time-weekly.png)  
*Figure 143: Weekly time entry review*

**Every Friday:**
1. ✅ Review all entries for week
2. ✅ Check for missing days
3. ✅ Verify hours seem reasonable
4. ✅ Ensure descriptions are clear
5. ✅ Add any forgotten entries

**Catch:**
- Missed days
- Under-reported hours
- Unclear descriptions
- Wrong project assignments

---

#### Mobile-Friendly

![Mobile Time Tracking](screenshots/27-time-mobile-full.png)  
*Figure 144: Full mobile time tracking experience*

**Features:**
- Optimized for phone and tablet
- Quick entry forms
- Recent projects easily accessible
- Touch-friendly interface
- Works offline (syncs when online)

**Mobile Workflow:**
1. Open SCDP on phone
2. Tap "Time Tracking"
3. Tap "+"
4. Select project from recent
5. Enter hours and description
6. Tap "Save"
7. Done in 30 seconds!

---

#### Editing Rules

![Time Entry Editing](screenshots/27-time-edit-rules.png)  
*Figure 145: Time entry edit permissions*

**Can Edit:**
- ✅ Unbilled entries
- ✅ Your own entries
- ✅ Entries from current/past weeks

**Cannot Edit:**
- ❌ Invoiced entries (already billed)
- ❌ Other people's entries (unless admin)
- ❌ Locked entries (from closed periods)

**Audit Trail:**
- All edits logged
- Original values preserved
- Who/when tracked
- Reason required for major changes

---

### 5.4 Resource Management

![Resource Management Full](screenshots/28-resource-full.png)  
*Figure 146: Complete resource management interface*

#### Capacity Planning

##### Standard Capacity

![Capacity Configuration](screenshots/28-capacity-config.png)  
*Figure 147: Configuring standard capacity*

**Default:** 40 hours/week

**Adjustable per person:**
- Part-time: 20 hours/week
- Full-time: 40 hours/week
- Contractor: Custom hours
- Executive: May be lower (meetings, non-billable)

**Set in user profile:**
1. Edit user
2. Set "Standard Capacity"
3. Applies to all allocations

##### Accounting For

![Capacity Adjustments](screenshots/28-capacity-adjustments.png)  
*Figure 148: Capacity adjustments for PTO and non-billable time*

**PTO/Holidays:**
- Create "PTO" allocation
- Reduces available capacity
- Prevents over-allocation during vacation

**Non-Billable Time:**
- Admin work
- Training
- Internal meetings
- Typically 10-20% of capacity

**Example:**
```
Jane Doe - Standard Capacity: 40 hrs/week
├─ Project A: 20 hrs (50%)
├─ Project B: 10 hrs (25%)
├─ Non-billable: 5 hrs (12.5%)
└─ Available: 5 hrs (12.5%)
────────────────────────────────
Total: 40 hrs (100%) ✅
```

---

#### Allocation Features

##### Percentage-Based

![Percentage Allocation](screenshots/28-allocation-percentage.png)  
*Figure 149: Percentage-based resource allocation*

**How it works:**
- Allocate 50% to Project A
- System calculates: 50% × 40 hrs = 20 hrs/week
- If capacity changes, hours auto-adjust

**Benefits:**
- Flexible when capacity varies
- Clear commitment level
- Easy to understand
- Adapts to person's schedule

**Example:**
```
John Smith - 40 hrs/week capacity
├─ Project Alpha: 50% = 20 hrs/week
├─ Project Beta: 30% = 12 hrs/week
└─ Available: 20% = 8 hrs/week
```

##### Date-Ranged

![Date Range Allocation](screenshots/28-allocation-dates.png)  
*Figure 150: Allocation with specific date ranges*

**Specify:**
- Start date
- End date
- Hours or percentage

**Handles:**
- Rotating assignments
- Project phases
- Temporary allocations
- Ramp-up/ramp-down

**Example:**
```
Sarah Lee
├─ Project X: Jan 1 - Mar 31 (50%)
├─ Project Y: Feb 15 - May 15 (30%)
└─ Project Z: Apr 1 - Jun 30 (40%)

Overlaps automatically detected!
```

##### Conflict Detection

![Conflict Warning](screenshots/28-conflict-warning.png)  
*Figure 151: Over-allocation conflict warning*

**System warns when:**
- Total allocation > 100%
- Overlapping assignments exceed capacity
- New allocation creates conflict

**Warning shows:**
- Current total allocation
- New allocation amount
- Resulting over-allocation %
- Affected date range

**Resolution options:**
1. Reduce allocation percentages
2. Adjust dates to eliminate overlap
3. Reassign to different resource
4. Increase person's capacity (if justified)
5. Cancel conflicting allocation

##### Utilization Color Coding

![Utilization Colors](screenshots/28-utilization-colors.png)  
*Figure 152: Color-coded utilization indicators*

**Color Scheme:**
- 🟢 **Green (0-85%):** Under-utilized, available capacity
- 🟡 **Yellow (86-100%):** Well-utilized, at capacity
- 🔴 **Red (101%+):** Over-allocated, conflict!

**Why 85% threshold:**
- Allows for non-billable work
- Buffer for meetings/admin
- Realistic sustainable utilization

**Visual Benefits:**
- Instant status recognition
- Easy capacity planning
- Quick conflict identification
- Executive dashboard clarity

---

#### Views

##### List View

![List View Details](screenshots/28-view-list-details.png)  
*Figure 153: Detailed list view with all allocation data*

**Columns:**
- Person name
- Project name
- Start/end dates
- Allocated hours or %
- Utilization status
- Actions (edit/delete)

**Features:**
- Sort by any column
- Filter by person/project/date
- Multi-select for bulk operations
- Export to Excel
- Print-friendly

**Best for:**
- Data entry
- Bulk updates
- Detailed analysis
- Report generation

##### Timeline View

![Timeline View Details](screenshots/28-view-timeline-details.png)  
*Figure 154: Interactive timeline with drag-and-drop*

**Display:**
- Gantt-style calendar
- Horizontal bars for allocations
- Color-coded by utilization
- Zoom controls (day/week/month view)

**Interactions:**
- Drag bars to adjust dates
- Resize bars to change duration
- Click bar to edit allocation
- Hover for quick details

**Best for:**
- Visual planning
- Identifying gaps
- Communicating to stakeholders
- Long-term capacity planning

---

### 5.5 Vocabulary Management

![Vocabulary Management](screenshots/29-vocabulary-full.png)  
*Figure 155: Complete vocabulary management system*

#### Why Customize

![Vocabulary Why](screenshots/29-vocabulary-why.png)  
*Figure 156: Examples of vocabulary customization by client*

**Reasons to customize:**

**1. Match Client Terminology**
```
Client A (Traditional Waterfall):
  Epic → Phase
  Stage → Deliverable
  Activity → Task

Client B (Agile):
  Epic → Theme
  Stage → Sprint
  Activity → Story
```

**2. Align with Methodology**
- Waterfall: Phase, Gate, Milestone
- Agile: Sprint, Story, Epic
- SAFe: PI, Iteration, Feature
- Custom: Whatever client uses

**3. Improve Communication**
- Stakeholders understand familiar terms
- Proposals use client's language
- Reports match client expectations
- Reduces translation overhead

---

#### Hierarchical Terms

![Vocabulary Hierarchy](screenshots/29-vocabulary-hierarchy.png)  
*Figure 157: Hierarchical vocabulary structure*

**Five Term Types:**

**1. Epic** (Top Level)
- Default: "Epic"
- Alternatives: Program, Release, Initiative, Theme, Phase, Module
- Represents: Major project deliverable or phase

**2. Stage** (Mid Level)
- Default: "Stage"
- Alternatives: Phase, Sprint, Iteration, Cycle, Step, Stream
- Represents: Sub-phase within epic

**3. Activity** (Detail Level)
- Default: "Activity"
- Alternatives: Task, Work Item, Deliverable, Ticket, Story, Job
- Represents: Specific work task

**4. Milestone**
- Default: "Milestone"
- Alternatives: Gate, Checkpoint, Review, Deliverable, Phase Gate
- Represents: Key decision or delivery point

**5. Workstream**
- Default: "Workstream"
- Alternatives: Track, Stream, Discipline, Capability, Domain
- Represents: Parallel work across epics

---

#### Configuration Levels

![Vocabulary Levels](screenshots/29-vocabulary-levels.png)  
*Figure 158: Vocabulary configuration cascade*

**Three Configuration Levels:**

##### 1. Organization (System-Wide)

![Organization Vocabulary](screenshots/29-vocab-org.png)  
*Figure 159: Organization-level vocabulary defaults*

**Set in:** System Settings → Vocabulary

**Applies to:**
- All new clients (unless overridden)
- All new projects (unless overridden)
- All new estimates

**Example:**
```
Organization Defaults:
  Epic: Phase
  Stage: Deliverable
  Activity: Task
  Milestone: Gate
  Workstream: Track
```

##### 2. Client-Specific

![Client Vocabulary](screenshots/29-vocab-client.png)  
*Figure 160: Client-specific vocabulary override*

**Set in:** Client detail → Vocabulary tab

**Applies to:**
- All projects for this client
- All estimates for this client

**Overrides:** Organization defaults

**Example:**
```
Client: Acme Corp (Agile shop)
  Epic: Theme
  Stage: Sprint
  Activity: Story
  (Uses org defaults for Milestone and Workstream)
```

##### 3. Project-Specific

![Project Vocabulary](screenshots/29-vocab-project.png)  
*Figure 161: Project-specific vocabulary override*

**Set in:** Project detail → Vocabulary tab

**Applies to:**
- Only this specific project
- All time entries and reports for this project

**Overrides:** Client and organization defaults

**Example:**
```
Project: Acme Corp - SAFe Implementation
  Epic: PI (Program Increment)
  Stage: Iteration
  Activity: Feature
  (Overrides client's normal Agile terms)
```

**Cascade Summary:**
```
Organization Default
   ↓ (client can override)
Client Setting
   ↓ (project can override)
Project Setting
   ↓ (estimate displays only)
Estimate Labels (cosmetic)
```

---

## 6. Tips & Best Practices

### 6.1 For All Users

#### Time Tracking Excellence

![Time Tracking Tips](screenshots/30-tips-time.png)  
*Figure 162: Time tracking best practices visual guide*

**DO:**
- ✅ Track time same day it's worked
- ✅ Use specific, detailed descriptions
- ✅ Link entries to project structure (epic/stage/activity)
- ✅ Review your week every Friday
- ✅ Round to nearest 0.25 hours
- ✅ Account for ALL work (meetings, research, etc.)

**DON'T:**
- ❌ Wait until Friday to track whole week
- ❌ Use vague descriptions ("work", "meeting")
- ❌ Forget to track small tasks
- ❌ Round down significantly
- ❌ Track personal time as billable
- ❌ Guess at hours after the fact

**Pro Tips:**
- 📱 Use mobile app for on-the-go tracking
- ⏰ Set daily reminder at end of workday
- 📝 Keep running notes of tasks during day
- 🔄 Copy yesterday's entries for ongoing work
- 📊 Review your weekly reports for patterns

---

#### Expense Report Success

![Expense Tips](screenshots/30-tips-expenses.png)  
*Figure 163: Expense reporting best practices*

**DO:**
- ✅ Photograph receipts immediately after purchase
- ✅ Submit expense reports within 30 days
- ✅ Categorize expenses accurately
- ✅ Add context in descriptions
- ✅ Keep original receipts until reimbursed
- ✅ Split personal/business on same receipt

**DON'T:**
- ❌ Lose receipts before submitting
- ❌ Wait months to submit
- ❌ Combine personal and business expenses
- ❌ Use unclear descriptions
- ❌ Submit without receipt images
- ❌ Misrepresent expense purpose

**Pro Tips:**
- 📸 Use phone camera immediately after transaction
- 📁 Create "Receipts" folder in phone photos
- 💡 Note business purpose on receipt if unclear
- 📧 Email digital receipts to yourself
- ✏️ Submit weekly instead of monthly (smaller batches)

---

#### General Productivity

![General Tips](screenshots/30-tips-general.png)  
*Figure 164: General SCDP productivity tips*

**Daily Habits:**
- 🌅 Check dashboard first thing in morning
- 📧 Read SCDP email notifications
- ✅ Update your assignments status
- 🕒 Track time at end of each day
- 🔍 Review tomorrow's schedule

**Weekly Habits:**
- 📊 Review time entries for completeness
- 💰 Submit expense reports
- 📅 Check upcoming deadlines
- 👥 Communicate capacity changes to PM
- 📈 Review project progress (if PM)

**Security:**
- 🔒 Log out when leaving workstation
- 🔐 Don't share credentials
- 👀 Don't display sensitive data on shared screens
- 💻 Use company VPN if remote

---

### 6.2 For Project Managers

#### Estimation Wisdom

![Estimation Tips](screenshots/31-tips-estimation.png)  
*Figure 165: Project estimation best practices*

**Before You Start:**
- 📚 Review historical data from similar projects
- 🎯 Clarify scope boundaries with stakeholders
- 👥 Identify available resources
- 💰 Understand client's budget constraints
- 📋 Confirm rate structures are current

**Building the Estimate:**
- ✅ Break work into smallest reasonable tasks
- ✅ Use factors for repetitive work (4 interviews × 3 hrs)
- ✅ Apply confidence buffers honestly
- ✅ Include non-delivery work (meetings, admin)
- ✅ Add payment milestones that match deliverables
- ✅ Get peer review before finalizing

**Common Pitfalls:**
- ❌ Underestimating complexity
- ❌ Forgetting about meetings/admin overhead
- ❌ Assuming perfect efficiency
- ❌ Not accounting for client delays
- ❌ Ignoring dependencies and blockers
- ❌ Copying old estimates without adjusting

**Pro Tips:**
- 🎯 Use "T-shirt sizing" (S/M/L) early, refine later
- 📊 Compare to actuals from past projects
- 👥 Involve team members in estimation
- 💡 Plan for 20-30% non-billable overhead
- 🔄 Revisit and refine as scope clarifies

---

#### Project Setup Excellence

![Project Setup Tips](screenshots/31-tips-project-setup.png)  
*Figure 166: Project setup best practices*

**Day 1 Checklist:**
- ✅ Upload signed SOW immediately
- ✅ Set realistic start and end dates
- ✅ Assign yourself as PM
- ✅ Configure commercial scheme correctly
- ✅ Copy or create project structure
- ✅ Set up payment milestones

**Week 1 Checklist:**
- ✅ Allocate all team members
- ✅ Verify no resource conflicts
- ✅ Communicate assignments to team
- ✅ Schedule kickoff meeting
- ✅ Review budget baseline
- ✅ Set up project folder/workspace

**Pro Tips:**
- 📅 Add buffer time to end date
- 👥 Allocate resources before announcing to team
- 📄 Store SOW in SharePoint AND email to team
- 🎯 Create first sprint/iteration before kickoff
- 📊 Set up reporting cadence with stakeholders

---

#### Resource Management Mastery

![Resource Management Tips](screenshots/31-tips-resources.png)  
*Figure 167: Resource management best practices*

**Planning:**
- ✅ Check capacity before allocating
- ✅ Plan for PTO and holidays
- ✅ Include ramp-up/ramp-down periods
- ✅ Account for non-billable time
- ✅ Consider skill/experience match
- ✅ Document allocation rationale

**Monitoring:**
- ✅ Review utilization weekly
- ✅ Watch for early over-allocation warnings
- ✅ Address conflicts immediately
- ✅ Communicate changes to affected team
- ✅ Track to actuals (plan vs reality)
- ✅ Adjust allocations as project evolves

**Communication:**
- ✅ Notify team of assignments ASAP
- ✅ Explain context and importance
- ✅ Set clear expectations
- ✅ Provide access to project materials
- ✅ Regular check-ins on capacity
- ✅ Be flexible when conflicts arise

**Common Mistakes:**
- ❌ Allocating 100% (no buffer for meetings)
- ❌ Not checking for existing commitments
- ❌ Assuming instant availability
- ❌ Ignoring skill gaps
- ❌ Not communicating changes
- ❌ Over-optimizing (people aren't resources)

---

#### Budget Monitoring

![Budget Tips](screenshots/31-tips-budget.png)  
*Figure 168: Budget monitoring best practices*

**Weekly Review:**
- 📊 Check burn rate vs plan
- ⚠️ Identify variances early
- 🎯 Compare budget to actual by epic
- 👥 Review team utilization
- 📧 Communicate concerns immediately

**Red Flags:**
- 🚩 Burning >10% faster than plan
- 🚩 Low-confidence tasks exceeding estimates
- 🚩 Scope creep without change orders
- 🚩 Team member over-logging hours
- 🚩 Client requesting out-of-scope work

**Corrective Actions:**
- 💬 Have conversation with client (early!)
- 📄 Prepare change order if scope changed
- 👥 Adjust resource allocation
- 🎯 Re-prioritize deliverables
- 📊 Update forecast and communicate

**Pro Tips:**
- 📈 Use burn-down charts for visibility
- 💡 Flag potential issues 2 weeks early
- 📝 Document all scope changes
- 🤝 Under-promise, over-deliver on budget
- 🔮 Update forecast monthly

---

### 6.3 For Administrators

#### User Management Best Practices

![User Management Tips](screenshots/32-tips-users.png)  
*Figure 169: User account management best practices*

**Onboarding New Users:**
- ✅ Create account before start date
- ✅ Set appropriate role and permissions
- ✅ Configure default rates
- ✅ Add to correct team/department
- ✅ Enable "Can Login" when ready
- ✅ Send welcome email with instructions
- ✅ Schedule brief training session

**Ongoing Maintenance:**
- 🔍 Quarterly audit of user access
- 🧹 Deactivate (don't delete) departed employees
- 🔄 Review and update roles as responsibilities change
- 📊 Monitor for unused accounts
- ✅ Verify "Can Login" matches actual needs
- 🔐 Ensure SSO sync is working

**Offboarding:**
- ✅ Set "Is Active" to false
- ✅ Disable "Can Login"
- ✅ Keep "Is Assignable" off
- ✅ DO NOT DELETE (preserves historical data)
- ✅ Reassign their projects to new PM
- ✅ Export their time/expense history if needed
- ✅ Document departure date in notes

**Common Mistakes:**
- ❌ Deleting users (breaks historical data)
- ❌ Not removing login access promptly
- ❌ Leaving contractors with full employee access
- ❌ Not auditing permissions regularly
- ❌ Granting admin role too freely

---

#### Rate Management Strategy

![Rate Tips](screenshots/32-tips-rates.png)  
*Figure 170: Rate management strategy*

**Annual Review:**
- 📅 Schedule rate review (typically Q4)
- 📊 Compare to market rates
- 💰 Consider cost of living adjustments
- 🎯 Review profitability by role
- 📈 Update for new fiscal year
- 📧 Communicate changes to PMs

**Client-Specific Rates:**
- ✅ Document special pricing in contract
- ✅ Set override in SCDP immediately
- ✅ Note expiration date if temporary
- ✅ Review annually (does discount still apply?)
- ✅ Communicate to PMs using this client

**Project-Specific Rates:**
- ✅ Use for one-off situations only
- ✅ Document reason in project notes
- ✅ Clear override after project completes
- ✅ Review if project extends

**Rate Hierarchy:**
```
System Default (fallback)
   ↓
Client Override (special pricing)
   ↓
Project Override (one-off situations)
```

**Best Practices:**
- 📝 Document rationale for all overrides
- 🔒 Restrict rate editing to admins only
- 📊 Report on profitability by rate tier
- ⚠️ Flag below-cost rates for review
- 🔄 Revisit annually

---

#### System Maintenance

![System Maintenance](screenshots/32-tips-maintenance.png)  
*Figure 171: System maintenance schedule*

**Monthly Tasks:**
- 🧹 Archive completed projects
- 🗑️ Clean up draft estimates (>90 days old)
- 📊 Review storage usage (SharePoint)
- 📧 Test email notifications
- 🔍 Review system error logs
- 📈 Check system performance

**Quarterly Tasks:**
- 👥 User access audit
- 📚 Vocabulary review (still relevant?)
- 💰 Rate review (still competitive?)
- 🔗 Integration health check (SharePoint, SSO)
- 📊 Generate usage reports
- 🎓 Identify training needs

**Annual Tasks:**
- 🔄 Full system review
- 📋 Update policies and procedures
- 🎯 Set targets for next year
- 🏆 Review successes and failures
- 🔮 Plan for new features
- 📖 Update documentation

**Best Practices:**
- 📅 Schedule maintenance windows
- 📧 Communicate downtime to users
- 💾 Verify backups are working
- 📊 Track key metrics over time
- 🎓 Continuous admin training

---

### 6.4 Data Quality

![Data Quality](screenshots/33-data-quality.png)  
*Figure 172: Data quality management*

#### Maintain Clean Data

**Naming Conventions:**
```
✅ Good:
  - Projects: "CLIENT-2024-ProjectName"
  - Estimates: "CLIENT-EST-001-ProjectName"
  - Expense Reports: "YYYY-MM - Purpose"

❌ Bad:
  - Projects: "project1", "test", "new"
  - Estimates: "draft", "estimate"
  - Expense Reports: "expenses"
```

**Project Hygiene:**
- ✅ Archive completed projects (don't delete)
- ✅ Update status regularly (active/on-hold/completed)
- ✅ Close out financially when done
- ✅ Ensure all time is billed
- ✅ Upload final deliverables

**Estimate Cleanup:**
- 🗑️ Archive rejected estimates
- 🗑️ Delete truly abandoned drafts (>90 days)
- ✅ Keep approved estimates (linked to projects)
- ✅ Mark superseded versions clearly

**Client Deduplication:**
- 🔍 Search before creating new client
- 🔄 Merge duplicates carefully
- ✅ Use full legal names
- ✅ Add "DBA" in description if needed

---

#### Regular Reviews

![Review Schedule](screenshots/33-review-schedule.png)  
*Figure 173: Regular data review schedule*

**Monthly Reviews:**

**Unbilled Items:**
- ⏰ When: First week of month
- 🔍 Review: All unbilled time and expenses
- 🎯 Action: Create invoices or investigate delays
- 👥 Owner: Billing Administrator

**Project Health:**
- ⏰ When: Mid-month
- 🔍 Review: Budget vs actual for all active projects
- 🎯 Action: Address variances, update forecasts
- 👥 Owner: Project Managers

**Quarterly Reviews:**

**Project Profitability:**
- ⏰ When: End of each quarter
- 🔍 Review: Margin by project, client, service line
- 🎯 Action: Identify patterns, adjust pricing
- 👥 Owner: Executives + Finance

**Resource Utilization:**
- ⏰ When: End of each quarter
- 🔍 Review: Utilization rates by person, team
- 🎯 Action: Hire/reduce, redistribute work
- 👥 Owner: Executives + PMs

**Annual Reviews:**

**Rate Structures:**
- ⏰ When: Q4 for next fiscal year
- 🔍 Review: All rates vs market
- 🎯 Action: Update rates, communicate changes
- 👥 Owner: Administrators + Finance

**Vocabulary Terms:**
- ⏰ When: Q4
- 🔍 Review: Are current terms still appropriate?
- 🎯 Action: Add new, deprecate unused
- 👥 Owner: Administrators

**User Access:**
- ⏰ When: Q4
- 🔍 Review: Who has access, is it still needed?
- 🎯 Action: Remove/adjust access
- 👥 Owner: Administrators

---

## 7. Getting Help

### 7.1 Within SCDP

![Help Resources](screenshots/34-help-resources.png)  
*Figure 174: In-app help resources*

**About Page:**
- Navigate to **About** in menu
- View current version number
- See what's new in latest release
- Access contact information

**Recent Changes:**
- Check browser history for your actions
- Review audit logs (if admin)
- See who changed what and when

**Contact Your Admin:**
- Email or Teams message
- Include screenshot of issue
- Note what you were trying to do
- Describe expected vs actual behavior

---

### 7.2 Common Issues

#### Cannot Log In

![Login Issues](screenshots/34-issue-login.png)  
*Figure 175: Login troubleshooting*

**Symptoms:**
- Can't access SCDP
- Error message on login
- Redirected back to login page

**Troubleshooting:**
1. ✅ Verify you have "Can Login" permission
   - Ask your administrator
2. ✅ Check Microsoft SSO credentials
   - Can you log into Outlook/Teams?
   - Try password reset
3. ✅ Clear browser cache and cookies
   - Settings → Privacy → Clear browsing data
4. ✅ Try different browser
   - Chrome, Edge, Firefox recommended
5. ✅ Disable browser extensions
   - Ad blockers can interfere
6. ✅ Contact IT administrator
   - Provide screenshots of error

---

#### Time Entry Not Saving

![Time Entry Issues](screenshots/34-issue-time.png)  
*Figure 176: Time entry troubleshooting*

**Symptoms:**
- Click Save, nothing happens
- Error message when saving
- Entry disappears after save

**Troubleshooting:**
1. ✅ Verify project assignment
   - Are you allocated to this project?
   - Check My Assignments
2. ✅ Check if already invoiced
   - Can't edit billed time
   - Contact billing admin to adjust invoice
3. ✅ Ensure all required fields completed
   - Project, Date, Hours, Description
4. ✅ Check date isn't locked
   - Some organizations lock past periods
5. ✅ Try refreshing page
   - Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
6. ✅ Check browser console for errors
   - F12 → Console tab
   - Screenshot errors for admin

---

#### Expense Report Rejected

![Expense Rejection](screenshots/34-issue-expense.png)  
*Figure 177: Handling expense report rejection*

**What to Do:**
1. 📖 Read rejection comments carefully
   - Manager explains why
2. 🔍 Review expense details
   - Is amount correct?
   - Is category appropriate?
   - Is description clear?
3. 📷 Check receipt image
   - Is it readable?
   - Does it match amount?
   - Shows date and vendor?
4. ✏️ Make necessary corrections
   - Fix issues noted in comments
5. 🔄 Resubmit for approval
   - Add note explaining changes
6. 💬 If unclear, ask manager
   - Email or chat for clarification

---

#### Missing from Resource Assignments

![Assignment Issues](screenshots/34-issue-assignment.png)  
*Figure 178: Troubleshooting missing assignments*

**Symptoms:**
- Don't see self in My Assignments
- Can't find project to log time to
- Not in resource allocation list

**Troubleshooting:**
1. ✅ Verify "Is Assignable" flag enabled
   - Check with administrator
   - User profile setting
2. ✅ Check project date ranges
   - Are you allocated for current date?
   - Allocations are date-specific
3. ✅ Confirm you're allocated to project
   - Ask PM to check Resource Management
   - May just need to be added
4. ✅ Refresh browser
   - Ctrl+F5 or Cmd+Shift+R
5. ✅ Contact project manager
   - They can add allocation
   - May be administrative oversight

---

### 7.3 Getting Support

![Support Contact](screenshots/34-support.png)  
*Figure 179: Support contact information*

**For Technical Issues:**
- **IT Help Desk:** [Your IT contact]
- **Email:** [IT support email]
- **Phone:** [IT support phone]
- **Hours:** Monday-Friday, 9am-5pm

**For Process/Usage Questions:**
- **SCDP Administrator:** [Admin name]
- **Email:** [Admin email]
- **Teams:** [Teams channel]

**For Billing Questions:**
- **Billing Administrator:** [Billing contact]
- **Email:** [Billing email]

**When Contacting Support:**
1. 📧 Use descriptive subject line
2. 📸 Include screenshots
3. 📝 Describe what you were doing
4. ⚠️ Include any error messages
5. 💻 Note browser and operating system
6. 📅 Mention if urgent

---

## Converting This Guide to DOCX

This guide is provided in Markdown format. To convert to Microsoft Word (DOCX):

### Method 1: Using Pandoc (Recommended)

**Install Pandoc:**
- Windows: Download from https://pandoc.org/installing.html
- Mac: `brew install pandoc`
- Linux: `apt-get install pandoc`

**Convert:**
```bash
pandoc SCDP-User-Guide.md -o SCDP-User-Guide.docx --toc
```

**With Custom Styling:**
```bash
pandoc SCDP-User-Guide.md -o SCDP-User-Guide.docx \
  --reference-doc=custom-template.docx \
  --toc \
  --toc-depth=3
```

### Method 2: Using Microsoft Word

1. Open Microsoft Word
2. File → Open
3. Select "All Files" in file type dropdown
4. Select the `.md` file
5. Word will convert automatically
6. File → Save As → Word Document (.docx)

### Method 3: Using Online Converter

1. Visit: https://cloudconvert.com/md-to-docx
2. Upload `SCDP-User-Guide.md`
3. Click "Convert"
4. Download resulting DOCX file

### Method 4: Copy/Paste into Word

1. Open Markdown file in text editor
2. Copy all content
3. Paste into Word
4. Format as needed (headings, lists, etc.)

**Note:** Screenshots will need to be collected manually and inserted at the indicated positions (`screenshots/*.png`).

---

## Document Information

**Document Title:** SCDP User Guide  
**Version:** 1.0  
**Date:** October 31, 2025  
**Author:** Synozur Consulting  
**Platform:** Synozur Consulting Delivery Platform (SCDP)  
**Audience:** All SCDP users (Employees, Project Managers, Billing Admins, Executives, Administrators)

---

**© 2025 Synozur Consulting. All rights reserved.**
