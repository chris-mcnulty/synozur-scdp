# Advanced Resource Management — Design Document

**Status:** Planned  
**Author:** Synozur Product Team  
**Created:** February 12, 2026  
**Last Updated:** February 12, 2026  
**Backlog Reference:** P1 — Advanced Resource Management & Balancing

---

## Table of Contents

1. [Overview](#overview)
2. [Key Design Decisions](#key-design-decisions)
3. [Phase 1: Role Capabilities & Capacity Profiles](#phase-1-role-capabilities--capacity-profiles)
4. [Phase 2: Planner Sync Protection for Generic Roles](#phase-2-planner-sync-protection-for-generic-roles)
5. [Phase 3: Smart Assignment Suggestions](#phase-3-smart-assignment-suggestions)
6. [Phase 4: Cross-Project Workload View & Rebalancing](#phase-4-cross-project-workload-view--rebalancing)
7. [Phase 5: Capacity Planning Analytics](#phase-5-capacity-planning-analytics)
8. [Phase 6: Bulk Import & Polish](#phase-6-bulk-import--polish)
9. [Timeline Summary](#timeline-summary)

---

## Overview

Advanced Resource Management extends Constellation's existing project assignment system with three key capabilities:

1. **Multi-role mapping** — Each person can be mapped to multiple generic roles they are capable of filling (e.g., a Senior Consultant who can also serve as a Business Analyst or Project Lead).
2. **Smart assignment suggestions** — When staffing a project, the system suggests candidates based on role capability, availability, and cost variance against the estimate.
3. **Per-person capacity limits** — Configurable weekly hours per person to account for part-time staff, day-off schedules, or contractual limits.

These capabilities power intelligent staffing decisions, cross-project workload visibility, and rebalancing tools with full cost impact analysis.

---

## Key Design Decisions

### 1. Estimate-to-Project Conversion Stays Fast

Estimate-to-project conversion is a quick operation that may also include Teams/Channel creation steps. Assignment suggestions do NOT happen during conversion. Generic roles flow through unchanged from estimate line items to project allocations. Smart assignment suggestions happen later, in the project's assignment/delivery module, where PMs staff generic-role allocations with named people.

### 2. Planner Sync Protects Generic Roles

Allocations assigned to a generic role (roleId set, no personId) must preserve their roleId through Planner sync cycles. The outbound sync includes the role name in the Planner task title and notes for visibility. When bidirectional sync is built later, inbound updates from Planner are limited to a field whitelist (status, dates, percent complete) and never touch roleId, personId, pricingMode, hours, or rates.

### 3. Per-Person Capacity as Utilization Denominator

All utilization calculations use each person's `weeklyCapacityHours` (default 40) as the denominator, not a fixed 40-hour week. This means a person available 32 hrs/week who is allocated 28 hrs shows as 87.5% utilized, not 70%.

### 4. Cost Variance Drives Staffing Decisions

When suggesting candidates for a role, the system compares each person's cost rate (for that role) against the estimate's budgeted cost rate. This surfaces the financial impact of each staffing choice before it's made. Salaried staff are flagged as $0 cost impact since their time doesn't affect project profitability.

---

## Phase 1: Role Capabilities & Capacity Profiles

**Effort:** ~1 week

### 1A. Multi-Role Capability Mapping

#### New Table: `user_role_capabilities`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID (PK) | Auto-generated |
| tenantId | FK → tenants | Tenant isolation |
| userId | FK → users | The person |
| roleId | FK → roles | A role they can fill |
| proficiencyLevel | text | "primary", "secondary", or "learning" |
| customCostRate | decimal(10,2) | Optional: this person's cost rate when serving in this role |
| customBillingRate | decimal(10,2) | Optional: billing rate override for this role |
| notes | text | Certifications, experience notes (e.g., "Certified PMP", "3 years BA experience") |
| createdAt | timestamp | Auto-generated |

**Unique constraint:** (tenantId, userId, roleId) — a person can only have one capability entry per role.

**Relationship to existing `users.roleId`:** The existing `roleId` on users stays as the person's default/primary role for backward compatibility. The new table adds additional roles they can fill. A person's primary role should also appear in `user_role_capabilities` with `proficiencyLevel = "primary"`.

**Example data:**

| Person | Role | Proficiency | Custom Cost Rate |
|--------|------|-------------|-----------------|
| Sarah Chen | Senior Consultant | primary | (null — uses default) |
| Sarah Chen | Business Analyst | secondary | $75/hr |
| Sarah Chen | Project Lead | secondary | $95/hr |
| Mike Torres | Senior Consultant | secondary | (null) |
| Mike Torres | Data Analyst | primary | (null) |

### 1B. Per-Person Capacity Profiles

#### New Columns on `users` Table

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| weeklyCapacityHours | decimal(5,2) | 40.00 | Standard available hours per week |
| capacityNotes | text | null | Free-text context (e.g., "Not available Wednesdays", "20hr/week contract") |
| capacityEffectiveDate | date | null | When this capacity setting takes effect |

**Examples:**

| Person | Weekly Capacity | Notes |
|--------|----------------|-------|
| Josiah | 32 | Not available Wednesdays |
| Chios | 20 | Part-time, 20hr/week contract |
| Sarah | 40 | (default full-time) |

**Future consideration:** If capacity varies by time period (e.g., 40 hrs in March but 20 hrs in April), a separate `user_capacity_schedules` table could handle time-bounded capacity windows. For the initial release, a single weekly number covers the common cases.

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users/:id/role-capabilities` | List a person's role capabilities |
| POST | `/api/users/:id/role-capabilities` | Add a role capability |
| PATCH | `/api/users/:id/role-capabilities/:capId` | Update proficiency or rates |
| DELETE | `/api/users/:id/role-capabilities/:capId` | Remove a capability |
| GET | `/api/roles/:id/capable-users` | Find all people who can fill a given role |
| PATCH | `/api/users/:id` | Extended to support weeklyCapacityHours, capacityNotes, capacityEffectiveDate |

### UI Changes

**User Profile/Edit Page — new "Capabilities & Capacity" section:**
- Role capabilities list with proficiency badges (Primary / Secondary / Learning)
- Add role via dropdown with proficiency selection
- Optional cost/billing rate override per role
- Weekly capacity hours field with notes
- Capacity effective date picker

**User List Page — new columns:**
- "Roles" — comma-separated badges showing all capable roles
- "Weekly Hrs" — the person's weekly capacity

---

## Phase 2: Planner Sync Protection for Generic Roles

**Effort:** ~2-3 days

### Outbound Sync Changes (Constellation → Planner)

When syncing an allocation that has `roleId` but no `personId` (generic role assignment):

1. **Task title** includes the role name: `"[Senior Consultant] Week 3 — Requirements Analysis"`
2. **Task notes** include: `"ROLE: Senior Consultant"` alongside the existing Constellation link and hours
3. **Task stays unassigned** in Planner (no Azure user to map to) — correct behavior

### Sync Field Whitelist

Define explicit ownership of fields between Constellation and Planner:

| Constellation-Owned (never overwritten by inbound sync) | Planner-Owned (sync back from Planner) |
|----------------------------------------------------------|----------------------------------------|
| roleId | percentComplete → status mapping |
| personId | startDateTime → plannedStartDate |
| pricingMode | dueDateTime → plannedEndDate |
| hours | |
| costRate, billingRate, rackRate | |
| resourceName | |
| estimateLineItemId | |
| weekNumber | |

This whitelist is enforced in the sync logic. When bidirectional sync (Phase 2 of Planner integration) is built, it reads updates from Planner but only writes the Planner-owned fields back to Constellation. All role, person, and financial data remains under Constellation's control.

### Implementation Notes

- No new database columns required; this is a logic change in `server/services/planner-sync-scheduler.ts`
- The sync record in `plannerTaskSync` already tracks `allocationId` — the allocation's `roleId` is accessed through that link
- Update task title format in the `syncProjectAllocations` function
- Add role name to the task notes template

---

## Phase 3: Smart Assignment Suggestions

**Effort:** ~2 weeks

This happens in the project's assignment/delivery module — NOT during estimate-to-project conversion.

### The Flow

1. PM opens a project's Delivery/Assignments tab
2. Sees allocations with generic roles and no named person: "Senior Consultant — 120 hrs, Weeks 3-8, $250/hr billing, $85/hr cost"
3. Clicks **"Suggest People"** on one or more unassigned allocations
4. System queries candidates and ranks them

### Suggestion Engine

#### Data Sources

For a given allocation needing a person:
- **Role:** The allocation's `roleId`
- **Date range:** `plannedStartDate` to `plannedEndDate`
- **Hours needed:** The allocation's `hours`
- **Budget cost rate:** The allocation's `costRate`

#### Candidate Discovery

1. Query `user_role_capabilities` for all users with matching `roleId` (within the same tenant)
2. Filter to `users.isActive = true` and `users.isAssignable = true`
3. For each candidate, calculate availability and cost variance

#### Availability Calculation

For each candidate in the allocation's date range:
- Total capacity = `weeklyCapacityHours × number of weeks in range`
- Already allocated = sum of `hours` from all existing `projectAllocations` overlapping the date range (where `status != 'cancelled'`)
- Available hours = Total capacity − Already allocated
- Availability % = Available hours / Hours needed (capped at 100%)

#### Cost Variance Calculation

For each candidate:
- Person's effective cost rate for this role = `user_role_capabilities.customCostRate` → `users.defaultCostRate` → `roles.defaultCostRate` (fallback chain)
- Cost variance $ = (Person's cost rate − Budget cost rate) × Hours needed
- Cost variance % = (Person's cost rate − Budget cost rate) / Budget cost rate × 100
- If `users.isSalaried = true` or `roles.isAlwaysSalaried = true`: display "$0 project cost impact" badge

#### Ranking Algorithm

| Factor | Weight | Scoring |
|--------|--------|---------|
| Role proficiency | High | Primary = +3, Secondary = +2, Learning = +1 |
| Availability match | High | 100% available = +3, 75-99% = +2, 50-74% = +1, <50% = 0 |
| Cost variance | Medium | Under budget = +2, Within 5% = +1, Over 5% = 0, Over 15% = -1 |
| Salaried bonus | Bonus | Salaried = +1 (no cost impact) |
| Current utilization | Tiebreaker | Below 80% = +1, 80-100% = 0, Over 100% = -1 |

Total score determines the display order. Candidates with 0% availability are still shown (greyed out) for awareness.

### Candidate Display Card

```
Sarah Chen — Senior Consultant (Primary)
  Capacity: 32 hrs/week (not available Wednesdays)
  Available: 96 of 120 hrs needed  ⚠️ Partial
  Cost: $90/hr vs Budget: $85/hr → +$600 over budget (+5.9%)

Mike Torres — Senior Consultant (Secondary)
  Capacity: 40 hrs/week
  Available: 120 of 120 hrs needed  ✅ Full
  Cost: $82/hr vs Budget: $85/hr → −$360 under budget (−3.5%) ✅
  Salaried: Yes → $0 project cost impact
```

### Bulk Assignment

- Select multiple generic-role allocations → "Auto-suggest for all"
- System runs suggestions for each allocation, shows a review screen with all proposed assignments
- PM can accept, reject, or swap candidates before confirming
- On confirm: `projectAllocations` updated with `personId`, `pricingMode` changed from "role" to "person", rates recalculated
- **Original `roleId` is preserved** on the allocation — so you always know what generic role this was estimated for

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/assignment-suggestions` | Suggestions for one allocation (query: allocationId) or a role/date range (query: roleId, startDate, endDate, hours) |
| POST | `/api/projects/:id/bulk-assign` | Assign named people to multiple allocations at once |

---

## Phase 4: Cross-Project Workload View & Rebalancing

**Effort:** ~2 weeks

### Workload Dashboard

**Route:** `/resource-planning`

#### Timeline View
- Horizontal bars per person showing allocations across all active projects, by week/month
- Each bar segment color-coded by project
- Click a person to drill down into their allocation detail

#### Utilization Heat Map
- Utilization = allocated hours / `weeklyCapacityHours` per person per week
- Color coding:
  - Green: 60-80% (healthy)
  - Yellow: 80-100% (at capacity)
  - Red: >100% (overallocated)
  - Grey: <40% (underutilized / bench)

#### Filters
- By role capability (from `user_role_capabilities`)
- By project
- By date range
- By utilization threshold (e.g., "Show only overallocated")
- By tenant

### Rebalancing Flow

When an overallocated person is identified:

1. Click **"Find Replacement"** on a specific allocation
2. System uses the same suggestion engine from Phase 3 — finds candidates by role capability, availability, and cost variance
3. Shows **impact analysis**:
   - "Swapping Sarah ($90/hr) for Mike ($82/hr) on Project Alpha saves $960 over 120 hours"
   - "Project margin improves from 22% to 24%"
4. PM confirms → old allocation updated (person swapped), Planner sync triggered for the affected task

#### Rebalancing Scenarios

| Scenario | System Behavior |
|----------|----------------|
| Person overallocated (>100%) | Flags conflict, suggests partial reassignment or replacement |
| Person leaving a project early | Suggests replacement candidates for remaining hours |
| New project needs staffing | Shows available people by role with capacity |
| Cost optimization | "Find cheaper alternatives" — sorts by cost rate ascending |
| Skill upgrade | "Find more senior resource" — filters by proficiency level |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/resource-planning/workload` | All people with allocation summaries (query: startDate, endDate) |
| GET | `/api/resource-planning/utilization` | Detailed utilization for one person (query: personId, startDate, endDate) |
| GET | `/api/resource-planning/conflicts` | Overallocated people in date range |
| GET | `/api/resource-planning/rebalance-suggestions` | Replacement candidates for a specific allocation (query: allocationId) |
| POST | `/api/resource-planning/reassign` | Execute a person swap on an allocation |

---

## Phase 5: Capacity Planning Analytics

**Effort:** ~1-2 weeks

### Dashboard

**Route:** `/resource-planning/capacity`

#### KPI Cards
- Team utilization rate (total allocated / total capacity)
- Bench count (people with <20% utilization)
- Open roles (unfilled generic-role allocations)
- Demand gap (role demand − role supply)

#### Visualizations

**Utilization by Role Over Time**
- Bar chart showing weekly/monthly utilization by role
- Uses `weeklyCapacityHours` as denominator per person

**Bench List**
- Table of underutilized people (<20% allocation)
- Shows role capabilities and available hours
- Useful for identifying who can take on new work

**Role Demand vs Supply**
- Unfilled generic-role allocations aggregated by role = demand
- Count of available capable people by role (from `user_role_capabilities`) = supply
- Gap analysis highlighting roles that need hiring or contracting

**Forecast Tool**
- "If we win Proposal X (estimated 500 Senior Consultant hours), team utilization goes from 72% to 91%"
- Input: select an estimate → system calculates impact on team utilization

**Cost Variance Trends**
- Average actual vs estimated cost rates over time
- Flags persistent over-budget patterns by role or project

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/resource-planning/capacity-summary` | Aggregate KPIs (query: startDate, endDate) |
| GET | `/api/resource-planning/bench` | Underutilized people list |
| GET | `/api/resource-planning/demand-supply` | Role demand vs supply breakdown |

---

## Phase 6: Bulk Import & Polish

**Effort:** ~1 week

- CSV/Excel template for bulk role capability assignments
- CSV/Excel template for bulk capacity profile updates
- Validation and error reporting for imports
- Performance optimization for large teams (50+ people, 20+ active projects)
- Historical utilization trend charts

---

## Timeline Summary

| Phase | What | Effort |
|-------|------|--------|
| 1 | Role capabilities + capacity profiles | ~1 week |
| 2 | Planner sync protection for generic roles | ~2-3 days |
| 3 | Smart assignment suggestions (in project assignment module) | ~2 weeks |
| 4 | Cross-project workload & rebalancing | ~2 weeks |
| 5 | Capacity planning analytics | ~1-2 weeks |
| 6 | Bulk import & polish | ~1 week |
| **Total** | | **~7-8 weeks** |

Each phase is independently valuable and can be shipped separately. Phase 1 alone provides immediate benefit from better role tracking and capacity visibility. Phases 2-3 build the suggestion engine. Phases 4-5 add strategic planning tools.

---

## Dependencies

- **Phase 1** has no dependencies — can start immediately
- **Phase 2** depends on Phase 1 (needs role capabilities data for enriched task titles)
- **Phase 3** depends on Phase 1 (needs role capabilities for candidate discovery)
- **Phase 4** depends on Phases 1 and 3 (reuses suggestion engine)
- **Phase 5** depends on Phase 1 (needs capacity profiles for utilization calculations)
- **Phase 6** depends on Phase 1 (bulk import for capabilities/capacity)

Phases 2 and 3 can run in parallel after Phase 1 is complete.

---

## Related Documents

- [Microsoft 365 Project Integration](./microsoft-365-project-integration.md) — Planner sync architecture
- [Multi-Tenancy Design](./multi-tenancy-design.md) — Tenant isolation patterns
- [Backlog](../../backlog.md) — Full product backlog with priorities
