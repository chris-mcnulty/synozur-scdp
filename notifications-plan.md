# SCDP Notifications System - Implementation Plan

## Overview

Comprehensive notifications system to keep users informed about time entries, expense approvals, invoice batches, budget alerts, and project deadlines through in-app and email channels.

---

## Database Schema

### `notifications` Table
```typescript
{
  id: serial primaryKey
  userId: integer (FK → users.id)
  type: varchar // Enum: 'time_entry_reminder', 'expense_approval_request', 'expense_status_update', 'invoice_batch_notice', 'budget_alert', 'project_deadline'
  title: varchar(255)
  message: text
  metadata: jsonb // Flexible storage for type-specific data
  relatedEntityType: varchar(50) // 'project', 'expense', 'invoice', 'budget', etc.
  relatedEntityId: varchar(50)
  actionUrl: varchar(500) // Deep link to relevant page
  priority: varchar(20) // 'low', 'normal', 'high', 'urgent'
  isRead: boolean (default false)
  readAt: timestamp (nullable)
  createdAt: timestamp (default now())
}
```

**Indexes:**
- `idx_notifications_user_id` on userId
- `idx_notifications_is_read` on isRead
- `idx_notifications_created_at` on createdAt
- Composite: `idx_notifications_user_unread` on (userId, isRead, createdAt)

---

### `notificationPreferences` Table
```typescript
{
  id: serial primaryKey
  userId: integer (FK → users.id, unique)
  
  // Global toggles
  emailEnabled: boolean (default true)
  inAppEnabled: boolean (default true)
  smsEnabled: boolean (default false) // Future feature
  
  // Per-type preferences (JSON for flexibility)
  typePreferences: jsonb
  // Structure: {
  //   "time_entry_reminder": { inApp: true, email: true, sms: false },
  //   "expense_approval_request": { inApp: true, email: true, sms: false },
  //   "expense_status_update": { inApp: true, email: false, sms: false },
  //   "invoice_batch_notice": { inApp: true, email: true, sms: false },
  //   "budget_alert": { inApp: true, email: true, sms: false },
  //   "project_deadline": { inApp: true, email: true, sms: false }
  // }
  
  // Digest settings
  digestMode: varchar(20) // 'immediate', 'daily', 'weekly', 'off'
  digestTime: varchar(5) // '09:00' for daily digest
  quietHoursStart: varchar(5) // '20:00'
  quietHoursEnd: varchar(5) // '08:00'
  
  createdAt: timestamp (default now())
  updatedAt: timestamp (default now())
}
```

**Indexes:**
- `idx_notification_preferences_user_id` on userId

---

### `systemNotificationSettings` Table
```typescript
{
  id: serial primaryKey
  notificationType: varchar(50) unique // Same as notification.type
  isEnabled: boolean (default false) // Admin must enable each type globally
  displayName: varchar(100) // "Time Entry Reminders"
  description: text // "Weekly reminders to log time for active projects"
  defaultInApp: boolean (default true)
  defaultEmail: boolean (default true)
  defaultSms: boolean (default false)
  category: varchar(50) // 'time_tracking', 'expenses', 'invoicing', 'budgets', 'projects'
  updatedAt: timestamp (default now())
}
```

**Initial seed data:**
```sql
INSERT INTO systemNotificationSettings (notificationType, displayName, description, category, isEnabled) VALUES
  ('time_entry_reminder', 'Time Entry Reminders', 'Weekly reminders to log time for active projects', 'time_tracking', false),
  ('expense_approval_request', 'Expense Approval Requests', 'Notifications when expenses require your approval ($500+)', 'expenses', false),
  ('expense_status_update', 'Expense Status Updates', 'Notifications when your expenses are approved or rejected', 'expenses', false),
  ('invoice_batch_notice', 'Invoice Batch Notices', 'Notifications about invoice batch status changes', 'invoicing', false),
  ('budget_alert', 'Budget Alerts', 'Notifications when projects approach or exceed budget thresholds', 'budgets', false),
  ('project_deadline', 'Project Deadline Reminders', 'Notifications about upcoming or overdue project deadlines', 'projects', false);
```

---

## Implementation Phases

### **Phase 1: Infrastructure (Week 1)**

#### SendGrid Integration
- **Setup:** Use Replit's SendGrid connector (`connector:ccfg_sendgrid_01K69QKAPBPJ4SWD8GQHGY03D5`)
- **Templates to create in SendGrid:**
  1. **Base Template** - Header with SCDP logo, footer with unsubscribe link
  2. **Time Entry Reminder** - Weekly reminder with project list
  3. **Expense Approval Request** - Details + Approve/Reject buttons
  4. **Expense Status Update** - Approved or rejected with notes
  5. **Invoice Batch Notice** - Status change details
  6. **Budget Alert** - Threshold warning with project details
  7. **Project Deadline** - Upcoming or overdue deadline notice

#### Database Migration
```bash
# Add new tables to shared/schema.ts
# Run: npm run db:push
```

#### Backend Service Layer
```typescript
// server/services/notificationService.ts

class NotificationService {
  // Core notification management
  async create(params: CreateNotificationParams): Promise<Notification>
  async send(notification: Notification): Promise<void>
  async markAsRead(notificationId: number): Promise<void>
  async markAllAsRead(userId: number): Promise<void>
  async deleteOld(daysToKeep: number = 90): Promise<number> // Auto-cleanup
  
  // Query methods
  async getUnreadCount(userId: number): Promise<number>
  async query(userId: number, filters: NotificationFilters): Promise<Notification[]>
  
  // Email delivery
  async sendEmail(userId: number, templateId: string, data: any): Promise<void>
  async shouldSendEmail(userId: number, type: string): Promise<boolean> // Check preferences + quiet hours
  
  // Type-specific creators
  async notifyTimeEntryReminder(userId: number, data: TimeEntryReminderData): Promise<void>
  async notifyExpenseApproval(expenseId: number, approverId: number): Promise<void>
  async notifyExpenseStatus(expenseId: number, status: 'approved' | 'rejected'): Promise<void>
  async notifyInvoiceBatch(batchId: string, status: string, userIds: number[]): Promise<void>
  async notifyBudgetAlert(projectId: number, threshold: number): Promise<void>
  async notifyProjectDeadline(projectId: number, daysUntilDeadline: number): Promise<void>
}
```

---

### **Phase 2: In-App Notification Center (Week 2)**

#### UI Components

**1. Bell Icon in Header**
- Location: `client/src/components/layout/header.tsx`
- Features:
  - Bell icon from `lucide-react`
  - Badge showing unread count (red if >0)
  - Red dot indicator for urgent notifications
  - Click triggers dropdown panel
  - Polling: Fetch unread count every 60 seconds

**2. Notification Dropdown Panel**
- Positioned below bell icon
- Shows last 10 notifications
- Grouped by time: Today, Yesterday, This Week, Earlier
- Each notification card:
  ```
  [Icon] [Title]                    [Time Ago]
         [Message preview...]       [• Unread]
         [Action button if present]
  ```
- Footer actions: "Mark all read" | "View all"

**3. Full Notifications Page**
- Route: `/notifications`
- Features:
  - Tabs: All | Unread
  - Filters: Type dropdown, Date range picker
  - Search bar
  - Infinite scroll or pagination (20 per page)
  - Bulk select + mark read/unread
  - Click notification → navigate to `actionUrl`

#### API Endpoints
```
GET  /api/notifications
  Query params: ?unreadOnly=true&type=expense_approval&limit=20&offset=0

GET  /api/notifications/unread-count

POST /api/notifications/:id/read

POST /api/notifications/mark-all-read

DELETE /api/notifications/:id (soft delete or mark as dismissed)
```

---

### **Phase 3: Time Entry Reminders (Week 3)**

#### Prerequisite: Project Staffing
**Must build first:** Project staffing feature to track who is actively assigned to projects.

**New table:** `projectStaffing`
```typescript
{
  id: serial primaryKey
  projectId: integer (FK → projects.id)
  userId: integer (FK → users.id)
  roleId: integer (FK → roles.id) // Developer, PM, Designer, QA, etc.
  startDate: date
  endDate: date (nullable - null = currently active)
  isActive: boolean (default true)
  allocation: decimal(5,2) (nullable) // 0-100 percentage, e.g., 50 = half-time
  createdAt: timestamp
  updatedAt: timestamp
}
```

**UI:** New "Staffing" tab on project detail page (`/projects/:id`)
- Add/remove team members
- Assign roles
- Set start/end dates
- Track allocation percentage

#### Time Entry Reminder Logic

**Trigger:** Friday 4:00 PM (cron job via `node-cron`)

**Algorithm:**
```typescript
async function sendWeeklyTimeEntryReminders() {
  // Get all users with active project assignments
  const activeStaff = await db
    .select({ 
      userId: projectStaffing.userId,
      userName: users.name,
      projects: sql`array_agg(projects.name)`
    })
    .from(projectStaffing)
    .innerJoin(users, eq(projectStaffing.userId, users.id))
    .innerJoin(projects, eq(projectStaffing.projectId, projects.id))
    .where(and(
      eq(projectStaffing.isActive, true),
      or(
        isNull(projectStaffing.endDate),
        gte(projectStaffing.endDate, new Date())
      )
    ))
    .groupBy(projectStaffing.userId, users.name);
  
  for (const staff of activeStaff) {
    // Check if they've entered time this week
    const thisWeekStart = getWeekStart(new Date()); // Monday
    const thisWeekEnd = getWeekEnd(new Date()); // Sunday
    
    const timeEntries = await db
      .select({ count: sql`count(*)` })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.userId, staff.userId),
        gte(timeEntries.date, thisWeekStart),
        lte(timeEntries.date, thisWeekEnd)
      ));
    
    // Find missing days
    const missingDays = getMissingWorkdays(staff.userId, thisWeekStart, thisWeekEnd);
    
    if (missingDays.length > 0) {
      await notificationService.notifyTimeEntryReminder(staff.userId, {
        projects: staff.projects,
        missingDays: missingDays,
        weekStart: thisWeekStart,
        weekEnd: thisWeekEnd
      });
    }
  }
}
```

**Notification Content:**
```
Title: "Time Entry Reminder"
Message: "Don't forget to log your time for this week! You're on 3 active projects."
Metadata: {
  projects: ["Project Alpha", "Project Beta", "Project Gamma"],
  missingDays: ["Monday", "Tuesday", "Thursday"],
  weekStart: "2025-10-27",
  weekEnd: "2025-11-02"
}
ActionUrl: "/time-tracking"
```

---

### **Phase 4: Expense Approvals (Week 4)**

#### Approval Rule: $500 Threshold

**Trigger:** When expense is created or updated

**Logic:**
```typescript
// In POST /api/expenses and PUT /api/expenses/:id routes

if (expense.amount >= 500 && !expense.isApproved) {
  // Get all users with 'executive' or 'admin' role
  const approvers = await db
    .select()
    .from(users)
    .where(or(
      eq(users.role, 'executive'),
      eq(users.role, 'admin')
    ));
  
  // Notify each approver
  for (const approver of approvers) {
    await notificationService.notifyExpenseApproval(expense.id, approver.id);
  }
}
```

#### Notification Types

**1. Approval Request (to approvers)**
```
Title: "Expense Approval Required"
Message: "John Doe submitted an expense for $1,245.32"
Metadata: {
  expenseId: 123,
  submitterId: 45,
  submitterName: "John Doe",
  amount: 1245.32,
  category: "Office Equipment",
  description: "Standing desk",
  date: "2025-10-15"
}
ActionUrl: "/expenses?highlight=123"
Priority: "high"
```

**2. Status Update (to submitter)**
```
Title: "Expense Approved"
Message: "Your expense for $1,245.32 was approved by Jane Smith"

OR

Title: "Expense Rejected"
Message: "Your expense for $1,245.32 was rejected by Jane Smith"
Metadata: {
  expenseId: 123,
  approverId: 67,
  approverName: "Jane Smith",
  status: "approved" | "rejected",
  notes: "Please use procurement process for purchases over $1,000"
}
ActionUrl: "/expenses?highlight=123"
```

#### Escalation
- If expense pending approval >3 business days, send reminder to all approvers
- Mark notification as "urgent" priority

---

### **Phase 5: Invoice Batch Notices (Week 5)**

#### Notification Triggers

**1. Batch Created**
- Notify: Creator only
- Low priority

**2. Batch Status → Reviewed**
- Notify: Creator + all billing-admins
- Normal priority

**3. Batch Status → Finalized**
- Notify: Creator + all billing-admins + all admins
- High priority

**4. Payment Received/Updated**
- Notify: Creator + all billing-admins
- Normal priority

#### Notification Content
```
Title: "Invoice Batch Finalized"
Message: "Batch INV-20250801-0841 has been finalized by Jane Smith"
Metadata: {
  batchId: "INV-20250801-0841",
  status: "finalized",
  actorName: "Jane Smith",
  totalAmount: 5882.03,
  clientCount: 2,
  dateRange: {
    start: "2025-07-31",
    end: "2025-08-30"
  }
}
ActionUrl: "/batches/INV-20250801-0841"
```

---

### **Phase 6: Settings UI (Week 6)**

#### Admin Settings Page: `/settings/notifications`

**System-Wide Controls:**
```
Notification Management
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Category: Time Tracking
  [✓] Time Entry Reminders
      Weekly reminders to log time for active projects
      Status: Enabled | 12 users subscribed | Last sent: Oct 25, 2025

Category: Expenses
  [✓] Expense Approval Requests
      Notifications when expenses require approval ($500+)
      Status: Enabled | 3 users subscribed | Last sent: Oct 27, 2025
  
  [✓] Expense Status Updates
      Notifications when expenses are approved or rejected
      Status: Enabled | 15 users subscribed | Last sent: Oct 27, 2025

Category: Invoicing
  [ ] Invoice Batch Notices
      Notifications about invoice batch status changes
      Status: Disabled | Would notify 8 users

...
```

#### User Preferences Page: `/settings/my-notifications`

**Global Toggles:**
```
Delivery Preferences
  [✓] Enable email notifications
  [✓] Enable in-app notifications
  [ ] Enable SMS notifications (coming soon)

Timing
  Digest mode: [Immediate ▼]
  Quiet hours: [20:00] to [08:00]
```

**Per-Type Table:**
```
Notification Types
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Type                        | In-App | Email | SMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Time Entry Reminders        |   ✓    |   ✓   |  -
Expense Approval Requests   |   ✓    |   ✓   |  -
Expense Status Updates      |   ✓    |   -   |  -
Invoice Batch Notices       |   ✓    |   ✓   |  -
Budget Alerts               |   ✓    |   ✓   |  -
Project Deadline Reminders  |   ✓    |   ✓   |  -
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Background Jobs (via node-cron)

```typescript
// server/jobs/notificationJobs.ts

import cron from 'node-cron';

// Friday 4 PM: Time entry reminders
cron.schedule('0 16 * * 5', async () => {
  await sendWeeklyTimeEntryReminders();
});

// Daily 2 AM: Cleanup old notifications (>90 days)
cron.schedule('0 2 * * *', async () => {
  await notificationService.deleteOld(90);
});

// Hourly: Check budget thresholds
cron.schedule('0 * * * *', async () => {
  await checkBudgetThresholds();
});

// Daily 8 AM: Check upcoming project deadlines
cron.schedule('0 8 * * *', async () => {
  await checkProjectDeadlines();
});

// Every 3 days: Escalate pending expense approvals
cron.schedule('0 9 */3 * *', async () => {
  await escalatePendingExpenses();
});
```

---

## Open Questions for Decision

### 1. System-Wide Settings Defaults
**Question:** Should notification types default to OFF or ON in `systemNotificationSettings`?

**Option A:** Default to OFF (conservative)
- Pro: Admins explicitly opt-in to each notification type
- Pro: Prevents notification spam during rollout
- Con: Features won't work until admin enables them

**Option B:** Default to ON (aggressive)
- Pro: Features work immediately after deployment
- Pro: Users can opt-out individually if needed
- Con: May overwhelm users initially

**Recommendation:** ?

---

### 2. Staffing Allocation Tracking
**Question:** Should we track allocation percentage (e.g., 50% = half-time) or just active/inactive?

**Option A:** Just active/inactive boolean
- Pro: Simpler to implement and understand
- Pro: Sufficient for time entry reminders
- Con: Can't do capacity planning

**Option B:** Track allocation percentage
- Pro: Enables future resource planning features
- Pro: More accurate representation of availability
- Con: More complex UI and validation

**Recommendation:** ?

---

### 3. Expense Approval Chain
**Question:** Should we support multi-stage approvals or just single-stage?

**Option A:** Single-stage (current plan)
- Any executive or admin can approve
- First one to approve wins
- Simple and fast

**Option B:** Multi-stage hierarchical
- PM approves → Then executive approves
- More oversight, slower process
- Requires workflow engine

**Recommendation:** ?

---

### 4. Notification Retention
**Question:** Confirm 90-day retention and auto-deletion?

**Confirmed:** 90 days, then auto-delete via daily cron job

---

### 5. Real-time Updates
**Question:** Use WebSockets or polling for in-app notifications?

**Option A:** Polling (recommended for simplicity)
- Fetch unread count every 60 seconds
- Simpler, more stable
- Good enough for non-critical notifications

**Option B:** WebSockets (more complex)
- Instant updates
- More infrastructure to maintain
- Connection drops require reconnection logic

**Recommendation:** Start with polling, add WebSockets later if needed

---

### 6. Time Entry Reminder Timing
**Question:** Fixed Friday 4 PM or configurable per user?

**Option A:** Fixed Friday 4 PM for everyone
- Simple, consistent
- One cron job

**Option B:** User-configurable timing
- Better UX, but complex
- Requires per-user job scheduling

**Recommendation:** ?

---

### 7. Quiet Hours Enforcement
**Question:** How strictly should we enforce quiet hours?

**Option A:** Queue emails, send after quiet hours end
- Pro: True quiet hours
- Con: Complex queueing system needed

**Option B:** Skip emails during quiet hours (don't queue)
- Pro: Simple
- Con: User might miss important notifications

**Option C:** Only apply quiet hours to low-priority notifications
- Pro: Critical alerts still go through
- Con: Need priority classification

**Recommendation:** ?

---

### 8. Unsubscribe Handling
**Question:** One-click unsubscribe link behavior?

**Option A:** Unsubscribe from that specific notification type
- More granular control
- Requires type parameter in unsubscribe link

**Option B:** Unsubscribe from ALL email notifications
- Simpler, more aggressive
- Standard CAN-SPAM compliance

**Recommendation:** ?

---

## Success Metrics

After full implementation, track:

1. **Delivery Metrics**
   - Email delivery rate (sent vs delivered)
   - Email bounce rate (<5% is healthy)
   - Email open rate (20-30% is good for transactional emails)
   - Click-through rate on action buttons

2. **Engagement Metrics**
   - % of users customizing preferences
   - Average time to mark notification as read
   - % of notifications acted upon (clicked actionUrl)
   - Unsubscribe rate (<2% is healthy)

3. **Business Impact**
   - Reduction in late time entries
   - Average expense approval time
   - % of expenses approved within 3 days
   - Budget alert response time

4. **System Health**
   - Notification send latency (p50, p95, p99)
   - Database query performance for notification fetching
   - Background job execution time

---

## Implementation Timeline Summary

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Foundation | SendGrid setup, database schema, service layer |
| 2 | UI | Bell icon, dropdown panel, full page, API endpoints |
| 3 | Time Reminders | Project staffing feature, Friday reminder cron job |
| 4 | Expense Approvals | $500 threshold logic, approval notifications |
| 5 | Invoice Notices | Batch status notifications, payment updates |
| 6 | Settings & Polish | Admin settings, user preferences, testing |

**Total Duration:** 6 weeks

---

## Dependencies

1. **SendGrid Account**
   - Create account at sendgrid.com
   - Verify domain for email sending
   - Generate API key
   - Configure in Replit connector

2. **Email Templates**
   - Design in SendGrid
   - Get template IDs for code

3. **Project Staffing Feature**
   - Blocks time entry reminders (Phase 3)
   - Can build in parallel with Phases 1-2

---

## Future Enhancements (Post-MVP)

- SMS notifications via Twilio
- Push notifications (web + mobile)
- Slack/Teams integrations
- Smart digest mode (AI-grouped notifications)
- Notification templates customization per client
- Webhook support for external integrations
- Real-time WebSocket updates
- Advanced escalation rules engine
- A/B testing for notification copy
- Notification analytics dashboard
