/**
 * One-time migration script to move files from local storage to SharePoint Embedded
 * Run with: tsx server/migrate-files-to-sharepoint.ts
 */

import { LocalFileStorage } from './services/local-file-storage.js';
import { SharePointFileStorage } from './services/sharepoint-file-storage.js';

async function migrateFilesToSharePoint() {
  console.log('🔄 Starting file migration from local storage to SharePoint...\n');

  const localStorage = new LocalFileStorage();
  const sharePointStorage = new SharePointFileStorage();

  try {
    // Get all files from local storage
    const localFiles = await localStorage.listFiles();
    console.log(`📁 Found ${localFiles.length} files in local storage\n`);

    if (localFiles.length === 0) {
      console.log('✅ No files to migrate. Local storage is empty.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // Migrate each file
    for (const file of localFiles) {
      try {
        console.log(`\n📤 Migrating: ${file.originalName}`);
        console.log(`   Type: ${file.metadata.documentType}`);
        console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);

        // Get file content from local storage
        const fileContent = await localStorage.getFileContent(file.id);
        
        if (!fileContent) {
          console.error(`   ❌ Could not read file content`);
          errorCount++;
          continue;
        }

        // Upload to SharePoint with same metadata
        const uploadedFile = await sharePointStorage.storeFile(
          fileContent.buffer,
          file.originalName,
          file.contentType,
          file.metadata,
          file.uploadedBy,
          file.id // Preserve the file ID
        );

        console.log(`   ✅ Uploaded to SharePoint: ${uploadedFile.id}`);
        
        // Delete from local storage after successful upload
        const deleted = await localStorage.deleteFile(file.id);
        if (deleted) {
          console.log(`   🗑️  Removed from local storage`);
        }

        successCount++;
      } catch (error) {
        console.error(`   ❌ Migration failed:`, error instanceof Error ? error.message : error);
        errorCount++;
      }
    }

    console.log(`\n\n✨ Migration Summary:`);
    console.log(`   ✅ Successfully migrated: ${successCount} files`);
    console.log(`   ❌ Failed: ${errorCount} files`);
    
    if (successCount > 0) {
      console.log(`\n💡 Tip: Check SharePoint admin center - it may take 24-48 hours for storage stats to update`);
    }

  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateFilesToSharePoint()
  .then(() => {
    console.log('\n✅ Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration error:', error);
    process.exit(1);
  });
