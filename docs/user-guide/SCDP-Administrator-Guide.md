# SCDP Administrator Guide
## Synozur Consulting Delivery Platform

**Version:** 1.8  
**Last Updated:** March 15, 2026  
**Document Type:** System Administrator Reference  
**Audience:** SCDP System Administrators

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Initial System Setup](#2-initial-system-setup)
3. [User Management](#3-user-management)
4. [Rate & Billing Configuration](#4-rate--billing-configuration)
5. [SharePoint Integration](#5-sharepoint-integration)
6. [Vocabulary Customization](#6-vocabulary-customization)
7. [System Settings](#7-system-settings)
8. [Maintenance & Monitoring](#8-maintenance--monitoring)
9. [Security & Compliance](#9-security--compliance)
10. [Troubleshooting](#10-troubleshooting)
11. [Backup & Disaster Recovery](#11-backup--disaster-recovery)
12. [Best Practices](#12-best-practices)

---

## 1. Introduction

### 1.1 Purpose of This Guide

This Administrator Guide provides comprehensive information for SCDP system administrators responsible for:

- Initial system configuration
- User account management
- Rate and billing setup
- Integration management (SharePoint, SSO)
- Ongoing system maintenance
- Security and compliance
- Troubleshooting and support

### 1.2 Administrator Role Overview

As a SCDP Administrator, you have full access to all system features including:

✅ **All User Capabilities**
- Time tracking, expenses, assignments

✅ **All Project Manager Capabilities**
- Clients, estimates, projects, resource management

✅ **All Billing Administrator Capabilities**
- Invoicing, expense approval, reimbursements

✅ **All Executive Capabilities**
- Reports, analytics, cross-project views

✅ **Exclusive Administrator Capabilities**
- User account management
- Role and permission assignment
- Rate structure configuration
- System settings and vocabulary
- Integration setup (SharePoint, SSO)
- Audit logs and system diagnostics

### 1.3 Required Knowledge

**Technical Skills:**
- Basic understanding of web applications
- Familiarity with Microsoft 365 ecosystem
- SharePoint Online concepts
- User access management
- Basic database concepts (helpful but not required)

**Business Knowledge:**
- Consulting delivery processes
- Project management basics
- Billing and invoicing workflows
- Resource allocation concepts

---

## 2. Initial System Setup

### 2.1 First-Time Configuration Checklist

When setting up SCDP for the first time:

#### Phase 1: Administrator Account (Day 1)

![Admin Setup](screenshots/admin-01-initial-setup.png)

1. ✅ **Verify your admin account exists**
   - Email: Your SSO email
   - Role: Administrator
   - Can Login: Enabled
   - Is Active: True

2. ✅ **Test SSO authentication**
   - Log in via Microsoft SSO
   - Verify dashboard loads
   - Check permissions work

3. ✅ **Review default system settings**
   - Navigate to System Settings
   - Note current configuration
   - Document any changes needed

#### Phase 2: Core Configuration (Week 1)

4. ✅ **Configure Organization Vocabulary**
   - System Settings → Vocabulary
   - Select default terms for:
     - Epic (default: "Epic")
     - Stage (default: "Stage")
     - Workstream (default: "Workstream")
     - Milestone (default: "Milestone")
     - Activity (default: "Activity")
   - Add custom terms if needed
   - Set organization defaults

5. ✅ **Set up Role-Based Rates**
   - Navigate to Rates → Roles
   - Create standard roles:
     - Partner
     - Director
     - Senior Consultant
     - Consultant
     - Analyst
     - Project Manager
   - Set default rack rates for each
   - Document rate rationale

6. ✅ **Configure System Defaults**
   - Default capacity: 40 hours/week (or your standard)
   - Estimate multipliers:
     - Size: Small (1.0), Medium (1.05), Large (1.10)
     - Complexity: Small (1.0), Medium (1.05), Large (1.10)
     - Confidence: High (1.0), Medium (1.10), Low (1.20)
   - Currency: USD (or primary currency)
   - Date format: MM/DD/YYYY (or regional preference)

7. ✅ **Set up SharePoint Integration**
   - See Section 5 for detailed instructions
   - Configure development environment
   - Configure production environment
   - Test connection
   - Verify folder creation

#### Phase 3: User Onboarding (Week 1-2)

8. ✅ **Create user accounts**
   - Import user list from HR
   - Set roles appropriately
   - Configure default rates
   - Enable/disable login as needed
   - Set assignable flag

9. ✅ **Create initial clients** (if migrating)
   - Import client list
   - Set up client contacts
   - Upload existing MSAs/NDAs

10. ✅ **Train initial users**
    - Schedule training sessions
    - Provide user guide
    - Offer hands-on practice time
    - Create FAQ document

---

### 2.2 Post-Installation Verification

**System Health Checks:**

```
✅ SSO authentication working
✅ Email notifications sending
✅ SharePoint connection active
✅ Users can log in
✅ Users can create time entries
✅ Users can submit expenses
✅ Managers can approve expenses
✅ Billing can create invoices
✅ Documents upload to SharePoint
✅ Rate hierarchy applies correctly
```

**Test Workflow:**

1. Create test user account
2. Log in as test user
3. Create time entry
4. Submit expense report
5. Approve as manager
6. Create invoice
7. Verify document in SharePoint
8. Delete test data

---

## 3. User Management

### 3.1 User Account Lifecycle

![User Lifecycle](screenshots/admin-02-user-lifecycle.png)

#### Creating New User Accounts

**When to Create:**
- New employee onboarding
- Contractor engagement
- External consultant access

**Information Needed:**
- Full legal name
- Email address (for SSO)
- Job title
- Department/team
- Role (employee, PM, billing-admin, executive, admin)
- Default billing rate
- Default cost rate
- Start date

**Step-by-Step:**

![Create User](screenshots/admin-02-user-create.png)

1. Navigate to **Users** → **Add User**
2. Enter user details:
   ```
   Email: john.smith@company.com
   First Name: John
   Last Name: Smith
   Full Name: John Smith
   Initials: JS
   Title: Senior Consultant
   Role: employee
   Can Login: ✅ (enabled)
   Is Assignable: ✅ (enabled)
   Is Active: ✅ (enabled)
   Default Billing Rate: $175.00
   Default Cost Rate: $100.00
   ```
3. Click **"Create User"**
4. System sends welcome email (if configured)
5. User can now log in via SSO

**Important Flags:**

**Can Login:**
- ✅ ON: User can authenticate and access SCDP
- ❌ OFF: User exists for tracking only (contractors, historical)

**Is Assignable:**
- ✅ ON: Appears in resource allocation dropdowns
- ❌ OFF: Hidden from project assignments (non-delivery staff)

**Is Active:**
- ✅ ON: Normal active user
- ❌ OFF: Deactivated (preserves historical data)

---

#### Editing Existing Users

**Common Edit Scenarios:**

**Promotion/Role Change:**
```
Scenario: John Smith promoted to Project Manager
Action:
1. Edit user: John Smith
2. Change Role: employee → pm
3. Update Title: Senior Consultant → Project Manager
4. Adjust rates if applicable
5. Save changes
Result: John immediately has PM permissions
```

**Rate Adjustment:**
```
Scenario: Annual rate increase
Action:
1. Edit user
2. Update Default Billing Rate: $175 → $185
3. Update Default Cost Rate: $100 → $105
4. Document reason: "2025 Annual Increase"
5. Save
Result: New estimates use new rate; existing unchanged
```

**Leave of Absence:**
```
Scenario: Employee on extended leave
Action:
1. Edit user
2. Set Is Assignable: ❌ (prevents new assignments)
3. Keep Can Login: ✅ (can access for expenses if needed)
4. Keep Is Active: ✅ (still employed)
5. Add note: "LOA until MM/DD/YYYY"
Result: Hidden from new allocations but can access system
```

---

#### Offboarding Users

**CRITICAL: Never delete users with historical data!**

![User Offboarding](screenshots/admin-02-user-offboard.png)

**Proper Offboarding Process:**

```
Step 1: Disable Access (Last Day)
1. Edit user
2. Set Can Login: ❌
3. Set Is Assignable: ❌
4. Keep Is Active: ✅ (for now)
5. Add termination date in notes

Step 2: Reassign Active Work (Within 1 week)
1. Review user's active project assignments
2. Reassign to other team members
3. Update resource allocations
4. Notify affected project managers

Step 3: Archive (After 30 days)
1. Export user's time/expense history
2. Set Is Active: ❌
3. User hidden from default views
4. All historical data preserved
5. Can still see in reports/audit logs

Step 4: Document (Ongoing)
- Keep records of:
  - Final timesheet
  - Outstanding expenses
  - Project knowledge transfer
  - Exit interview notes
```

**Why Not Delete:**
- Breaks time entry references
- Corrupts expense report data
- Loses project allocation history
- Breaks audit trail
- Cannot recreate historical reports

**Deactivate Instead:**
- Preserves all historical data
- Maintains referential integrity
- Supports audit requirements
- Allows historical reporting
- Can reactivate if rehired

---

### 3.2 Role-Based Access Control

![RBAC Matrix](screenshots/admin-02-rbac-matrix.png)

**Permission Matrix:**

| Feature | Employee | PM | Billing Admin | Executive | Admin |
|---------|----------|-----|---------------|-----------|-------|
| **Time Tracking** |
| View own time | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own time | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all time | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit others' time | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Expenses** |
| Submit expenses | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve expenses | ❌ | ❌ | ✅ | ✅ | ✅ |
| Process reimbursement | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Projects** |
| View assigned projects | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all projects | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create/edit projects | ❌ | ✅ | ❌ | ❌ | ✅ |
| Delete projects | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Clients** |
| View clients | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit clients | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Estimates** |
| View estimates | ❌ | ✅ | ❌ | ✅ | ✅ |
| Create/edit estimates | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Billing** |
| View invoices | ❌ | ❌ | ✅ | ✅ | ✅ |
| Create invoices | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Resources** |
| View own assignments | ✅ | ✅ | ✅ | ✅ | ✅ |
| View all allocations | ❌ | ✅ | ❌ | ✅ | ✅ |
| Manage allocations | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Reports** |
| Personal reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project reports | ❌ | ✅ | ✅ | ✅ | ✅ |
| Executive reports | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Administration** |
| Manage users | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage rates | ❌ | ❌ | ❌ | ❌ | ✅ |
| System settings | ❌ | ❌ | ❌ | ❌ | ✅ |
| SharePoint config | ❌ | ❌ | ❌ | ❌ | ✅ |

---

### 3.3 Bulk Operations

#### Importing Users

**CSV Import Format:**

```csv
email,firstName,lastName,title,role,canLogin,isAssignable,defaultBillingRate,defaultCostRate
john.smith@company.com,John,Smith,Senior Consultant,employee,true,true,175.00,100.00
jane.doe@company.com,Jane,Doe,Project Manager,pm,true,true,200.00,120.00
bob.jones@company.com,Bob,Jones,Director,executive,true,false,250.00,150.00
```

**Import Process:**

![Bulk Import](screenshots/admin-02-bulk-import.png)

1. Prepare CSV file following template
2. Navigate to **Users** → **Import**
3. Upload CSV file
4. Review preview
5. Validate data (system checks for errors)
6. Confirm import
7. System creates all users
8. Review import log for any failures

**Common Import Errors:**
- Duplicate emails
- Invalid role names
- Missing required fields
- Invalid rate formats
- SSO email mismatch

---

#### Annual Rate Updates

**Bulk Rate Increase:**

![Bulk Rate Update](screenshots/admin-02-bulk-rates.png)

```
Scenario: 5% annual increase for all employees
Process:
1. Export current user list with rates
2. Calculate new rates in Excel
3. Prepare import CSV with updated rates
4. Import to update rates
5. Document change: "2025 Annual 5% Increase"
6. Notify PMs of new rates
```

**Selective Updates:**

```
Scenario: Different increases by role
Process:
1. Filter users by role
2. Update each role group:
   - Partners: 3% increase
   - Directors: 4% increase
   - Consultants: 5% increase
   - Analysts: 6% increase
3. Import each group
4. Verify changes
```

---

## 4. Rate & Billing Configuration

### 4.1 Rate Hierarchy Architecture

![Rate Hierarchy](screenshots/admin-03-rate-hierarchy.png)

**Three-Tier System:**

```
Tier 1: System Defaults (Fallback)
   ↓ (can override)
Tier 2: Client-Specific Rates
   ↓ (can override)
Tier 3: Project-Specific Rates (Highest Priority)
```

**Resolution Logic:**

```javascript
function getBillingRate(user, project) {
  // Check project-specific override
  if (project.hasRateOverride(user)) {
    return project.getRateOverride(user);
  }
  
  // Check client-specific override
  if (project.client.hasRateOverride(user.role)) {
    return project.client.getRateOverride(user.role);
  }
  
  // Fall back to user default
  return user.defaultBillingRate;
}
```

---

### 4.2 Managing Role-Based Rates

**Standard Roles Setup:**

![Role Rates](screenshots/admin-03-roles.png)

**Creating a Role:**

```
Example: Senior Consultant
1. Navigate to Rates → Roles
2. Click "Add Role"
3. Enter:
   Name: Senior Consultant
   Default Rack Rate: $175.00
4. Save

Result: Available in estimates and user profiles
```

**Typical Role Structure:**

```
Executive Tier:
├─ Partner: $300/hr
├─ Managing Director: $275/hr
└─ Director: $250/hr

Senior Tier:
├─ Principal Consultant: $225/hr
├─ Senior Consultant: $175/hr
└─ Senior Analyst: $150/hr

Mid Tier:
├─ Consultant: $135/hr
├─ Analyst: $110/hr
└─ Associate: $95/hr

Project Management:
├─ Senior PM: $200/hr
├─ Project Manager: $160/hr
└─ Project Coordinator: $120/hr

Specialized:
├─ Architect: $225/hr
├─ Technical Lead: $200/hr
└─ Designer: $150/hr
```

**Annual Rate Review Process:**

```
Q4 Annual Review:
1. Export current rates
2. Compare to market data (salary surveys)
3. Calculate desired increases
4. Review profitability by role
5. Get executive approval
6. Update rates in SCDP
7. Communicate to organization
8. Effective date: Jan 1

Timeline:
├─ October: Gather market data
├─ November: Analyze and propose
├─ Early December: Get approvals
└─ Late December: Implement in system
```

---

### 4.3 Client-Specific Rate Overrides

**When to Use:**

✅ **Volume Discounts**
```
Example: Client commits to $500K annual spend
Action: Set 10% discount on all rates
Implementation:
1. Open client: Acme Corp
2. Navigate to Rate Overrides
3. For each role used:
   - Senior Consultant: $175 → $157.50
   - Consultant: $135 → $121.50
4. Document: "Volume discount - $500K commitment"
5. Set expiration: Dec 31, 2025
```

✅ **Contractual Agreements**
```
Example: MSA specifies fixed rates
Action: Set exact contract rates
Implementation:
1. Review signed contract rate schedule
2. Create override for each role
3. Link to contract document
4. All projects use these rates
```

✅ **Strategic Pricing**
```
Example: New client, competitive bid
Action: Reduce rates 5-10% to win work
Implementation:
1. Calculate reduced rates
2. Set client overrides
3. Document: "Strategic pricing - new client acquisition"
4. Review after first project
```

❌ **Don't Use For:**
- One-off projects (use project override instead)
- Temporary adjustments
- Pilot/proof-of-concept work

---

### 4.4 Project-Specific Rate Overrides

**When to Use:**

✅ **Non-Profit/Pro-Bono**
```
Example: Charity work at reduced rates
Action: Set special rates for this project only
Rates: 50% of standard or $0 for pro-bono
```

✅ **Blended Rate Contracts**
```
Example: Contract specifies single blended rate
Action: Set all team members to $150/hr
Benefit: Simplifies invoicing
```

✅ **Fixed-Price True-Up**
```
Example: Fixed price project, need to track actuals
Action: Set internal rates for margin tracking
Purpose: Compare actual cost vs fixed price
```

✅ **Pilot/POC Pricing**
```
Example: Proof-of-concept with special pricing
Action: Reduce rates 20% for pilot only
Duration: Single project
```

❌ **Don't Overuse:**
- Creates configuration complexity
- Hard to maintain
- Difficult to audit
- Use client-level when possible

---

### 4.5 Rate Snapshot Mechanism

**How It Works:**

![Rate Snapshot](screenshots/admin-03-snapshot.png)

```
When Estimate Created (Feb 1, 2025):
├─ Current Rates Captured:
│   ├─ Senior Consultant: $175/hr
│   ├─ Consultant: $135/hr
│   └─ Analyst: $110/hr
├─ Saved in estimate.rackRateSnapshot JSON field
└─ These rates used for ALL line items

Rate Change (May 1, 2025):
├─ Update rates in system:
│   ├─ Senior Consultant: $175 → $185/hr
│   ├─ Consultant: $135 → $145/hr
│   └─ Analyst: $110 → $120/hr
└─ Existing estimate UNAFFECTED (still uses $175, $135, $110)

New Estimate (May 2, 2025):
├─ Uses NEW rates:
│   ├─ Senior Consultant: $185/hr
│   ├─ Consultant: $145/hr
│   └─ Analyst: $120/hr
└─ Snapshot saved again
```

**Benefits:**
- Estimates remain accurate over time
- No retroactive pricing changes
- Clear audit trail
- Can compare historical estimates
- Supports long sales cycles

**Viewing Historical Rates:**

```
In Estimate Detail:
1. Open any estimate
2. Click "Rate Snapshot" tab
3. View rates as of estimate creation date
4. Compare to current rates
5. See what changed since creation
```

---

## 5. SharePoint Integration

### 5.1 Architecture Overview

![SharePoint Architecture](screenshots/admin-04-sharepoint-architecture.png)

**SCDP uses SharePoint Online for document storage:**

```
Storage Strategy:
├─ SharePoint Online (Primary)
│   ├─ Receipts: Expense receipt images
│   ├─ Invoices: Generated invoice PDFs
│   ├─ SOWs: Statements of Work
│   └─ Change Orders: Contract amendments
├─ Replit Object Storage (Legacy, being phased out)
└─ Local Filesystem (Development only)
```

**Authentication:**
- Replit SharePoint Connector
- OAuth 2.0 via Microsoft Graph API
- Automatic token refresh
- No certificate management required

**Organization:**
- Environment-specific (dev vs prod)
- Automatic folder structure
- Configurable site and library

---

### 5.2 Initial Setup

#### Prerequisites

![SharePoint Prerequisites](screenshots/admin-04-prerequisites.png)

**Before Configuring:**

1. ✅ **SharePoint Site Access**
   - URL of SharePoint site (e.g., `https://company.sharepoint.com/sites/RevOps/`)
   - Permissions to create document libraries
   - Permissions to create folders

2. ✅ **Document Library Created**
   - Development library (e.g., "SCDP-Dev")
   - Production library (e.g., "SCDP-Prod")
   - Can be in same site or different sites

3. ✅ **Permissions Granted**
   - SCDP app registration has access
   - Permissions include:
     - Sites.Read.All
     - Sites.ReadWrite.All
     - Files.ReadWrite.All
   - Admin consent granted

4. ✅ **Replit SharePoint Connector Configured**
   - Already set up via Replit integration
   - OAuth flow completed
   - Token refresh working

---

#### Configuration Steps

**Step 1: Access SharePoint Settings**

![SharePoint Settings](screenshots/admin-04-settings.png)

```
Navigation:
1. Log into SCDP as Administrator
2. Click "Admin" in menu
3. Select "SharePoint"
4. View configuration page
```

**Step 2: Configure Development Environment**

![Dev Config](screenshots/admin-04-dev-config.png)

```
Development Configuration:
1. Site URL: https://synozur.sharepoint.com/sites/RevOps/
   - Full URL including trailing slash
   - Supports:
     - Root sites: https://company.sharepoint.com/
     - Sites collection: https://company.sharepoint.com/sites/SiteName/
     - Multi-level: https://company.sharepoint.com/sites/Parent/Child/

2. Library Name: SCDP-Dev
   - Exact name of document library
   - Case-sensitive
   - No spaces unless library has spaces

3. Click "Save Development Settings"
4. System validates:
   - Site exists and is accessible
   - Library exists in site
   - Permissions are adequate
5. Success message displayed
```

**Step 3: Configure Production Environment**

![Prod Config](screenshots/admin-04-prod-config.png)

```
Production Configuration:
1. Site URL: https://synozur.sharepoint.com/sites/RevOps/
   - Usually same site as dev
   - Can be different if needed

2. Library Name: SCDP-Prod
   - Separate library from dev
   - Isolates production documents

3. Click "Save Production Settings"
4. System validates
5. Success message
```

**Step 4: Test Connection**

![Test Connection](screenshots/admin-04-test.png)

```
Test Workflow:
1. Click "Test Connection" button
2. System performs:
   ✅ Site reachability test
   ✅ Library existence check
   ✅ Permission validation
   ✅ Folder creation test
   ✅ File upload test
   ✅ File download test
   ✅ File deletion test
3. View results:
   - ✅ All green: Ready to use
   - ❌ Any red: Fix issue before proceeding
4. Review detailed error messages
```

---

### 5.3 Folder Structure

**Auto-Created Folders:**

![Folder Structure](screenshots/admin-04-folders.png)

```
SharePoint Library Root (SCDP-Dev or SCDP-Prod)
├── receipts/
│   ├── receipt-20250101-001.jpg
│   ├── receipt-20250102-005.png
│   └── receipt-20250115-023.pdf
├── invoices/
│   ├── INV-001-ClientA-ProjectX.pdf
│   ├── INV-002-ClientB-ProjectY.pdf
│   └── batch-2025-01-invoice.pdf
├── sows/
│   ├── ClientA-MSA-2025.pdf
│   ├── ClientB-SOW-ProjectY.pdf
│   └── ClientC-ChangeOrder-001.pdf
└── changeorders/
    ├── ClientA-CO-001.pdf
    ├── ClientA-CO-002.pdf
    └── ClientB-CO-001.pdf
```

**Folder Creation:**
- Automatic on first file upload
- Idempotent (won't duplicate)
- Uses 404 check before creation
- No "rename" conflicts under concurrency

**Benefits:**
- Organized by document type
- Easy to find documents
- Supports bulk operations
- Clear audit trail

---

### 5.4 URL Handling

**Supported SharePoint Site URL Formats:**

![URL Formats](screenshots/admin-04-url-formats.png)

```
Format 1: Root Site Collection
URL: https://company.sharepoint.com/
Graph API Path: /sites/company.sharepoint.com

Format 2: Single-Level Site
URL: https://company.sharepoint.com/sites/RevOps/
Graph API Path: /sites/company.sharepoint.com:/sites/RevOps

Format 3: Multi-Level Site
URL: https://company.sharepoint.com/sites/RevOps/Finance/
Graph API Path: /sites/company.sharepoint.com:/sites/RevOps/Finance
```

**System automatically:**
- Parses URL using URL class
- Extracts hostname and path
- Builds correct Graph API endpoint
- Handles trailing slashes
- Validates format

**Common Mistakes:**

```
❌ Wrong:
- http://company.sharepoint.com/ (not HTTPS)
- company.sharepoint.com (missing protocol)
- /sites/RevOps (missing domain)
- https://company.sharepoint.com/sites/RevOps (missing trailing slash)

✅ Correct:
- https://company.sharepoint.com/
- https://company.sharepoint.com/sites/RevOps/
- https://company.sharepoint.com/sites/RevOps/Finance/
```

---

### 5.5 Performance Optimization

**Drive ID Caching:**

![Drive Cache](screenshots/admin-04-cache.png)

```
Without Caching (Slow):
Every file operation:
1. GET /sites/{site}/drives → Get all drives
2. Filter drives by library name
3. Use drive ID for file operation
4. Repeat for EVERY file (n × API calls)

With Caching (Fast):
First operation:
1. GET /sites/{site}/drives → Get all drives
2. Filter drives by library name
3. Cache drive ID in memory
4. Use drive ID

Subsequent operations:
1. Use cached drive ID (no API call)
2. Direct file operation
3. Result: 1 API call vs n API calls
```

**Cache Invalidation:**

```
Cache Key: "siteUrl:libraryName"
Example: "https://company.sharepoint.com/sites/RevOps/:SCDP-Prod"

Cache cleared when:
- Application restarts
- Configuration changes
- Manual cache clear (if needed)

Cache persists:
- Across multiple file operations
- For entire application session
- Until restart or config change
```

**Performance Improvement:**

```
Scenario: Upload 50 receipts

Without Cache:
- 50 × (1 drives query + 1 upload) = 100 API calls
- Time: ~30 seconds

With Cache:
- 1 drives query + 50 uploads = 51 API calls
- Time: ~8 seconds
- Improvement: 73% faster
```

---

### 5.6 Troubleshooting SharePoint Issues

#### Common Errors

**Error: Site Not Found**

```
Message: "Invalid SharePoint site URL"
Cause: Site doesn't exist or inaccessible
Fix:
1. Verify URL is correct
2. Open URL in browser - does it load?
3. Check you have permissions
4. Ensure HTTPS protocol
5. Include trailing slash
```

**Error: Library Not Found**

```
Message: "Document library 'LibraryName' not found. Available libraries: Library1, Library2"
Cause: Library name doesn't match
Fix:
1. Check library name spelling
2. Verify case (case-sensitive)
3. Look at "Available libraries" in error
4. Use exact name from SharePoint
```

**Error: Permission Denied**

```
Message: "Access denied to SharePoint site"
Cause: Insufficient permissions
Fix:
1. Contact SharePoint administrator
2. Request these permissions:
   - Sites.Read.All
   - Sites.ReadWrite.All
   - Files.ReadWrite.All
3. Ensure admin consent granted
4. Retest connection
```

**Error: Token Expired**

```
Message: "Authentication failed"
Cause: OAuth token expired
Fix:
1. Refresh browser
2. Log out and back in
3. Replit connector auto-refreshes
4. If persists, reconfigure connector
```

**Error: Folder Creation Failed**

```
Message: "Could not create folder"
Cause: Permissions or conflict
Fix:
1. Verify write permissions
2. Check if folder already exists (manual check)
3. Try manual creation in SharePoint
4. Verify library isn't read-only
```

---

## 6. Vocabulary Customization

### 6.1 Understanding the Vocabulary System

**Purpose:**

SCDP uses hierarchical terminology to organize project work:

```
Epic (Top Level)
├── Stage (Middle Level)
    └── Activity (Detail Level)

Workstream (Cross-cutting)
Milestone (Gates/Payments)
```

**Problem:** Different clients use different terms for the same concepts.

**Solution:** Customizable vocabulary at three levels.

---

### 6.2 Vocabulary Catalog Management

**System Terms:**

![Vocabulary Catalog](screenshots/admin-05-vocab-catalog.png)

**Creating Custom Terms:**

```
Example: Adding "Sprint" as a Stage alternative

1. Navigate to System Settings → Vocabulary Catalog
2. Click "Add Term"
3. Enter:
   Term Type: stage
   Term Value: Sprint
   Description: Agile sprint (2-week iteration)
   Sort Order: 5
   Is Active: ✅
4. Click "Save"

Result: "Sprint" now available as Stage option
```

**Pre-Loaded Terms:**

```
Epic Alternatives:
- Epic (default)
- Program
- Release
- Initiative
- Theme
- Phase
- Module

Stage Alternatives:
- Stage (default)
- Phase
- Sprint
- Iteration
- Cycle
- Stream
- Step

Activity Alternatives:
- Activity (default)
- Task
- Work Item
- Story
- Deliverable
- Ticket
- Job

Workstream Alternatives:
- Workstream (default)
- Track
- Stream
- Discipline
- Capability
- Domain

Milestone Alternatives:
- Milestone (default)
- Gate
- Checkpoint
- Review
- Phase Gate
- Deliverable
```

---

### 6.3 Organization-Level Defaults

**Setting Organization Vocabulary:**

![Organization Vocab](screenshots/admin-05-vocab-org.png)

```
Scenario: Agile organization wants Agile terminology by default

Configuration:
1. Navigate to System Settings → Organization Vocabulary
2. Select defaults:
   Epic: Theme
   Stage: Sprint
   Activity: Story
   Workstream: Discipline
   Milestone: Review
3. Click "Save Organization Defaults"

Result:
- All new clients use these terms by default
- All new projects use these terms
- All new estimates default to these
```

**When to Set:**
- Initial system setup
- Organization-wide methodology change
- Rebranding/terminology shift

**Impact:**
- Affects all future records
- Doesn't change existing data
- Clients/projects can still override

---

### 6.4 Client-Specific Overrides

**Why Override for Clients:**

```
Scenario 1: Client uses Waterfall
Organization Default: Theme, Sprint, Story (Agile)
Client: Traditional Corp
Override: Phase, Deliverable, Task (Waterfall)

Scenario 2: Client uses SAFe
Organization Default: Epic, Stage, Activity
Client: Enterprise Agile Shop
Override: PI, Iteration, Feature (SAFe)
```

**Setting Client Vocabulary:**

![Client Vocab](screenshots/admin-05-vocab-client.png)

```
Process:
1. Open client: Traditional Corp
2. Navigate to Vocabulary tab
3. Select overrides:
   Epic: Phase
   Stage: Deliverable
   Activity: Task
   (Leave Workstream and Milestone as org defaults)
4. Click "Save"

Result:
- All projects for this client use these terms
- All estimates for this client use these terms
- Only this client affected
```

---

### 6.5 Project-Specific Overrides

**Rare Use Cases:**

```
Example: Client normally uses Agile, but one project is Waterfall

Client Default: Theme, Sprint, Story
Project: Legacy System Migration (Waterfall)
Project Override: Phase, Deliverable, Task

Configuration:
1. Open project: Legacy System Migration
2. Navigate to Vocabulary tab
3. Override:
   Epic: Phase
   Stage: Deliverable
   Activity: Task
4. Save

Result: Only this project uses Waterfall terms
```

**When to Use:**
- Special project methodology
- Client pilot of new approach
- Temporary exception
- Compliance requirement

**When Not to Use:**
- Most projects (use client-level)
- Consistent methodology
- Standard engagements

---

### 6.6 Vocabulary Best Practices

**Do:**
- ✅ Set organization defaults that match your primary methodology
- ✅ Use client-level overrides for clients with different terminology
- ✅ Document why specific vocabulary is used
- ✅ Train users on vocabulary selection
- ✅ Be consistent within an organization level

**Don't:**
- ❌ Change vocabulary frequently (confuses users)
- ❌ Use project-level overrides excessively
- ❌ Create too many custom terms (keep it simple)
- ❌ Mix methodologies without reason
- ❌ Change vocabulary on active projects (confusing)

**Communication:**
- Explain vocabulary to new team members
- Note client preferences in client record
- Include vocabulary guide in proposals
- Align internal and external terminology

---

## 7. System Settings

### 7.1 General Configuration

![System Settings](screenshots/admin-06-settings.png)

**Configurable Settings:**

#### Default Capacity

```
Setting: Default hours per week
Default: 40
Range: 1-168 (hours in a week)
Use: Resource capacity planning

Configuration:
1. System Settings → General
2. Default Capacity: 40
3. Save

Impact:
- New users get this capacity
- Used in utilization calculations
- Can override per person
```

#### Estimate Multipliers

```
Size Multipliers:
- Small: 1.00 (baseline)
- Medium: 1.05 (5% increase)
- Large: 1.10 (10% increase)

Complexity Multipliers:
- Small: 1.00 (baseline)
- Medium: 1.05 (5% increase)
- Large: 1.10 (10% increase)

Confidence Multipliers:
- High: 1.00 (baseline)
- Medium: 1.10 (10% buffer)
- Low: 1.20 (20% buffer)

Configuration:
1. System Settings → Estimation
2. Adjust multipliers
3. Save

Impact:
- Affects new estimates only
- Existing estimates unchanged
- Can override per estimate
```

#### Currency Settings

```
Setting: Default currency
Default: USD
Options: USD, EUR, GBP, CAD, AUD, etc.
Use: Invoicing and financial displays

Configuration:
1. System Settings → Financial
2. Default Currency: USD
3. Currency Symbol: $
4. Symbol Position: Before amount
5. Save

Impact:
- New clients default to this
- Invoice PDF formatting
- Financial reports
```

#### Date Formats

```
Regional Preferences:
- US: MM/DD/YYYY
- Europe: DD/MM/YYYY
- ISO: YYYY-MM-DD

Configuration:
1. System Settings → Regional
2. Date Format: MM/DD/YYYY
3. Time Format: 12-hour / 24-hour
4. First Day of Week: Sunday / Monday
5. Save

Impact:
- Date pickers
- Reports
- Exports
```

---

### 7.2 Email Notification Templates

**Configurable Email Types:**

![Email Templates](screenshots/admin-06-email-templates.png)

```
Available Templates:
├── Expense Report Submitted
├── Expense Report Approved
├── Expense Report Rejected
├── Expense Reimbursed
├── Invoice Created
├── Payment Received
├── Time Entry Reminder
└── Welcome Email
```

**Customizing Templates:**

```
Example: Expense Approval Email

1. System Settings → Email Templates
2. Select: "Expense Report Approved"
3. Edit template:
   
   Subject: ✅ Expense Report Approved - {{reportName}}
   
   Body:
   Hi {{employeeName}},
   
   Good news! Your expense report "{{reportName}}" has been approved.
   
   Total Amount: {{totalAmount}}
   Approval Date: {{approvalDate}}
   Approved By: {{approverName}}
   
   Your reimbursement will be processed in the next batch.
   Expected payment date: {{expectedPaymentDate}}
   
   Thank you,
   {{companyName}} Finance Team
   
4. Save template

Variables Available:
- {{employeeName}}
- {{reportName}}
- {{totalAmount}}
- {{approvalDate}}
- {{approverName}}
- {{expectedPaymentDate}}
- {{companyName}}
```

**HTML Formatting:**

```
Templates support HTML:
- <strong>Bold text</strong>
- <em>Italic text</em>
- <ul><li>Lists</li></ul>
- <a href="">Links</a>
- <table>Tables</table>

Example:
<p>Your expense report has been <strong>approved</strong>!</p>
<p>Details:</p>
<ul>
  <li>Amount: <strong>{{totalAmount}}</strong></li>
  <li>Approved by: {{approverName}}</li>
</ul>
```

---

### 7.3 Invoice Configuration

**Invoice Numbering:**

![Invoice Config](screenshots/admin-06-invoice.png)

```
Configuration:
1. System Settings → Invoicing
2. Configure:
   
   Prefix: INV-
   Format: {prefix}{year}-{number}
   Starting Number: 001
   Padding: 3 digits
   
3. Examples:
   - INV-2025-001
   - INV-2025-002
   - INV-2025-100

4. Milestone Invoice Prefix: INV-M-
   - INV-M-2025-001
   - INV-M-2025-002
```

**Invoice PDF Settings:**

```
Company Information:
- Company Name: Synozur Consulting
- Address Line 1: 123 Main Street
- Address Line 2: Suite 400
- City, State ZIP: San Francisco, CA 94105
- Phone: (555) 123-4567
- Email: billing@synozur.com
- Website: www.synozur.com

Logo:
- Upload company logo (PNG/JPG)
- Max size: 500KB
- Recommended: 300x100px
- Appears on invoice header

Payment Terms:
- Net 30 (default)
- Net 15
- Net 60
- Custom text

Payment Instructions:
- Bank Name: First National Bank
- Account Number: ****1234
- Routing Number: 123456789
- Wire Instructions: [details]
- Check Payable To: Synozur Consulting
```

---

### 7.4 Advanced Settings

**Session Timeout:**

```
Setting: Auto-logout after inactivity
Default: 60 minutes
Range: 15-480 minutes
Use: Security compliance

Configuration:
1. System Settings → Security
2. Session Timeout: 60 minutes
3. Save

Impact:
- Users auto-logged out
- Work saved before logout
- Session recovered on return
```

**Audit Logging:**

```
Setting: Enable detailed audit logs
Default: Enabled
Use: Compliance and troubleshooting

Logged Events:
- User login/logout
- Record creation/edit/delete
- Permission changes
- Rate changes
- Invoice generation
- Expense approvals

Configuration:
1. System Settings → Audit
2. Enable Audit Logging: ✅
3. Retention Period: 365 days
4. Save

Access Logs:
1. System Settings → Audit Logs
2. Filter by:
   - User
   - Action type
   - Date range
   - Entity type
3. Export to CSV
```

**Data Retention:**

```
Configuration:
1. System Settings → Data Retention
2. Configure:
   
   Completed Projects: Archive after 2 years
   Rejected Estimates: Delete after 90 days
   User Activity Logs: Retain 1 year
   Financial Records: Retain 7 years
   
3. Save
4. System auto-archives/deletes based on policy
```

---

## 8. Maintenance & Monitoring

### 8.1 Regular Maintenance Schedule

![Maintenance Calendar](screenshots/admin-07-maintenance.png)

#### Daily Tasks (5 minutes)

```
Morning Checklist:
□ Check system status dashboard
□ Review overnight errors (if any)
□ Verify backup completed
□ Check SharePoint sync status
□ Monitor email queue
```

#### Weekly Tasks (30 minutes)

```
Monday Morning:
□ Review unbilled items report
  - Identify stuck time/expenses
  - Follow up with PMs
  - Clear backlog

□ Check user activity
  - Who hasn't logged time?
  - Inactive accounts
  - Failed login attempts

□ Review expense approval queue
  - Pending reports
  - Aging reports (>5 days)
  - Notify approvers

□ Monitor system performance
  - Response times
  - Error rates
  - Storage usage

Friday Afternoon:
□ Review week's new users
□ Check for rate changes needed
□ Verify integrations healthy
□ Plan next week's tasks
```

#### Monthly Tasks (2-3 hours)

```
First Monday of Month:
□ Generate monthly reports:
  - Revenue by client
  - Utilization by person
  - Project profitability
  - Expense trends

□ Review data quality:
  - Duplicate clients
  - Orphaned estimates
  - Unbilled aged items
  - Missing SOWs

□ Clean up system:
  - Archive completed projects
  - Delete abandoned drafts
  - Review inactive users
  - Clear old notifications

□ Review security:
  - Failed login attempts
  - Permission changes
  - New admin accounts
  - Unusual activity

□ Test email notifications:
  - Send test expense approval
  - Verify delivery
  - Check formatting
```

#### Quarterly Tasks (1 day)

```
Q1, Q2, Q3, Q4:
□ User access audit
  - Review all user accounts
  - Verify roles are correct
  - Remove unnecessary access
  - Document findings

□ Rate review
  - Compare to market
  - Analyze profitability
  - Prepare recommendations
  - Plan updates

□ Vocabulary review
  - Are current terms still relevant?
  - Add new terms if needed
  - Deprecate unused terms

□ Integration health check
  - SharePoint connection
  - SSO authentication
  - Email delivery
  - API performance

□ Performance review
  - Query optimization
  - Storage optimization
  - Slow page analysis
  - User feedback

□ Training needs assessment
  - Survey users
  - Identify knowledge gaps
  - Plan training sessions
  - Update documentation
```

#### Annual Tasks (1 week)

```
Q4 Planning:
□ Full system review
  - What worked well?
  - What needs improvement?
  - Feature requests
  - Pain points

□ Rate structure update
  - Market analysis
  - Profitability review
  - New rates for fiscal year
  - Communication plan

□ User base review
  - Offboard departed employees
  - Plan new hires
  - Role changes
  - Team restructuring

□ Policy updates
  - Expense policies
  - Time tracking rules
  - Approval workflows
  - Compliance requirements

□ Documentation update
  - User guide refresh
  - Admin guide update
  - Training materials
  - FAQ updates

□ Disaster recovery test
  - Test backup restore
  - Verify data integrity
  - Document recovery process
  - Update runbooks
```

---

### 8.2 Monitoring Key Metrics

**System Health Dashboard:**

![Health Dashboard](screenshots/admin-07-health.png)

```
Key Metrics to Monitor:

Performance:
├─ Average Page Load Time: <2 seconds ✅
├─ API Response Time: <500ms ✅
├─ Database Query Time: <100ms ✅
└─ Error Rate: <0.1% ✅

Usage:
├─ Active Users (Last 7 Days): 45 of 50
├─ Time Entries Created: 230 this week
├─ Expense Reports Submitted: 12
└─ Invoices Generated: 8

Storage:
├─ SharePoint Used: 2.3 GB of 1 TB
├─ Database Size: 156 MB
├─ Receipt Images: 1,234 files
└─ Invoice PDFs: 89 files

Integration:
├─ SharePoint Status: ✅ Healthy
├─ SSO Status: ✅ Connected
├─ Email Delivery: ✅ 100% success
└─ Last Sync: 2 minutes ago
```

**Alert Thresholds:**

```
Set up alerts for:

⚠️ Warning Level:
- Page load time >3 seconds
- API response time >1 second
- Error rate >0.5%
- Failed login attempts >10/hour
- Storage >80% capacity

🚨 Critical Level:
- Page load time >5 seconds
- API response time >2 seconds
- Error rate >2%
- Failed login attempts >50/hour
- Storage >95% capacity
- SharePoint connection lost
- SSO authentication failing
```

---

### 8.3 Scheduled Jobs Monitoring

**Overview:**

SCDP runs automated background jobs to handle routine tasks. Administrators can monitor these jobs and trigger them manually when needed.

**Accessing Scheduled Jobs:**

```
Navigation:
1. Log in as Administrator
2. Click "Admin" in the menu
3. Select "Scheduled Jobs"
4. View the scheduled jobs dashboard
```

**Job Types:**

| Job Type | Schedule | Description |
|----------|----------|-------------|
| **Expense Reminders** | Weekly (configurable) | Emails users with unsubmitted expenses |
| **Time Reminders** | Weekly (configurable) | Emails users who haven't logged time |
| **Planner Sync** | Every 30 minutes | Syncs project assignments to Microsoft Planner |

**Dashboard Overview:**

The Scheduled Jobs page shows:
- **Overview Tab:** Summary cards for each job type showing:
  - Total runs
  - Successful runs
  - Failed runs
  - Last run time and status
  - "Run Now" button for manual trigger

- **History Tab:** Detailed run history with:
  - Job type filter
  - Run date/time
  - Status (success, failed, running)
  - Trigger type (scheduled vs manual)
  - Result summary
  - Error messages (if any)

**Planner Sync Details:**

When enabled on a project, the automatic Planner sync:
- Creates Planner tasks for each project assignment
- Organizes tasks into buckets by project stage
- Maps Constellation users to Azure AD accounts
- Syncs status (open → 0%, in_progress → 50%, completed → 100%)
- Syncs planned start and end dates
- Includes task notes with Constellation link and hours

**Job Run History Fields:**

For Planner Sync jobs, the result summary includes:
```
Projects Synced: Number of projects successfully synced
Projects Skipped: Projects with sync disabled or no allocations
Projects Failed: Projects that encountered errors
Tasks Created: New Planner tasks created
Tasks Updated: Existing Planner tasks updated
```

**Manual Trigger:**

Use the "Run Now" button to:
- Force immediate execution of any job
- Test job functionality after configuration changes
- Catch up after system downtime

Manual triggers are logged with the administrator's user ID for audit purposes.

**Troubleshooting:**

```
If Planner sync fails:
→ Check Microsoft Graph connection status
→ Verify user Azure AD mappings are configured
→ Ensure project has Planner connection with sync enabled
→ Review error message in run history

If reminders not sending:
→ Check tenant reminder settings
→ Verify email configuration
→ Review user notification preferences
```

---

### 8.4 Data Backup

**Automated Backups:**

![Backup Status](screenshots/admin-07-backup.png)

```
Backup Schedule:

Database:
├─ Full Backup: Daily at 2:00 AM
├─ Incremental: Every 4 hours
├─ Retention: 30 days rolling
└─ Location: Offsite storage

SharePoint:
├─ SharePoint has built-in versioning
├─ Retention: 90 days
├─ Can restore deleted items
└─ Admin can restore libraries

Configuration:
├─ Backup: Weekly (Sunday 3:00 AM)
├─ Includes: System settings, vocabulary, rates
├─ Retention: 90 days
└─ Location: Offsite storage
```

**Backup Verification:**

```
Monthly Verification Process:
1. Download recent backup
2. Restore to test environment
3. Verify data integrity:
   - User accounts load
   - Projects accessible
   - Time entries present
   - Invoices viewable
4. Document test results
5. Note any issues
6. Fix backup process if needed
```

---

### 8.4 Performance Optimization

**Database Maintenance:**

```
Weekly Tasks:
□ Analyze slow queries
□ Review indexes
□ Optimize table statistics
□ Clear old sessions

Monthly Tasks:
□ Vacuum database (if PostgreSQL)
□ Reindex tables
□ Archive old audit logs
□ Analyze growth trends
```

**Caching Strategy:**

```
Current Caching:
├─ SharePoint Drive IDs: In-memory
├─ User Sessions: Redis/Memory
├─ Static Assets: Browser cache (7 days)
└─ API Responses: None (real-time data)

Optimization Opportunities:
├─ Cache rate lookups (1 hour)
├─ Cache user permissions (15 minutes)
├─ Cache project lists (5 minutes)
└─ Implement CDN for assets
```

**Storage Optimization:**

```
SharePoint Cleanup:
1. Review old receipts (>2 years)
2. Archive to cold storage if needed
3. Delete test files
4. Compress large PDFs

Database Cleanup:
1. Archive old audit logs (>1 year)
2. Soft delete old estimates (>2 years)
3. Compress old time entries
4. Review storage growth rate
```

---

## 9. Security & Compliance

### 9.1 Access Control

**Authentication:**

![Authentication Flow](screenshots/admin-08-auth.png)

```
Production (SSO):
├─ Microsoft Azure AD
├─ OAuth 2.0 flow
├─ MFA enforced
├─ Session timeout: 60 minutes
└─ Token refresh automatic

Development (Local):
├─ Email/password
├─ BCrypt password hashing
├─ No MFA (dev only)
└─ Session timeout: 120 minutes
```

**Authorization:**

```
Role Hierarchy:
Administrator > Executive > Billing Admin > PM > Employee

Permission Enforcement:
├─ Server-side validation (primary)
├─ Client-side UI hiding (UX)
├─ API endpoint protection
└─ Database row-level security (future)

Example:
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}
```

---

### 9.2 Data Privacy

**Personal Information Handling:**

```
PII Stored:
├─ User: Name, email, title
├─ Client: Contact name, address
├─ Expense: Descriptions may contain PII
└─ Time: Descriptions may contain PII

Protection Measures:
├─ HTTPS encryption in transit
├─ Database encryption at rest
├─ Access logging
├─ Role-based access
└─ No public exposure

GDPR Compliance:
├─ Right to access: Export user data
├─ Right to erasure: Deactivate (don't delete)
├─ Right to portability: CSV/Excel export
├─ Privacy policy: Link in footer
└─ Data processing agreement: With clients
```

---

### 9.3 Audit Trail

**What's Logged:**

![Audit Log](screenshots/admin-08-audit.png)

```
User Actions:
├─ Login/logout (timestamp, IP address)
├─ Failed login attempts
├─ Password changes
├─ Permission changes
├─ Role changes

Data Changes:
├─ Record creation (who, when, what)
├─ Record updates (who, when, what, old/new values)
├─ Record deletion (who, when, what)
├─ Rate changes (who, when, old/new rates)

Financial Actions:
├─ Invoice generation (who, when, amount)
├─ Expense approval/rejection (who, when)
├─ Reimbursement processing (who, when, amount)
├─ Rate override creation (who, when, reason)

System Events:
├─ Configuration changes
├─ Integration status changes
├─ Backup completion/failure
├─ Email delivery status
```

**Accessing Audit Logs:**

```
Navigation:
1. System Settings → Audit Logs
2. Filter by:
   - Date range
   - User
   - Action type (login, create, update, delete)
   - Entity type (user, project, invoice, etc.)
3. Export to CSV for analysis
4. Review for:
   - Unusual activity
   - Security incidents
   - Compliance audits
   - Troubleshooting
```

---

### 9.4 Compliance

**Financial Regulations:**

```
SOX Compliance (if applicable):
├─ Audit trail for all financial transactions
├─ Separation of duties (no single person can approve and pay)
├─ Rate change approvals documented
├─ Invoice generation tracked
└─ Backup and disaster recovery tested

Controls:
├─ Billing admin can create invoices
├─ Different person processes payments (external)
├─ Executives can review but not modify invoices
├─ All changes logged
└─ Annual review of controls
```

**Time Tracking Regulations:**

```
Labor Law Compliance:
├─ Accurate time tracking
├─ Overtime calculations (if hourly employees)
├─ Time entry cannot be altered after invoicing
├─ Audit trail of changes
└─ Export for payroll/legal review

Best Practices:
├─ Daily time tracking encouraged
├─ Weekly review required
├─ Manager approval for corrections
├─ Clear policy on rounding
└─ Training on accurate tracking
```

**Document Retention:**

```
Retention Periods:
├─ Financial records: 7 years
├─ Invoices: 7 years
├─ Expense receipts: 7 years
├─ Contracts (SOWs): Indefinite
├─ Time entries: 7 years
├─ Audit logs: 7 years
├─ User records: Indefinite (deactivated, not deleted)

Implementation:
├─ Archive old records (don't delete)
├─ Export to cold storage
├─ Maintain access for audits
└─ Document retention policy
```

---

## 10. Troubleshooting

### 10.1 Common Issues and Solutions

#### Users Cannot Log In

**Symptom:**
- User gets error on login page
- Redirected back to login after entering credentials
- "Invalid credentials" message

**Diagnosis:**

```
Checklist:
1. □ Verify user account exists
   - Search in Users page
   - Check email matches SSO email

2. □ Check "Can Login" flag
   - User detail page
   - Must be enabled

3. □ Verify "Is Active" status
   - Deactivated users can't log in

4. □ Check SSO status
   - Can user log into Microsoft 365?
   - MFA working?

5. □ Browser issues
   - Clear cache/cookies
   - Try incognito mode
   - Try different browser

6. □ Check error logs
   - System Settings → Logs
   - Look for authentication errors
```

**Solutions:**

```
If account doesn't exist:
→ Create user account

If "Can Login" disabled:
→ Edit user, enable "Can Login"

If "Is Active" false:
→ Edit user, set "Is Active" to true

If SSO issue:
→ Contact Microsoft 365 admin
→ Reset MFA
→ Reset password

If browser issue:
→ Clear cache: Ctrl+Shift+Delete
→ Try Chrome/Edge/Firefox
→ Disable extensions
```

---

#### Time Entries Not Saving

**Symptom:**
- Click Save, nothing happens
- Error message when saving
- Entry disappears after refresh

**Diagnosis:**

```
Checklist:
1. □ Verify project assignment
   - Resource Management
   - Is user allocated to this project?

2. □ Check if time already invoiced
   - Can't edit billed time
   - Look at time entry detail

3. □ Validate required fields
   - Project: selected?
   - Date: valid?
   - Hours: positive number?
   - Description: not empty?

4. □ Check date restrictions
   - Some orgs lock old periods
   - Verify date isn't locked

5. □ Browser console errors
   - F12 → Console
   - Look for JavaScript errors

6. □ Check server logs
   - System Settings → Logs
   - Look for 500 errors
```

**Solutions:**

```
If not assigned to project:
→ PM adds allocation in Resource Management

If already invoiced:
→ Contact billing admin
→ Can adjust invoice if needed

If required field missing:
→ Fill in all fields
→ Ensure description has content

If date locked:
→ Contact admin to unlock
→ Or enter time for current period

If browser error:
→ Refresh page (Ctrl+F5)
→ Try different browser
→ Clear cache

If server error:
→ Check error logs
→ Contact technical support
→ Provide error details
```

---

#### SharePoint Upload Failures

**Symptom:**
- Documents not appearing in SharePoint
- Error uploading receipt
- "SharePoint connection failed" message

**Diagnosis:**

```
Checklist:
1. □ Test SharePoint connection
   - Admin → SharePoint
   - Click "Test Connection"
   - Review results

2. □ Verify configuration
   - Site URL correct?
   - Library name matches?
   - Environment (dev vs prod) correct?

3. □ Check permissions
   - Can you manually access SharePoint?
   - Can you manually upload to library?

4. □ Check file size
   - Max size: 10MB
   - Larger files need compression

5. □ Check file type
   - Supported: PDF, JPG, PNG, DOCX
   - Blocked: EXE, ZIP, etc.

6. □ Review error logs
   - System Settings → Logs
   - Look for SharePoint errors
```

**Solutions:**

```
If connection test fails:
→ Verify SharePoint URL
→ Check library name spelling
→ Test permissions manually
→ Reconfigure if needed

If permissions denied:
→ Contact SharePoint admin
→ Request required permissions:
  - Sites.ReadWrite.All
  - Files.ReadWrite.All

If file too large:
→ Compress PDF/image
→ Use online compression tool
→ Split into multiple files

If unsupported file type:
→ Convert to PDF
→ Use supported format

If still failing:
→ Check SharePoint service health
→ Try again in 5 minutes
→ Contact technical support
```

---

#### Invoice Generation Errors

**Symptom:**
- PDF not generating
- Missing time entries in invoice
- Incorrect totals

**Diagnosis:**

```
Checklist:
1. □ Verify unbilled items exist
   - Review unbilled time
   - Check approved expenses

2. □ Check date range
   - Does it include the work?
   - Verify billing period

3. □ Validate project/client selection
   - Correct client selected?
   - Correct project selected?

4. □ Check rate configuration
   - Are rates set?
   - Any rate overrides?

5. □ Review for errors
   - Missing expense receipts?
   - Invalid time entries?

6. □ Check PDF generation service
   - System Settings → Status
   - Puppeteer/Chromium running?
```

**Solutions:**

```
If no unbilled items:
→ Expand date range
→ Check if already invoiced
→ Verify time entries exist

If missing items:
→ Check filters
→ Verify project assignment
→ Ensure expenses approved

If wrong totals:
→ Verify rates correct
→ Check for rate overrides
→ Recalculate manually

If PDF won't generate:
→ Retry in few minutes
→ Check server logs
→ Generate from batch detail
→ Contact support if persists
```

---

### 10.2 Error Log Analysis

**Accessing Logs:**

![Error Logs](screenshots/admin-09-logs.png)

```
Navigation:
System Settings → System Logs

Log Types:
├─ Application Logs (errors, warnings, info)
├─ Authentication Logs (login attempts)
├─ Integration Logs (SharePoint, SSO)
└─ API Logs (requests, responses)

Filters:
├─ Date range
├─ Log level (Error, Warning, Info)
├─ Source (Authentication, SharePoint, Database)
├─ User (if user-specific)
└─ Search text
```

**Common Error Patterns:**

```
Error: "Invalid token"
Source: Authentication
Meaning: Session expired or invalid
Action: User needs to re-login
Prevention: None (normal expiration)

Error: "Library not found"
Source: SharePoint
Meaning: Configuration mismatch
Action: Verify library name in settings
Prevention: Test connection after config

Error: "Duplicate key violation"
Source: Database
Meaning: Trying to create duplicate record
Action: Check for existing record
Prevention: Better duplicate detection

Error: "Rate not found"
Source: Billing
Meaning: Missing rate for user/role
Action: Set default rate for user
Prevention: Ensure all users have rates

Error: "Permission denied"
Source: Authorization
Meaning: User lacks required role
Action: Check user role assignment
Prevention: Proper onboarding process
```

---

### 10.3 Performance Issues

**Slow Page Loads:**

```
Diagnosis:
1. □ Check browser
   - Too many extensions?
   - Outdated browser?
   - Try incognito mode

2. □ Check network
   - Slow internet connection?
   - VPN causing lag?
   - Try different network

3. □ Check system load
   - Many users online?
   - Large data export running?
   - Backup in progress?

4. □ Check database
   - Slow queries?
   - Need indexes?
   - Table statistics outdated?

5. □ Check caching
   - Cache hit rate low?
   - SharePoint drive cache?
   - Browser cache enabled?
```

**Solutions:**

```
Browser optimization:
→ Use Chrome or Edge
→ Disable unnecessary extensions
→ Clear cache regularly
→ Update to latest version

Network optimization:
→ Use wired connection if possible
→ Disable VPN for internal apps
→ Check internet speed

System optimization:
→ Schedule large exports off-peak
→ Run backups overnight
→ Limit concurrent users if needed

Database optimization:
→ Analyze slow queries
→ Add indexes where needed
→ Vacuum/optimize tables
→ Archive old data

Caching optimization:
→ Increase cache duration
→ Implement Redis if needed
→ Enable CDN for static assets
```

---

## 11. Backup & Disaster Recovery

### 11.1 Backup Strategy

**What Gets Backed Up:**

![Backup Strategy](screenshots/admin-10-backup.png)

```
Database (Complete):
├─ All user accounts
├─ All projects and estimates
├─ All time entries
├─ All expenses and invoices
├─ All configuration
├─ All audit logs
└─ Frequency: Daily full, hourly incremental

SharePoint (Document Storage):
├─ Built-in versioning (90 days)
├─ Can restore deleted items
├─ Can restore entire library
├─ Admin can restore sites
└─ Frequency: Real-time versioning

Configuration (System Settings):
├─ Vocabulary catalog
├─ Rate structures
├─ Email templates
├─ System settings
└─ Frequency: Weekly
```

**Backup Locations:**

```
Primary Backup:
- Automated daily backups
- Retained for 30 days
- Offsite storage
- Encrypted at rest

Secondary Backup:
- Weekly full backups
- Retained for 90 days
- Different geographic location
- Encrypted at rest

Configuration Backup:
- Exported to JSON
- Stored in version control
- Can recreate settings
- Documented in runbook
```

---

### 11.2 Disaster Recovery Plan

**Recovery Time Objectives (RTO):**

```
Critical (4 hours):
├─ User authentication (SSO)
├─ Time tracking
├─ Expense submission
└─ Invoice viewing

Important (24 hours):
├─ Project creation
├─ Estimate building
├─ Resource allocation
└─ Reporting

Standard (72 hours):
├─ System configuration
├─ Advanced analytics
├─ Historical data access
└─ Integration setup
```

**Recovery Point Objectives (RPO):**

```
Acceptable Data Loss:
├─ Database: <1 hour (incremental backups)
├─ SharePoint: 0 (real-time versioning)
├─ Configuration: <7 days (weekly backup)
└─ User accounts: <24 hours (daily backup)
```

---

### 11.3 Disaster Scenarios

#### Scenario 1: Database Corruption

**Impact:** Complete data loss

**Recovery Process:**

```
Step 1: Assess damage (15 minutes)
□ Identify scope of corruption
□ Determine last known good backup
□ Notify stakeholders

Step 2: Stop application (5 minutes)
□ Put SCDP in maintenance mode
□ Display maintenance message to users
□ Prevent new data writes

Step 3: Restore database (30-60 minutes)
□ Download latest backup
□ Restore to clean database
□ Verify data integrity
□ Run consistency checks

Step 4: Verify data (30 minutes)
□ Check recent records exist
□ Verify financial data accurate
□ Test critical workflows
□ Confirm user accounts active

Step 5: Resume service (15 minutes)
□ Take app out of maintenance mode
□ Monitor for issues
□ Notify users of restoration
□ Document incident

Total Time: 2-3 hours
Data Loss: <1 hour (last incremental backup)
```

---

#### Scenario 2: SharePoint Access Lost

**Impact:** Cannot upload/download documents

**Recovery Process:**

```
Step 1: Diagnose issue (10 minutes)
□ Is SharePoint entirely down?
□ Is it a configuration issue?
□ Is it a permission issue?
□ Test connection from SCDP

Step 2: Temporary workaround (15 minutes)
□ Enable local file storage temporarily
□ Allow uploads to local server
□ Queue for SharePoint when restored
□ Notify users of limitation

Step 3: Fix SharePoint connection (varies)
If SharePoint is down:
→ Wait for Microsoft to restore
→ Monitor service health
→ Test connection periodically

If configuration issue:
→ Review SharePoint settings
→ Verify site URL and library
→ Re-authenticate if needed
→ Test connection

If permission issue:
→ Contact SharePoint admin
→ Request permissions restored
→ Verify app registration
→ Test connection

Step 4: Sync queued files (30 minutes)
□ Upload queued local files to SharePoint
□ Verify all files transferred
□ Update file references
□ Disable local storage

Step 5: Resume normal operation (10 minutes)
□ Monitor uploads
□ Notify users
□ Document resolution

Total Time: 1-4 hours (depends on SharePoint)
Data Loss: None (files queued locally)
```

---

#### Scenario 3: Complete System Failure

**Impact:** SCDP entirely inaccessible

**Recovery Process:**

```
Step 1: Activate DR site (30 minutes)
□ Spin up backup environment
□ Point DNS to DR site
□ Restore latest database backup
□ Configure SharePoint connection

Step 2: Verify functionality (60 minutes)
□ Test user authentication
□ Verify time tracking works
□ Test expense submission
□ Check invoice generation
□ Validate SharePoint access

Step 3: Communicate to users (15 minutes)
□ Email all users
□ Explain situation
□ Provide DR site URL if different
□ Set expectations for resolution

Step 4: Identify root cause (ongoing)
□ Review logs
□ Contact hosting provider
□ Determine if hardware, software, or network
□ Plan permanent fix

Step 5: Restore primary system (varies)
□ Fix root cause
□ Restore from backup if needed
□ Sync data from DR site
□ Test thoroughly

Step 6: Switch back to primary (30 minutes)
□ Update DNS back to primary
□ Monitor for issues
□ Keep DR site warm for 24 hours
□ Document incident

Total Time to DR: 2 hours
Total Time to Primary: 4-48 hours (depends on issue)
Data Loss: Minimal (DR site has recent data)
```

---

### 11.4 Testing DR Plan

**Quarterly DR Test:**

```
Test Schedule: Last Saturday of each quarter

Test Procedure:
1. □ Announce test to users (1 week prior)
   - SCDP will be unavailable 2 hours
   - Planned maintenance window

2. □ Execute failover (planned)
   - Take primary offline
   - Activate DR site
   - Restore backup to DR
   - Verify functionality

3. □ Test critical workflows
   - User login
   - Time entry creation
   - Expense submission
   - Invoice generation
   - SharePoint upload

4. □ Measure RTO/RPO
   - Time to restore: ____
   - Data loss (hours): ____
   - User impact: ____

5. □ Document results
   - What worked well
   - What needs improvement
   - Action items
   - Updated runbook

6. □ Restore primary
   - Bring primary back online
   - Switch DNS back
   - Notify users of completion
```

**Success Criteria:**

```
✅ DR site fully functional within 2 hours
✅ All critical workflows operational
✅ Data loss <1 hour
✅ Users can access and work
✅ SharePoint integration working
✅ Runbook followed successfully
✅ Team understands process
```

---

## 12. Best Practices

### 12.1 Security Best Practices

**Password Policy:**

```
Requirements:
├─ Minimum 12 characters
├─ Mix of uppercase, lowercase, numbers, symbols
├─ No common passwords
├─ No reuse of last 5 passwords
├─ Change every 90 days (recommended)
└─ MFA enforced (production)

Implementation:
- SSO handles password policy (Microsoft Azure AD)
- Development mode has basic validation
- Encourage use of password managers
```

**Access Reviews:**

```
Quarterly Review:
1. Export all user accounts
2. For each user:
   □ Still employed?
   □ Role still appropriate?
   □ Login still needed?
   □ Assignments still active?
3. Deactivate as needed
4. Document review
5. Report to management
```

**Principle of Least Privilege:**

```
Rules:
├─ Users get minimum role needed
├─ Temporary access is time-limited
├─ Admin role only for administrators
├─ PM role only for project managers
├─ Review permissions quarterly

Examples:
❌ Don't: Give everyone PM role "just in case"
✅ Do: Give employee role, promote when needed

❌ Don't: Make everyone admin for testing
✅ Do: Create test accounts with appropriate roles

❌ Don't: Leave contractors as full employees
✅ Do: Set Can Login=false when contract ends
```

---

### 12.2 Data Quality Best Practices

**Naming Conventions:**

```
Projects:
Format: CLIENT-YEAR-ProjectName
Examples:
✅ ACME-2025-CRM-Implementation
✅ GLOBEX-2024-Website-Redesign
❌ project1
❌ test
❌ new project

Estimates:
Format: CLIENT-EST-###-Description
Examples:
✅ ACME-EST-001-CRM-Implementation
✅ GLOBEX-EST-005-Mobile-App
❌ estimate
❌ draft

Expense Reports:
Format: YYYY-MM-Purpose
Examples:
✅ 2025-01-Client-Travel
✅ 2025-02-Office-Supplies
❌ expenses
❌ my expenses
```

**Regular Cleanup:**

```
Monthly Cleanup Tasks:
1. □ Archive completed projects (status=completed, >30 days)
2. □ Delete truly abandoned draft estimates (>90 days, no activity)
3. □ Review for duplicate clients (merge if found)
4. □ Clean up test data (if any)
5. □ Review orphaned estimates (client deleted but estimate remains)
```

**Data Validation:**

```
Prevent Issues:
├─ Required fields enforced
├─ Email format validation
├─ Date range validation
├─ Positive number validation
├─ Duplicate detection
└─ Referential integrity

Examples:
❌ Hours: -5 (negative)
✅ Hours: 5 (positive)

❌ Email: john.smith (invalid)
✅ Email: john.smith@company.com (valid)

❌ End Date before Start Date
✅ End Date after Start Date
```

---

### 12.3 Communication Best Practices

**User Training:**

```
Onboarding Checklist:
□ Day 1: Account creation
□ Day 1: Welcome email with login instructions
□ Day 2: 30-minute intro session
  - Platform overview
  - Role-specific features
  - Q&A
□ Week 1: Hands-on practice
  - Create time entry
  - Submit expense
  - View assignments
□ Week 2: Follow-up check-in
  - Any questions?
  - Any issues?
  - Additional training needed?
□ Month 1: Proficiency check
  - Review usage
  - Identify gaps
  - Provide additional training

Materials Provided:
├─ User Guide (PDF)
├─ Quick Reference Card
├─ Video tutorials (if available)
├─ FAQ document
└─ Contact info for help
```

**Change Communication:**

```
When Making Changes:
1. □ Announce in advance
   - Email all affected users
   - 1 week notice minimum
   - Explain what's changing and why

2. □ Provide training if needed
   - New features: Short video or doc
   - Process changes: Walk-through
   - UI changes: Screenshots with annotations

3. □ Set expectations
   - When will change happen?
   - Any downtime?
   - What do users need to do?

4. □ Follow up
   - Email confirmation when done
   - Offer support for questions
   - Monitor for issues

Example Announcement:
Subject: SCDP Update: New Expense Approval Workflow - March 1

Hi Team,

On March 1, we're updating how expense approvals work in SCDP:

What's Changing:
- Expense reports now go to your direct manager (not PM)
- You'll get email notifications at each step
- Reports show real-time approval status

Why:
- Faster approvals (managers already review timesheets)
- Better visibility for you
- Aligns with HR process

What You Need to Do:
- Nothing! Continue submitting expenses as normal
- Your manager will receive approval notifications

Questions? Reply to this email or see the updated guide:
[link to documentation]

Thanks,
SCDP Admin Team
```

---

### 12.4 Performance Best Practices

**Optimize Common Operations:**

```
Time Entry Creation:
✅ Do: Use project dropdown (cached)
✅ Do: Use date picker (formatted)
✅ Do: Enter description once
❌ Don't: Manually type project name
❌ Don't: Type date as text
❌ Don't: Leave description empty

Estimate Building:
✅ Do: Use Excel import for bulk lines
✅ Do: Use copy/paste for similar items
✅ Do: Use inline editing (auto-saves)
❌ Don't: Create 100 lines one-by-one
❌ Don't: Refresh page constantly
❌ Don't: Keep multiple drafts open

Invoice Generation:
✅ Do: Generate during off-peak hours
✅ Do: Select specific date range
✅ Do: Review unbilled items first
❌ Don't: Generate invoices at 9am Monday
❌ Don't: Use overly broad date ranges
❌ Don't: Generate without reviewing
```

**System Performance:**

```
Keep System Fast:
1. □ Archive old projects regularly
2. □ Clean up abandoned estimates
3. □ Compress large PDF files
4. □ Monitor database size
5. □ Review slow queries monthly
6. □ Optimize indexes as needed
7. □ Cache frequently-accessed data
8. □ Use CDN for static assets
```

---

### 12.5 Support Best Practices

**User Support Tiers:**

```
Tier 1: Self-Service
├─ User Guide (searchable PDF)
├─ FAQ document
├─ Video tutorials
├─ In-app help text
└─ Response: Immediate

Tier 2: Administrator Help
├─ Email: admin@company.com
├─ Teams: SCDP Support channel
├─ Office hours: M-F 9am-5pm
├─ Response: <4 hours
└─ Handles: Account issues, permissions, basic troubleshooting

Tier 3: Technical Support
├─ Email: itsupport@company.com
├─ For: System errors, bugs, performance issues
├─ Response: <24 hours
└─ Escalated: Critical issues to vendor

Tier 4: Vendor Support
├─ For: Platform bugs, feature requests
├─ Contact: [Vendor contact info]
├─ Response: Per SLA
└─ Requires: Detailed reproduction steps
```

**Effective Ticket Management:**

```
When Users Report Issues:
1. □ Acknowledge immediately
   - "Thanks, looking into it"
   - Set expectations for resolution time

2. □ Gather information
   - What were you trying to do?
   - What did you expect?
   - What actually happened?
   - Screenshot if possible
   - Browser and OS
   - When did it start?

3. □ Reproduce the issue
   - Try to replicate
   - Check if widespread or user-specific
   - Review error logs

4. □ Document resolution
   - What was the problem?
   - How was it fixed?
   - How to prevent in future?
   - Update FAQ if common issue

5. □ Follow up
   - Verify user can now complete task
   - Ask if anything else needed
   - Thank them for reporting
```

---

## Conclusion

This Administrator Guide provides comprehensive information for managing SCDP. As an administrator, your role is critical to:

- **Ensuring system availability** through proper configuration and maintenance
- **Protecting data integrity** through backups and security controls
- **Supporting users** through training and troubleshooting
- **Optimizing performance** through regular monitoring and tuning
- **Maintaining compliance** through audit logging and access controls

**Key Takeaways:**

1. **Prevention over reaction** - Regular maintenance prevents most issues
2. **Documentation is critical** - Document changes, decisions, and procedures
3. **Communication matters** - Keep users informed of changes and issues
4. **Security first** - Protect data and access at all times
5. **Plan for disasters** - Test your backup and recovery regularly
6. **Continuous improvement** - Learn from issues and optimize processes

**Resources:**

- **User Guide:** For end-user reference
- **API Documentation:** For integration development
- **Vendor Support:** For platform-level assistance
- **Community Forum:** For best practices and tips

**Getting Help:**

- **Technical Issues:** Contact IT support
- **Configuration Questions:** Email SCDP admin
- **Feature Requests:** Submit via [process]
- **Bugs:** Report via [process]

---

**Document Information:**

**Title:** SCDP Administrator Guide  
**Version:** 1.0  
**Date:** October 31, 2025  
**Author:** Synozur Consulting  
**Audience:** SCDP System Administrators

---

**© 2025 Synozur Consulting. All rights reserved.**
