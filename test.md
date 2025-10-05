# SCDP Test Tracking

## Active Sprint Testing (Week of Oct 5, 2025)

### 🔴 Critical Issues
*Issues that block core functionality or cause data corruption*

- [ ] None currently identified

### 🟡 Open Test Items
*Features/fixes that need testing before marking complete*

| Item | Component | Priority | Status | Notes |
|------|-----------|----------|--------|-------|
| TypeScript fixes in storage.ts | Backend | High | Pending | Fixed 11 schema errors, needs integration testing |
| getProjectAllocations schema alignment | API | Medium | Pending | Returns activity/milestone instead of epic/stage - verify no regressions |

### 📋 Functional Tests Needed
*New features requiring comprehensive testing*

| Feature | Test Scenario | Priority | Due Date | Status |
|---------|---------------|----------|----------|--------|
| Vocabulary Module | Test org-level defaults, client overrides, project overrides | High | Day 3 | Not Started |
| Project Assignments | Manual entry, My Assignments view, status updates | High | Day 5 | Not Started |
| Project Reporting API | Date filtering, data aggregation, cost rate exclusion | Medium | Day 6 | Not Started |

### 🔄 Regression Tests
*Areas to verify haven't broken with recent changes*

| Area | Last Tested | Next Test Due | Status |
|------|-------------|---------------|--------|
| Estimate creation & copy | Oct 4 | Oct 8 | ✅ Passing |
| Time entry locking | Oct 3 | Oct 10 | ✅ Passing |
| Invoice finalization | Oct 2 | Oct 9 | ⏳ Due soon |
| Expense management | Oct 1 | Oct 8 | ⏳ Due soon |

## Test Execution Schedule

### End of Day Testing
- **Day 1**: Storage.ts fixes, file cleanup verification
- **Day 2**: Vocabulary module - org defaults
- **Day 3**: Vocabulary module - client/project overrides
- **Day 4**: Project assignments backend
- **Day 5**: Project assignments UI
- **Day 6**: Project reporting API
- **Day 7**: Full integration test across all new features

## File Cleanup Tracking

### Files to Archive (Task #3)
*One-time scripts and deprecated files to move to archive folder*

#### PowerShell Scripts (11 files)
- [ ] Configure-SCDP-Metadata-DeviceCode.ps1
- [ ] Configure-SCDP-Metadata-Fixed.ps1
- [ ] Configure-SCDP-Metadata.ps1
- [ ] ContainerMetadata.ps1
- [ ] Fix-Container-Permissions.ps1
- [ ] Register-Container-Type.ps1
- [ ] Register-GraphCLI-With-ContainerType.ps1
- [ ] Simple-Container-Check.ps1
- [ ] Use-GraphCLI-With-Registration.ps1

#### One-Time Recovery Scripts (5 files)
- [ ] server/scripts/recover-time-entries.ts
- [ ] server/scripts/recover-time-entries-production.ts
- [ ] server/scripts/fix-resource-assignments.ts
- [ ] server/scripts/fix-resource-assignments-prod.ts
- [ ] server/add-rate-defaults.ts

#### Test Scripts (3 files)
- [ ] test-azure-setup.cjs
- [ ] test-pending-receipts-workflow.js
- [ ] run-container-migration-verification.js/cjs

#### Redundant Startup Scripts (6 files)
- [ ] dev.sh
- [ ] start-dev.sh
- [ ] run-server.sh
- [ ] start-server.sh
- [ ] run.js
- [ ] run-dev-server.js

#### Corrupted/Backup Files (2 files)
- [ ] server/routes-backup-corrupted.ts
- [ ] server/routes-corrupted.ts

#### Completed Documentation (3 files)
- [ ] Recovery.md
- [ ] PRODUCTION_RECOVERY_INSTRUCTIONS.md
- [ ] commands.md (merge content to replit.md)

#### Excel/Assets Cleanup
- [ ] Review attached_assets folder (100+ images, text files, old exports)
- [ ] Keep recent time_entries Excel file, archive others
- [ ] Archive screenshot images older than 2 weeks

### Archive Folder Structure
```
archive/
├── scripts/
│   ├── powershell/
│   ├── recovery/
│   └── migration/
├── docs/
│   └── recovery/
├── startup-scripts/
└── corrupted/
```

## Historical Test Results

### Week of Sep 28, 2025
- Estimate import/export: ✅ Passing
- Invoice batch finalization: ✅ Passing  
- Time entry bulk import: ⚠️ Minor issues with date formatting (fixed)
- SharePoint container operations: ⏭️ Deferred (not in use)

### Known Issues Archive
*Resolved issues for reference*

1. ✅ **Fixed Oct 5**: TypeScript errors in storage.ts (11 schema mismatches)
2. ✅ **Fixed Sep 30**: Invoice batch unfinalize not reverting milestone status
3. ✅ **Fixed Sep 28**: Expense form currency validation too strict

## Testing Guidelines

### Testing Checklist for Each Feature
- [ ] Unit tests pass (if applicable)
- [ ] API endpoints return correct data
- [ ] Frontend displays data correctly
- [ ] Error handling works properly
- [ ] No console errors
- [ ] No LSP/TypeScript errors
- [ ] Data persists correctly to database
- [ ] Edge cases handled

### When to Flag for Testing
1. **After completing a task** - Mark feature as "Pending Test"
2. **Before marking task complete** - Verify all tests pass
3. **Daily** - Review and test completed items
4. **Weekly** - Full regression test of critical paths

### Test Ownership
- **Agent**: Automated tests, API validation, schema verification
- **User**: UI/UX testing, business logic validation, acceptance criteria
- **Both**: Integration testing, end-to-end workflows

---

*Last Updated: Oct 5, 2025*
*Sprint: Week 1 - Vocabulary & Assignments*
