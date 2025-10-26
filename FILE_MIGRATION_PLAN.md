# File Migration Plan: Local Storage → SharePoint Embedded

## Current State (October 26, 2025)

**File Storage Strategy:** Smart Routing (Document-type-based)

### Routing Rules

**Business Documents → Local Storage:**
- ✅ **Receipts** - Immediate access for expense processing
- ✅ **Invoices** - Critical financial documents
- ✅ **Contracts** - Important legal documents

**Debug/Testing Documents → SharePoint Embedded:**
- 🔍 **Statements of Work (SOWs)** - For Microsoft troubleshooting
- 🔍 **Estimates** - For testing SharePoint integration
- 🔍 **Change Orders** - For testing SharePoint integration
- 🔍 **Reports** - For testing SharePoint integration

### Why Smart Routing?

SharePoint Embedded requires container type permission registration that is currently blocked. To balance business continuity with Microsoft troubleshooting:

1. ✅ **Business continuity** - Critical documents (receipts, invoices, contracts) work immediately
2. ✅ **Parallel troubleshooting** - Non-critical documents continue testing SharePoint for Microsoft support
3. ✅ **Migration tracking** - All locally-stored files are tagged with `LOCAL_STORAGE` for future migration
4. ✅ **Zero data loss** - Files are safely stored locally until SharePoint is fully configured
5. ✅ **Error visibility** - SharePoint failures for debug docs surface immediately for troubleshooting

## File Storage Locations

### Local Storage
- **Directory**: `/uploads/`
- **Structure**:
  ```
  /uploads/
    ├── receipts/
    ├── invoices/
    ├── contracts/
    ├── statements/
    ├── estimates/
    ├── change_orders/
    └── reports/
  ```
- **Metadata**: Stored as `.metadata.json` files alongside each file
- **Tagging**: Files stored locally have `tags: "LOCAL_STORAGE"` in metadata

### SharePoint Embedded (Target)
- **Container ID (DEV)**: `b!4-B8POhyAEuzqyfSZCOTAWPs9wy5VwdHhzpPKzPNOZpnsrftuTb_TqkUQRRk8U_L`
- **Container ID (PROD)**: TBD
- **Container Type**: `358aba7d-bb55-4ce0-a08d-e51f03d5edf1` (PAYGO)
- **Folder Structure**: `/receipts`, `/invoices`, `/contracts`, etc.

## Migration Steps (When SharePoint is Ready)

### Prerequisites

1. **SharePoint Embedded Container Type Permissions Registered**
   - Follow steps in `SHAREPOINT_PERMISSIONS_SETUP.md`
   - Verify with test upload at `/admin/sharepoint`

2. **Environment Variables Configured**
   ```bash
   SHAREPOINT_CONTAINER_ID_DEV=b!4-B8POhyAEuzqyfSZCOTAWPs9wy5VwdHhzpPKzPNOZpnsrftuTb_TqkUQRRk8U_L
   SHAREPOINT_CONTAINER_ID_PROD=<production-container-id>
   ```

### Migration Script

Create a migration script to transfer files from local storage to SharePoint:

```typescript
// scripts/migrate-local-to-sharepoint.ts
import { localFileStorage } from './server/services/local-file-storage.js';
import { SharePointFileStorage } from './server/services/sharepoint-file-storage.js';

async function migrateLocalFilesToSharePoint() {
  const sharePointStorage = new SharePointFileStorage();
  
  // Get all files stored locally
  const localFiles = await localFileStorage.listFiles();
  const filesToMigrate = localFiles.filter(f => 
    f.metadata?.tags?.includes('LOCAL_STORAGE')
  );
  
  console.log(`Found ${filesToMigrate.length} files to migrate`);
  
  const migrationResults = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (const file of filesToMigrate) {
    try {
      console.log(`Migrating: ${file.originalName} (${file.id})`);
      
      // Get file content from local storage
      const fileData = await localFileStorage.getFileContent(file.id);
      
      if (!fileData) {
        console.error(`File not found: ${file.id}`);
        migrationResults.failed.push({ file, reason: 'File not found' });
        continue;
      }
      
      // Remove LOCAL_STORAGE tag from metadata
      const cleanedMetadata = {
        ...file.metadata,
        tags: file.metadata.tags?.replace(/,?LOCAL_STORAGE,?/g, '').trim()
      };
      
      // Upload to SharePoint
      const uploadedFile = await sharePointStorage.storeFile(
        fileData.buffer,
        file.originalName,
        file.contentType,
        cleanedMetadata,
        file.uploadedBy,
        file.id // Preserve original file ID
      );
      
      console.log(`✅ Migrated: ${file.originalName}`);
      migrationResults.success.push({ file, sharePointId: uploadedFile.id });
      
      // Optional: Delete from local storage after successful migration
      // await localFileStorage.deleteFile(file.id);
      
    } catch (error) {
      console.error(`❌ Failed to migrate ${file.originalName}:`, error);
      migrationResults.failed.push({ 
        file, 
        reason: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  console.log('\n=== Migration Summary ===');
  console.log(`Total files: ${filesToMigrate.length}`);
  console.log(`✅ Success: ${migrationResults.success.length}`);
  console.log(`❌ Failed: ${migrationResults.failed.length}`);
  console.log(`⊘ Skipped: ${migrationResults.skipped.length}`);
  
  return migrationResults;
}

// Run migration
migrateLocalFilesToSharePoint()
  .then((results) => {
    console.log('\n✅ Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
```

### Running the Migration

1. **Verify SharePoint is working:**
   ```bash
   # Test upload via admin diagnostics page
   # Navigate to /admin/sharepoint and click "Test File Upload"
   ```

2. **Run migration script:**
   ```bash
   npm run migrate-files
   # Or manually:
   tsx scripts/migrate-local-to-sharepoint.ts
   ```

3. **Verify migration:**
   ```bash
   # Check file counts in admin diagnostics
   # Navigate to /admin/files and verify all files are accessible
   ```

4. **Clean up local files (optional):**
   ```bash
   # Only after verifying all files are in SharePoint
   # Delete local files manually or via script
   ```

## Monitoring Migration Status

### Admin Dashboard
Navigate to `/admin/files` to see:
- Total files in local storage
- Total files in SharePoint
- Files awaiting migration (tagged with `LOCAL_STORAGE`)

### API Endpoint
```bash
GET /api/files/storage-info
```

Response:
```json
{
  "activeStorage": "Hybrid (SharePoint-first with local fallback)",
  "localFileCount": 45,
  "sharePointFileCount": 12,
  "filesAwaitingMigration": 45,
  "containerIdConfigured": true,
  "sharePointHealthy": false
}
```

## Migration Verification

After migration, verify:

1. **All files accessible:**
   - Navigate to `/admin/files`
   - Verify all files are listed
   - Download a few files to ensure they're readable

2. **Metadata preserved:**
   - Check that all metadata fields are intact
   - Verify project/client associations
   - Confirm tags and amounts are correct

3. **File counts match:**
   - Compare local file count before migration
   - Verify SharePoint file count after migration
   - Ensure `filesAwaitingMigration` = 0

4. **Copilot indexing enabled:**
   - Files in SharePoint Embedded are automatically indexed by Microsoft Graph
   - Copilot can now access and analyze your documents

## Rollback Plan

If migration fails or issues arise:

1. **Files remain in local storage** - Original files are NOT deleted during migration
2. **Hybrid storage continues to work** - System automatically falls back to local files
3. **No data loss** - Both local and SharePoint files coexist safely
4. **Manual verification** - Review failed migrations and retry individually

## Timeline

1. **Now (October 26, 2025)**: Hybrid storage active, users can upload receipts
2. **Next**: Fix SharePoint Embedded permissions (see `SHAREPOINT_PERMISSIONS_SETUP.md`)
3. **After SharePoint is working**: Run migration script to transfer local files
4. **Final**: Remove local storage fallback (optional, for production hardening)

## Notes

- **Zero downtime**: Migration can happen while system is running
- **Safe fallback**: If SharePoint fails post-migration, hybrid storage automatically uses local files
- **Incremental migration**: Can migrate files in batches if needed
- **Audit trail**: All migrations are logged with success/failure status
- **Preserve file IDs**: Migration script maintains original file IDs for database consistency

## Questions?

See related documentation:
- `SHAREPOINT_PERMISSIONS_SETUP.md` - How to fix SharePoint permissions
- `AZURE_APP_PERMISSIONS_SETUP.md` - Azure AD app configuration
- `replit.md` - Overall system architecture
