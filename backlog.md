# Product Backlog

## Phase 3: Projects UX Polish

The following items are lower priority polish enhancements for the projects area UX improvements.

### 3.1 Filter Persistence in localStorage

**Priority:** Low  
**Effort:** Small  
**Description:**
- Remember user's last filter, sort, and view mode selections in localStorage
- Apply saved preferences when user returns to the Projects page
- Add "Clear Filters" button to reset to defaults (Active status, By Client sort, Grouped view)
- Include a user preference to opt-out of remembering filters

**Implementation Notes:**
```typescript
// Save to localStorage
localStorage.setItem('projects-view-prefs', JSON.stringify({
  statusFilter,
  sortBy,
  viewMode,
  collapsedClients: Array.from(collapsedClients)
}));

// Load on mount
useEffect(() => {
  const saved = localStorage.getItem('projects-view-prefs');
  if (saved) {
    const prefs = JSON.parse(saved);
    setStatusFilter(prefs.statusFilter || 'active');
    setSortBy(prefs.sortBy || 'client');
    setViewMode(prefs.viewMode || 'grouped');
    setCollapsedClients(new Set(prefs.collapsedClients || []));
  }
}, []);
```

---

### 3.2 Quick Actions Menu Enhancement

**Priority:** Low  
**Effort:** Medium  
**Description:**
- Add a dropdown menu (⋮ More) to each project row/card with quick actions:
  - View Project Details
  - Edit Project Settings
  - Manage Team & Assignments
  - View/Create Invoices
  - Export Report
  - Archive Project (for completed projects)
  - Copy Project Code
  - Open in New Tab
- Implement keyboard shortcuts for power users (e.g., `e` to edit, `v` to view)

**Files to Modify:**
- `client/src/pages/projects.tsx`

---

### 3.3 Client Group Collapse/Expand Persistence

**Priority:** Low  
**Effort:** Small  
**Description:**
- Remember which client groups are collapsed in localStorage
- Add "Collapse All" / "Expand All" buttons in the filter bar
- Show collapsed state summary (e.g., "3 of 5 clients expanded")

**Implementation Notes:**
```typescript
// Persist collapsed state
useEffect(() => {
  localStorage.setItem('projects-collapsed-clients', JSON.stringify(Array.from(collapsedClients)));
}, [collapsedClients]);

// Add bulk actions
const collapseAll = () => setCollapsedClients(new Set(sortedClientGroups.map(g => g.clientId)));
const expandAll = () => setCollapsedClients(new Set());
```

---

### 3.4 Project List Keyboard Navigation

**Priority:** Low  
**Effort:** Medium  
**Description:**
- Add keyboard navigation support for project list
- Arrow keys to navigate between projects
- Enter to view selected project
- `e` to edit selected project
- `/` to focus search input
- Visible focus indicators for accessibility

---

### 3.5 Project Status Quick Change

**Priority:** Low  
**Effort:** Small  
**Description:**
- Allow status change directly from project row without opening edit dialog
- Click on status badge to show dropdown with status options
- Confirm dangerous status changes (e.g., "Completed" → "Active")

---

### 3.6 Bulk Project Actions

**Priority:** Low  
**Effort:** Large  
**Description:**
- Add checkbox selection for projects in list/table view
- Bulk actions: Archive, Change Status, Export, Assign PM
- Selection persists across pagination (if added later)

---

### 3.7 Project Cards Customization

**Priority:** Low  
**Effort:** Medium  
**Description:**
- Allow users to customize which fields appear on project cards
- Drag-and-drop field ordering
- Save preferences per user in localStorage or database

---

### 3.8 Advanced Filters Dialog

**Priority:** Medium  
**Effort:** Medium  
**Description:**
- Implement the "Advanced" filter button functionality
- Filter by:
  - Date range (start date, end date)
  - Project Manager
  - Commercial Scheme
  - Budget range
  - Has SOW (yes/no)
  - Client
- Save filter presets

---

## Other Backlog Items

### Project Detail Page Improvements

- Add breadcrumb navigation
- Implement "Previous/Next Project" navigation
- Add project comparison view (compare 2 projects side-by-side)
- Add project timeline/Gantt view

### Client-Project Hierarchy

- Add ability to view all projects for a client from client detail page
- Client portfolio summary dashboard
- Cross-project resource allocation view

---

*Last updated: January 2026*
