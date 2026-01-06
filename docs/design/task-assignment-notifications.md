# Task Assignment Notification System - Design Document

## Overview

A notification system for resource allocations ("My Assignments") that:
1. Alerts users when they receive new project assignments
2. Sends weekly reminders for overdue assignments (end date passed + more than 7 days behind)

This follows the same pattern as time tracking reminders with global admin control and individual opt-out.

---

## Notification Types

### 1. New Assignment Notification

| Attribute | Value |
|-----------|-------|
| **Trigger** | User is assigned to a project (new record in `project_assignments`) |
| **Batching** | Wait 30 minutes to combine multiple assignments into one email |
| **Content** | List of new assignments with project name, client, role, start/end dates |
| **Link** | Direct to "My Assignments" page |

### 2. Overdue Assignment Reminder

| Attribute | Value |
|-----------|-------|
| **Trigger** | Assignment `endDate` has passed AND is more than 7 days overdue AND status != 'complete' |
| **Frequency** | Weekly (every 7 days) per overdue assignment |
| **Content** | List of overdue assignments with project name, original end date, days overdue |
| **Call-to-Action** | Update assignment status or mark complete |

---

## System Controls

### Global Admin Settings

Add to `system_settings` table:

| Setting Key | Type | Default | Description |
|-------------|------|---------|-------------|
| `TASK_NOTIFICATIONS_ENABLED` | boolean | `true` | Master on/off switch for all task notifications |
| `TASK_OVERDUE_THRESHOLD_DAYS` | integer | `7` | Days past end date before considered "overdue" |
| `TASK_OVERDUE_CHECK_TIME` | string | `08:00` | Daily time to check for overdue assignments |
| `TASK_BATCH_WINDOW_MINUTES` | integer | `30` | Wait time to batch new assignment emails |

### User Preferences

Add to `users` table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `receiveTaskNotifications` | boolean | `true` | User opt-out toggle for ALL task notifications (new + overdue) |

**Note**: This is separate from `receiveTimeReminders` - users can opt out of one without affecting the other.

---

## Database Schema Changes

### New Table: `pending_assignment_notifications`

Holds batched new assignments before sending combined email:

```typescript
pendingAssignmentNotifications = pgTable("pending_assignment_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  assignmentId: varchar("assignment_id").notNull().references(() => projectAssignments.id),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  projectName: text("project_name").notNull(),
  clientName: text("client_name"),
  roleName: text("role_name"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"), // null until email sent
});
```

### New Table: `overdue_reminder_log`

Tracks when overdue reminders were sent to prevent duplicate weekly sends:

```typescript
overdueReminderLog = pgTable("overdue_reminder_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  assignmentId: varchar("assignment_id").notNull().references(() => projectAssignments.id),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  nextReminderDue: timestamp("next_reminder_due").notNull(),
});
```

### Users Table Addition

```typescript
receiveTaskNotifications: boolean("receive_task_notifications").default(true),
```

---

## Email Templates

### New Assignments Email

**Subject**: `You have [N] new project assignment(s) in Constellation`

**Body Structure**:
```
Hi [First Name],

You've been assigned to the following project(s):

┌─────────────────┬─────────────┬──────────────┬──────────────┐
│ Project         │ Client      │ Role         │ Dates        │
├─────────────────┼─────────────┼──────────────┼──────────────┤
│ Website Redesign│ Acme Corp   │ Lead Dev     │ Jan 15 - Mar 30 │
│ Mobile App MVP  │ Acme Corp   │ Backend Dev  │ Feb 1 - Apr 15  │
└─────────────────┴─────────────┴──────────────┴──────────────┘

View your assignments: [Link to My Assignments]

---
To stop receiving these emails, update your notification preferences in your profile settings.
```

### Overdue Assignment Reminder

**Subject**: `Reminder: [N] assignment(s) are past due`

**Body Structure**:
```
Hi [First Name],

The following assignment(s) have passed their end date and may need attention:

┌─────────────────┬─────────────┬──────────────┬──────────────┐
│ Project         │ Client      │ End Date     │ Days Overdue │
├─────────────────┼─────────────┼──────────────┼──────────────┤
│ Website Redesign│ Acme Corp   │ Dec 15, 2025 │ 22 days      │
│ Data Migration  │ Beta Inc    │ Dec 20, 2025 │ 17 days      │
└─────────────────┴─────────────┴──────────────┴──────────────┘

Please update these assignments:
- Mark as complete if work is finished
- Extend the end date if work is ongoing
- Contact your PM if you need to be removed

View your assignments: [Link to My Assignments]

---
You'll receive this reminder weekly until assignments are updated.
To stop receiving these emails, update your notification preferences in your profile settings.
```

---

## Scheduled Jobs

### 1. New Assignment Batch Sender

| Attribute | Value |
|-----------|-------|
| **Schedule** | Every 5 minutes |
| **Job Name** | `sendBatchedAssignmentNotifications` |

**Logic**:
1. Check if `TASK_NOTIFICATIONS_ENABLED` is true
2. Find `pending_assignment_notifications` where:
   - `createdAt` < (now - 30 minutes)
   - `sentAt` is null
3. Group by `userId`
4. For each user:
   - Check `receiveTaskNotifications` is true
   - Check user has valid email
   - Send combined email with all pending assignments
5. Update all processed records with `sentAt = now()`

### 2. Overdue Assignment Checker

| Attribute | Value |
|-----------|-------|
| **Schedule** | Daily at configured time (default 8:00 AM) |
| **Job Name** | `sendOverdueAssignmentReminders` |

**Logic**:
1. Check if `TASK_NOTIFICATIONS_ENABLED` is true
2. Get `TASK_OVERDUE_THRESHOLD_DAYS` (default 7)
3. Find assignments where:
   - `endDate` < (today - threshold days)
   - `status` != 'complete'
   - User's `receiveTaskNotifications` = true
   - User has active project engagement (not marked complete)
4. Check `overdue_reminder_log` - only include if:
   - No previous reminder exists, OR
   - `nextReminderDue` <= today
5. Group by user
6. Send one email per user with all their overdue assignments
7. Upsert `overdue_reminder_log` with `nextReminderDue = today + 7 days`

---

## Integration Points

### Assignment Creation Hook

When a new `project_assignment` is created:
```typescript
// In storage.ts or routes.ts after creating assignment
await insertPendingAssignmentNotification({
  userId: assignment.userId,
  assignmentId: assignment.id,
  projectId: assignment.projectId,
  projectName: project.name,
  clientName: client.name,
  roleName: role?.name,
  startDate: assignment.startDate,
  endDate: assignment.endDate,
});
```

### Assignment Completion Hook

When assignment status changes to 'complete':
```typescript
// Remove from overdue tracking
await db.delete(overdueReminderLog)
  .where(eq(overdueReminderLog.assignmentId, assignmentId));
```

### Admin Settings UI

Add to System Settings page:
- Toggle: "Enable task assignment notifications"
- Number input: "Days before assignment is considered overdue" (default 7)
- Time picker: "Daily check time for overdue assignments" (default 8:00 AM)

### User Profile UI

Add to user profile/preferences:
- Checkbox: "Receive task assignment emails" (new assignments and overdue reminders)

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| 8 assignments created rapidly | All batched into one email after 30-minute window |
| User opts out mid-batch | Check preference at send time, not creation time |
| Global disabled mid-batch | Check global setting at send time |
| Assignment deleted before send | Skip missing assignments gracefully |
| Assignment completed before overdue | Remove from `overdue_reminder_log` immediately |
| User engagement marked complete | Exclude from overdue checks (same as time reminders) |
| Assignment end date extended | Recalculate overdue status on next daily check |
| User has no email | Skip user, log warning |

---

## Relationship to Time Tracking Reminders

| Aspect | Time Reminders | Task Notifications |
|--------|----------------|-------------------|
| Global toggle | `TIME_REMINDERS_ENABLED` | `TASK_NOTIFICATIONS_ENABLED` |
| User opt-out | `receiveTimeReminders` | `receiveTaskNotifications` |
| Trigger | Missing timesheet entries | New assignments / overdue |
| Frequency | Weekly (Fridays) | Immediate (batched) + Weekly overdue |
| Batching | N/A | 30-minute window |

Users can independently control each notification type.

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Add database tables
- Add user preference column
- Add system settings
- Create email templates

### Phase 2: New Assignment Notifications
- Hook into assignment creation
- Implement batch sender job
- Test batching behavior

### Phase 3: Overdue Reminders
- Implement daily overdue checker
- Add reminder log tracking
- Test weekly reminder cycle

### Phase 4: Admin UI
- System settings controls
- User profile preference

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Infrastructure | 2-3 hours |
| Phase 2: New Assignment Notifications | 3-4 hours |
| Phase 3: Overdue Reminders | 3-4 hours |
| Phase 4: Admin UI | 2-3 hours |
| **Total** | **10-14 hours** |

---

## Open Questions

1. Should PMs also receive a copy when their team members get assignments?
2. Should there be an escalation path if overdue reminders are ignored for X weeks?
3. Should the 30-minute batch window be configurable by admins?
