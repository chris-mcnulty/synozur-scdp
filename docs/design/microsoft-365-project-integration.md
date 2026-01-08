# Microsoft 365 Project Integration - Feature Design

## Overview

This document outlines the design for integrating Constellation with Microsoft 365, **prioritizing bidirectional Planner synchronization first**, with Teams/Channel provisioning as a secondary feature.

### Priority Order (Revised January 2026)

| Priority | Feature | Description |
|----------|---------|-------------|
| **P1** | Bidirectional Planner Sync | Sync assignments ↔ Planner tasks, ask user where to create Plan |
| **P2** | Team/Channel Creation | Auto-provision Teams workspace with client/project structure |

---

## PRIORITY 1: Bidirectional Planner Integration

### Core Concept

When a project is created (or on-demand), users can optionally connect it to a Microsoft Planner plan. The system will:
1. **Ask where to create/connect the plan** with guided options
2. **Sync assignments bidirectionally** - SCDP ↔ Planner tasks
3. **Keep both systems in sync** as changes are made in either place

### Plan Location Options (Guided Dialog)

When enabling Planner for a project, present these options:

```
┌─────────────────────────────────────────────────────────────┐
│ Connect to Microsoft Planner                            [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Where should the Planner plan be created?                   │
│                                                             │
│ ○ Create new plan in existing Team                          │
│   [Select a Team...                              ▼]         │
│   ℹ️ The plan will be added to the selected Team's          │
│      Planner tab and visible to Team members.               │
│                                                             │
│ ○ Connect to existing Planner plan                          │
│   [Search for a plan...                          ▼]         │
│   ℹ️ Link to a plan that already exists. Tasks will         │
│      sync with existing items.                              │
│                                                             │
│ ○ Create standalone plan (no Team)                          │
│   ℹ️ Creates a plan in your personal Planner. You can       │
│      share it with team members later.                      │
│                                                             │
│                              [Cancel]  [Connect Planner]    │
└─────────────────────────────────────────────────────────────┘
```

### Bidirectional Sync Behavior

```
SCDP → Planner (Outbound)
───────────────────────────
• New assignment created → Create Planner task
• Assignment updated (dates, hours) → Update task details
• Assignment deleted → Delete task (with confirmation option)
• Assignment marked complete → Mark task complete
• User assigned → Set task assignee

Planner → SCDP (Inbound)
───────────────────────────
• Task marked complete → Update assignment status to "complete"
• Task reassigned → Notify PM (don't auto-change assignment)
• Task deleted → Flag assignment for review, notify PM
• Task dates changed → Update assignment dates (with PM approval option)
• New task created in Plan → Create assignment in SCDP (optional)
```

### Sync Trigger Options

| Trigger | Description |
|---------|-------------|
| **On project creation** | Checkbox in project creation dialog |
| **On-demand** | Button in project detail page: "Connect to Planner" |
| **Manual sync** | "Sync Now" button for immediate refresh |
| **Automatic** | Background job checks for changes every 5-15 minutes |

### Webhook vs Polling Strategy

**Phase 1: Polling** (Simpler implementation)
- Background job runs every 10 minutes
- Checks for changes in both SCDP and Planner
- Updates both systems accordingly

**Phase 2: Webhooks** (Better performance)
- Microsoft Graph webhooks notify of Planner changes
- Real-time sync instead of polling
- Requires public endpoint and subscription management

### Known Constraints

| Constraint | Impact |
|------------|--------|
| **No CSV import in Planner** | All tasks must be created via Graph API - no bulk import option |
| **Planner API rate limits** | May need to batch/throttle when syncing many assignments |
| **Task assignment requires Azure AD user** | External users need guest accounts or manual handling |

---

## PRIORITY 2: Team/Channel Creation (Lower Priority)

### Naming Convention

| M365 Resource | Source | Example |
|---------------|--------|---------|
| **Team name** | Client name | "Acme Corporation" |
| **Channel name** | Project name | "Q1-Website-Redesign" |

### Creation Logic

```
If Client Team exists:
  → Add new channel for Project
  
If Client Team does NOT exist:
  → Create Team named "{Client Name}"
  → Create "General" channel (auto-created by Teams)
  → Create "{Project Name}" channel
```

---

## 2. Administrative Settings

### System Settings Table Addition

```typescript
// Add to shared/schema.ts
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id)
});

// Settings to add:
// - m365_integration_enabled: boolean (master toggle)
// - m365_auto_create_teams: boolean (auto-create Teams on project creation)
// - m365_planner_sync_enabled: boolean (enable Planner synchronization)
// - m365_default_team_template: string (template ID for new Teams)
```

### Admin UI
- New "Microsoft 365 Integration" section in Settings page
- Toggle switches for each integration feature
- Template selection dropdown for Team creation
- Test connection button to verify Microsoft Graph permissions

---

## 2. Required Microsoft Graph Permissions

### Additional Azure AD App Permissions Needed

The current Outlook connector has limited permissions. For full Teams/Planner integration, these additional permissions are required:

| Permission | Type | Purpose |
|------------|------|---------|
| `Team.Create` | Delegated/Application | Create new Teams |
| `Team.ReadBasic.All` | Delegated | Read Team info |
| `Channel.Create` | Delegated/Application | Create channels in Teams |
| `Channel.ReadBasic.All` | Delegated | Read channel info |
| `Group.ReadWrite.All` | Application | Manage Team membership |
| `TeamMember.ReadWrite.All` | Delegated | Add/remove Team members |
| `Tasks.ReadWrite` | Delegated | Create and manage Planner tasks |
| `Group.Read.All` | Delegated | Find existing client Teams |
| `Sites.Manage.All` | Application | Access Team SharePoint sites |

### Connector Strategy
- **Option A**: Extend existing Outlook connector with additional permissions
- **Option B (Recommended)**: Create a separate "Microsoft Teams" connector with Teams/Planner-specific permissions to maintain separation of concerns

---

## 3. Database Schema Changes

### New Tables

```typescript
// Client-to-Team mapping
export const clientTeams = pgTable("client_teams", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  teamId: varchar("team_id", { length: 255 }).notNull(), // Microsoft Team ID
  teamName: varchar("team_name", { length: 255 }),
  teamWebUrl: text("team_web_url"),
  sharepointSiteId: varchar("sharepoint_site_id", { length: 255 }),
  sharepointSiteUrl: text("sharepoint_site_url"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id)
});

// Project-to-Channel mapping
export const projectChannels = pgTable("project_channels", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  channelId: varchar("channel_id", { length: 255 }).notNull(), // Microsoft Channel ID
  channelName: varchar("channel_name", { length: 255 }),
  channelWebUrl: text("channel_web_url"),
  plannerId: varchar("planner_id", { length: 255 }), // Associated Planner Plan ID
  plannerWebUrl: text("planner_web_url"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id)
});

// User Azure AD mapping (for member sync)
export const userAzureMapping = pgTable("user_azure_mapping", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  azureUserId: varchar("azure_user_id", { length: 255 }).notNull(),
  azureUserPrincipalName: varchar("azure_upn", { length: 255 }),
  syncedAt: timestamp("synced_at").defaultNow()
});

// Planner task sync tracking
export const plannerTaskSync = pgTable("planner_task_sync", {
  id: serial("id").primaryKey(),
  allocationId: integer("allocation_id").notNull().references(() => allocations.id),
  plannerTaskId: varchar("planner_task_id", { length: 255 }).notNull(),
  plannerId: varchar("planner_id", { length: 255 }).notNull(),
  bucketId: varchar("bucket_id", { length: 255 }), // Weekly bucket
  weekStartDate: date("week_start_date"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  syncStatus: varchar("sync_status", { length: 50 }).default("synced"), // synced, pending, error
  syncError: text("sync_error")
});
```

---

## 4. Service Layer Design

### New Service: `server/services/microsoft-teams-service.ts`

```typescript
interface IMicrosoftTeamsService {
  // Team Management
  createClientTeam(clientId: number, clientName: string, createdBy: string): Promise<ClientTeam>;
  getClientTeam(clientId: number): Promise<ClientTeam | null>;
  addTeamMember(teamId: string, azureUserId: string): Promise<void>;
  removeTeamMember(teamId: string, azureUserId: string): Promise<void>;
  
  // Channel Management  
  createProjectChannel(teamId: string, projectId: number, projectName: string): Promise<ProjectChannel>;
  archiveChannel(channelId: string): Promise<void>;
  
  // Planner Integration
  createPlannerPlan(teamId: string, projectId: number, projectName: string): Promise<PlannerPlan>;
  createPlannerBucket(planId: string, weekStartDate: Date): Promise<PlannerBucket>;
  createPlannerTask(planId: string, bucketId: string, allocation: Allocation): Promise<PlannerTask>;
  updatePlannerTask(taskId: string, updates: Partial<PlannerTask>): Promise<void>;
  deletePlannerTask(taskId: string): Promise<void>;
  
  // Sync Operations
  syncAllocationToPlanner(allocationId: number): Promise<void>;
  syncProjectPlannerTasks(projectId: number): Promise<SyncResult>;
  
  // User Mapping
  findAzureUserByEmail(email: string): Promise<AzureUser | null>;
  mapUserToAzure(userId: string): Promise<UserAzureMapping>;
}
```

### Core Logic Flow

```
Project Creation Flow:
┌────────────────────────────────────────────────────────────────┐
│ 1. User creates new project                                   │
│    ↓                                                          │
│ 2. Check if M365 integration enabled (admin setting)          │
│    ↓                                                          │
│ 3. Check if client has existing Team                          │
│    ├─ NO → Create new Team + SharePoint site                  │
│    │        → Store in clientTeams table                      │
│    └─ YES → Use existing Team                                 │
│    ↓                                                          │
│ 4. Create project channel in Team                             │
│    → Store in projectChannels table                           │
│    ↓                                                          │
│ 5. Create Planner Plan linked to channel                      │
│    → Create weekly buckets for project duration               │
│    ↓                                                          │
│ 6. Return M365 resource info to frontend                      │
└────────────────────────────────────────────────────────────────┘

Assignment Sync Flow:
┌────────────────────────────────────────────────────────────────┐
│ 1. User assigned to project (allocation created)              │
│    ↓                                                          │
│ 2. Ensure user added to Team                                  │
│    → Map SCDP user to Azure AD user via email                 │
│    → Add as Team member if not already                        │
│    ↓                                                          │
│ 3. Create/update Planner tasks                                │
│    → One task per allocation per week                         │
│    → Assign to Azure user                                     │
│    → Set due dates based on allocation dates                  │
│    ↓                                                          │
│ 4. Track in plannerTaskSync table                             │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. API Endpoints

### New Endpoints

```typescript
// Settings Management
GET    /api/settings/m365                    // Get M365 integration settings
PATCH  /api/settings/m365                    // Update M365 settings (admin only)
POST   /api/settings/m365/test-connection    // Test Microsoft Graph connection

// Client Teams
GET    /api/clients/:id/team                 // Get client's Team info
POST   /api/clients/:id/team                 // Manually create Team for client

// Project Channels
GET    /api/projects/:id/channel             // Get project channel info
POST   /api/projects/:id/channel             // Manually create channel
GET    /api/projects/:id/planner             // Get Planner plan info
POST   /api/projects/:id/planner/sync        // Trigger manual sync

// User Azure Mapping
GET    /api/users/:id/azure-mapping          // Get user's Azure AD info
POST   /api/users/:id/azure-mapping          // Create/update mapping
```

---

## 6. Frontend UI/UX Design

### Project Creation Dialog Enhancement

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Project                                      [X] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Project Name: [________________________]                    │
│ Client:       [ABC Corp                 ▼]                  │
│ Start Date:   [01/15/2026]                                  │
│ End Date:     [06/30/2026]                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔗 Microsoft 365 Integration                            │ │
│ │                                                         │ │
│ │ [✓] Create Microsoft Teams workspace                    │ │
│ │                                                         │ │
│ │     ℹ️ First project for ABC Corp                       │ │
│ │     A new Team "ABC Corp - Consulting" will be created  │ │
│ │     with a dedicated SharePoint site.                   │ │
│ │                                                         │ │
│ │ [✓] Create Planner plan for task tracking               │ │
│ │                                                         │ │
│ │ [✓] Auto-add assigned team members                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                              [Cancel]  [Create Project]     │
└─────────────────────────────────────────────────────────────┘
```

### Existing Client Scenario

```
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔗 Microsoft 365 Integration                            │ │
│ │                                                         │ │
│ │ [✓] Add to existing Microsoft Teams workspace           │ │
│ │                                                         │ │
│ │     ℹ️ ABC Corp already has a Team                      │ │
│ │     A new channel "Project XYZ" will be added to the    │ │
│ │     existing "ABC Corp - Consulting" Team.              │ │
│ │                                                         │ │
│ │     [View existing Team →]                              │ │
│ └─────────────────────────────────────────────────────────┘ │
```

### Project Detail - M365 Integration Tab

```
┌─────────────────────────────────────────────────────────────┐
│ Project: ABC Corp - Q1 Optimization                         │
├──────┬──────┬──────┬──────┬──────┬───────────────┬─────────┤
│ Info │ Team │ Time │ Exp  │ Docs │ M365          │ ···     │
├──────┴──────┴──────┴──────┴──────┴───────────────┴─────────┤
│                                                             │
│ Microsoft Teams                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Team: ABC Corp - Consulting          [Open in Teams →]  │ │
│ │ Channel: #Q1-Optimization            [Open Channel →]   │ │
│ │ SharePoint: ABC Corp Site            [Open Site →]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Microsoft Planner                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Plan: Q1 Optimization Tasks          [Open Planner →]   │ │
│ │                                                         │ │
│ │ Sync Status: ✓ Synced (Last: 5 min ago)                 │ │
│ │ Tasks: 24 active, 8 completed                           │ │
│ │                                       [Sync Now]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Team Members                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✓ John Smith (john@company.com)      Added to Team      │ │
│ │ ✓ Jane Doe (jane@company.com)        Added to Team      │ │
│ │ ⚠ Bob Wilson (bob@external.com)      Not in Azure AD    │ │
│ │                                       [Retry Mapping]   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Planner Synchronization Strategy

### Initial Sync (One-way Copy)
Phase 1 implementation creates Planner tasks as a **one-way copy** from SCDP allocations:

```
SCDP Allocation → Planner Task
────────────────────────────────
Project          → Plan
User + Week      → Task
Week Start       → Bucket (e.g., "Week of Jan 20")
Assignment Title → Task Title
Hours            → Task Description
User             → Assigned To
Week End         → Due Date
```

### Future: Bidirectional Sync
Phase 2 will add bidirectional synchronization:

```
Changes in SCDP:
- New allocation → Create Planner task
- Updated allocation → Update Planner task
- Deleted allocation → Delete Planner task
- Completed assignment → Mark task complete

Changes in Planner:
- Task marked complete → Update allocation status (future)
- Task reassigned → Notify PM (future)
- Task deleted → Flag for review (future)
```

### Weekly Bucket Structure

```
Plan: ABC Corp - Q1 Optimization
├── Bucket: Week of Jan 13
│   ├── Task: John Smith - Requirements Analysis (40h)
│   └── Task: Jane Doe - Technical Discovery (24h)
├── Bucket: Week of Jan 20
│   ├── Task: John Smith - Solution Design (32h)
│   ├── Task: Jane Doe - Architecture Review (16h)
│   └── Task: Bob Wilson - Development (40h)
└── Bucket: Week of Jan 27
    └── ...
```

---

## 8. Error Handling & Edge Cases

### Error Scenarios

| Scenario | Handling |
|----------|----------|
| User not in Azure AD | Log warning, show in UI, allow manual mapping |
| Team creation fails | Rollback, show error, allow retry |
| Planner sync fails | Queue for retry, show sync status |
| Permission denied | Clear error message, link to admin settings |
| Rate limiting | Implement exponential backoff |
| Network timeout | Retry with jitter |

### Edge Cases

1. **External consultants**: Users with external email domains may not be in Azure AD
   - Solution: Show warning, allow project to proceed, manual Teams invitation

2. **Client Team already exists externally**: Client may have created their own Team
   - Solution: Allow admin to link existing Team via Team ID

3. **Project renamed**: Channel names should stay consistent
   - Solution: Store original name, allow manual rename with confirmation

4. **User removed from project**: Should they be removed from Team?
   - Solution: Configurable - keep in Team (for historical access) or remove

5. **Project archived/deleted**: What happens to Teams/Planner?
   - Solution: Archive channel, keep for records, optionally delete after X days

---

## 9. Implementation Phases

### Phase 1: Foundation (2-3 weeks)
- [ ] Add system settings table and admin UI
- [ ] Create clientTeams and projectChannels tables
- [ ] Set up Microsoft Teams connector with proper permissions
- [ ] Implement basic Team/Channel creation service
- [ ] Add M365 integration options to project creation dialog

### Phase 2: Planner Integration (2-3 weeks)
- [ ] Add userAzureMapping and plannerTaskSync tables
- [ ] Implement user-to-Azure mapping logic
- [ ] Create Planner plan and bucket management
- [ ] Implement one-way task sync on allocation creation
- [ ] Add M365 tab to project detail page

### Phase 3: Member Management (1-2 weeks)
- [ ] Auto-add members when assigned to project
- [ ] Handle external user scenarios
- [ ] Add member sync status UI
- [ ] Implement retry mechanisms for failed mappings

### Phase 4: Bidirectional Sync (Future)
- [ ] Set up Microsoft Graph webhooks for change notifications
- [ ] Implement Planner-to-SCDP sync logic
- [ ] Add conflict resolution for simultaneous edits
- [ ] Build audit trail for sync activities

---

## 10. Security Considerations

1. **Least Privilege**: Request only required Graph permissions
2. **Token Management**: Use Replit connector for secure token refresh
3. **Audit Logging**: Log all M365 operations for compliance
4. **Data Isolation**: Client Teams are isolated per-client
5. **User Consent**: Users must consent to Azure AD mapping
6. **Admin Controls**: All features toggleable by admins

---

## 11. Dependencies & Prerequisites

### Technical Dependencies
- Microsoft Graph API v1.0
- @microsoft/microsoft-graph-client package (already installed)
- Azure AD App with Teams/Planner permissions

### Organizational Prerequisites
- Azure AD tenant admin approval for app permissions
- Microsoft 365 Business license for Teams/Planner
- User accounts in same Azure AD tenant (for full functionality)

---

## 12. Open Questions for Stakeholder Review

1. Should Team names follow a specific convention? (e.g., "{ClientName} - Consulting")
2. Should we support multiple Teams per client? (e.g., different engagements)
3. What happens to M365 resources when a client relationship ends?
4. Should external collaborators (outside Azure AD) be invited as guests?
5. What level of Planner integration is needed in Phase 1?
6. Should project managers be Team owners or just members?

---

*Document Version: 1.0*  
*Created: January 2026*  
*Status: Draft - Pending Review*
