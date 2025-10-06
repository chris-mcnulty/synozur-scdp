# Vocabulary Customization Testing Guide

## Prerequisites
1. Start the application by clicking the **Run** button in Replit
2. Login with: chris.mcnulty@synozur.com / demo123 (do NOT use SSO)

## Test 1: Organization-Level Defaults

### Setup Organization Vocabulary
1. Navigate to **System Settings** page (`/system-settings`)
2. Scroll to the **Vocabulary Management** section
3. Set the following terms:
   - Epic Term: `Phase`
   - Stage Term: `Sprint`
   - Activity Term: `Task`
   - Workstream Term: `Track`
4. Click **Save Vocabulary Settings**

### Verify
- ✓ Success message appears
- ✓ Refresh the page - values persist
- ✓ API test: `GET /api/vocabulary/context` returns:
  ```json
  {
    "epic": "Phase",
    "stage": "Sprint",
    "activity": "Task",
    "workstream": "Track"
  }
  ```

## Test 2: Client-Level Overrides

### Setup Client Overrides
1. Navigate to **Clients** page (`/clients`)
2. Click on any client to view details
3. Click **Edit** button
4. In **Vocabulary Customization** section, set:
   - Epic Term: `Theme`
   - Stage Term: `Wave`
   - Leave Activity and Workstream **blank** (to inherit from org)
5. Click **Save Changes**
6. Note the client ID from the URL (e.g., `/clients/123` → ID is `123`)

### Verify
- ✓ Success message appears
- ✓ Refresh page, click Edit - shows `Theme` and `Wave`
- ✓ API test: `GET /api/vocabulary/context?clientId={ID}` returns:
  ```json
  {
    "epic": "Theme",        // Overridden at client level
    "stage": "Wave",         // Overridden at client level
    "activity": "Task",      // Inherited from organization
    "workstream": "Track"    // Inherited from organization
  }
  ```

## Test 3: Project-Level Overrides

### Setup Project Overrides
1. Navigate to **Projects** page (`/projects`)
2. Find a project that belongs to the client from Test 2
3. Click the **Edit** button (pencil icon)
4. In **Vocabulary Customization** section, set:
   - Epic Term: `Milestone Group`
   - Leave Stage, Activity, and Workstream **blank**
5. Click **Save Changes**
6. Note the project ID

### Verify
- ✓ Success message appears
- ✓ Refresh page, click Edit - shows `Milestone Group`
- ✓ API test: `GET /api/vocabulary/context?projectId={ID}` returns:
  ```json
  {
    "epic": "Milestone Group",  // Overridden at project level
    "stage": "Wave",             // Inherited from client
    "activity": "Task",          // Inherited from organization (via client)
    "workstream": "Track"        // Inherited from organization (via client)
  }
  ```

## Test 4: Cascading Logic

This test verifies the three-tier cascade: **Project → Client → Organization**

### Scenario 1: Full Cascade
Using the project from Test 3:
- `epic` comes from **project** level (`Milestone Group`)
- `stage` comes from **client** level (`Wave`)
- `activity` comes from **organization** level (`Task`)
- `workstream` comes from **organization** level (`Track`)

### Scenario 2: Clear Project Overrides
1. Edit the project from Test 3
2. Clear the Epic field (delete `Milestone Group`)
3. Save changes
4. API test: `GET /api/vocabulary/context?projectId={ID}` should now return:
   ```json
   {
     "epic": "Theme",      // Now inherited from client (not project)
     "stage": "Wave",      // Still from client
     "activity": "Task",   // Still from organization
     "workstream": "Track" // Still from organization
   }
   ```

### Scenario 3: Clear Client Overrides
1. Edit the client from Test 2
2. Clear both Epic and Stage fields
3. Save changes
4. API test: `GET /api/vocabulary/context?clientId={ID}` should return:
   ```json
   {
     "epic": "Phase",      // Now all from organization
     "stage": "Sprint",
     "activity": "Task",
     "workstream": "Track"
   }
   ```

## Test 5: Create New Items with Overrides

### Test Creating a New Client
1. Create a new client with vocabulary overrides set
2. Verify overrides save correctly
3. Create a project under this client
4. Verify the project inherits client's vocabulary

### Test Creating a New Project
1. Create a new project with vocabulary overrides
2. Verify overrides save correctly
3. Check that vocabulary context API returns project's terms

## Test 6: Edge Cases

### Empty Organization Defaults
1. Go to System Settings
2. Clear all organization vocabulary fields
3. Save
4. API test: `GET /api/vocabulary/context` should return system defaults:
   ```json
   {
     "epic": "Epic",
     "stage": "Stage",
     "activity": "Activity/Milestone",
     "workstream": "Workstream"
   }
   ```

### Invalid JSON Handling
The system should gracefully handle any corrupted JSON in the database:
- If parsing fails, it falls back to the next level in the cascade
- No errors should be shown to the user

### Null vs Empty String
- Leaving a field **blank** in the UI stores `null` or empty object
- This correctly triggers inheritance from the next level
- Saving with values stores proper JSON string

## Expected Behaviors

### Form Behavior
- ✓ Fields show current override values when editing
- ✓ Fields show as blank when inheriting from parent level
- ✓ Saving blank fields properly clears overrides
- ✓ Form doesn't overwrite user edits when query refetches

### API Behavior
- ✓ `/api/vocabulary/organization` GET returns org defaults
- ✓ `/api/vocabulary/organization` PUT updates org defaults
- ✓ `/api/vocabulary/context` returns effective vocabulary based on context
- ✓ Context endpoint respects cascade: projectId > clientId > organization

### Database Behavior
- ✓ `organizations.vocabulary_defaults` stores JSON string
- ✓ `clients.vocabulary_overrides` stores JSON string or NULL
- ✓ `projects.vocabulary_overrides` stores JSON string or NULL
- ✓ Empty overrides are stored as NULL (not empty JSON)

## Troubleshooting

### Override not taking effect
1. Check the JSON is valid in the database
2. Verify the ID is correct in API calls
3. Ensure you're testing with the right client/project relationship

### Form values not persisting
1. Check browser console for errors
2. Verify the save operation returns success
3. Check database directly to see if JSON was stored

### API returns wrong vocabulary
1. Verify the cascade logic by checking each level
2. Test with `?projectId=`, `?clientId=`, and no params separately
3. Check that client/project relationships are correct in database

## Success Criteria

All tests pass when:
- ✅ Organization defaults save and load correctly
- ✅ Client overrides save and properly override organization defaults
- ✅ Project overrides save and properly override client/organization
- ✅ Cascade works correctly (Project → Client → Org → System defaults)
- ✅ Clearing overrides properly restores inheritance
- ✅ API returns correct vocabulary based on context parameters
- ✅ UI forms handle JSON parsing/stringifying transparently
- ✅ No errors occur with empty, null, or malformed data
