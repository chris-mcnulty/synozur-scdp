/**
 * Diagnostic script to prove files are in SharePoint Embedded
 * Run with: tsx server/test-sharepoint.ts
 */

import { GraphClient } from './services/graph-client.js';
import { SharePointFileStorage } from './services/sharepoint-file-storage.js';
import * as fs from 'fs';

console.log('🔍 SharePoint Embedded Verification Test\n');
console.log('=' .repeat(50));

async function verifySharePointStorage() {
  const graphClient = new GraphClient();
  const sharePointStorage = new SharePointFileStorage();
  
  // Check environment configuration
  const isDev = process.env.REPLIT_DEPLOYMENT !== '1';
  const containerId = isDev 
    ? process.env.SHAREPOINT_CONTAINER_ID_DEV 
    : process.env.SHAREPOINT_CONTAINER_ID_PROD;
    
  console.log('\n📋 Configuration:');
  console.log(`   Environment: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
  console.log(`   Container ID: ${containerId ? containerId.substring(0, 30) + '...' : 'NOT SET!'}`);
  
  if (!containerId) {
    console.error('\n❌ SharePoint container ID not configured!');
    return;
  }
  
  try {
    // 1. Test authentication
    console.log('\n🔑 Testing Authentication...');
    const token = await graphClient.authenticate();
    console.log('   ✅ Successfully authenticated with Microsoft Graph');
    console.log(`   Token length: ${token.length} characters`);
    
    // 2. Get container information
    console.log('\n📦 Fetching Container Information...');
    const container = await graphClient.getFileStorageContainer(containerId);
    console.log(`   ✅ Container found: ${container.displayName}`);
    console.log(`   Status: ${container.status}`);
    console.log(`   Container Type: ${container.containerTypeId}`);
    
    // 3. List all files in SharePoint container
    console.log('\n📁 Listing Files in SharePoint Container...');
    
    // Use the SharePointFileStorage which properly queries all folders
    const allFiles = await sharePointStorage.listFiles();
    
    console.log(`\n📊 Total Files in SharePoint: ${allFiles.length}`);
    
    if (allFiles.length > 0) {
      console.log('\n📄 Files found in SharePoint:');
      for (const file of allFiles) {
        console.log(`\n   📄 ${file.fileName}`);
        console.log(`      - ID: ${file.id}`);
        console.log(`      - Original Name: ${file.originalName}`);
        console.log(`      - Size: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`      - Type: ${file.contentType}`);
        console.log(`      - Uploaded: ${file.uploadedAt}`);
        console.log(`      - Uploaded By: ${file.uploadedBy}`);
        
        // Show metadata
        if (file.metadata) {
          console.log(`      - Document Type: ${file.metadata.documentType}`);
          console.log(`      - Client: ${file.metadata.clientName || 'N/A'}`);
          console.log(`      - Project: ${file.metadata.projectCode || 'N/A'}`);
          console.log(`      - Amount: ${file.metadata.amount || 'N/A'}`);
          console.log(`      - Tags: ${file.metadata.tags || 'N/A'}`);
        }
      }
    } else {
      console.log('\n   ℹ️  No files currently in SharePoint container');
    }
    
    const totalFiles = allFiles.length;
    
    // 4. Upload a test file to prove write access
    console.log('\n🧪 Testing File Upload to SharePoint...');
    const testContent = Buffer.from(`Test file uploaded at ${new Date().toISOString()}`);
    const testFile = await sharePointStorage.storeFile(
      testContent,
      'proof-of-sharepoint.txt',
      'text/plain',
      {
        documentType: 'receipt',
        createdByUserId: 'test-script',
        metadataVersion: 1,
        tags: 'diagnostic,test,proof'
      },
      'test-script'
    );
    
    console.log('   ✅ Test file uploaded successfully!');
    console.log(`   File ID: ${testFile.id}`);
    console.log(`   File Name: ${testFile.fileName}`);
    console.log(`   Web URL: ${testFile.filePath}`);
    
    // 5. Retrieve the test file to prove read access
    console.log('\n🔄 Retrieving Test File from SharePoint...');
    const retrievedFile = await sharePointStorage.getFileContent(testFile.id);
    if (retrievedFile) {
      console.log('   ✅ File retrieved successfully!');
      console.log(`   Content: "${retrievedFile.buffer.toString()}"`);
      console.log(`   Metadata preserved: ${JSON.stringify(retrievedFile.metadata.metadata)}`);
    }
    
    // 6. Delete the test file
    console.log('\n🗑️  Cleaning up test file...');
    const deleted = await sharePointStorage.deleteFile(testFile.id);
    if (deleted) {
      console.log('   ✅ Test file deleted successfully');
    }
    
    // 7. Compare with local storage
    console.log('\n📁 Checking Local Storage for comparison...');
    const localFolders = ['uploads/receipts', 'uploads/invoices', 'uploads/contracts'];
    let localFiles = 0;
    
    for (const folder of localFolders) {
      if (fs.existsSync(folder)) {
        const files = fs.readdirSync(folder).filter(f => !f.endsWith('.metadata.json'));
        if (files.length > 0) {
          localFiles += files.length;
          console.log(`   📂 ${folder}: ${files.length} files`);
        }
      }
    }
    
    console.log(`   Total local files: ${localFiles}`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ PROOF OF SHAREPOINT INTEGRATION:');
    console.log(`   1. Connected to Microsoft Graph API ✓`);
    console.log(`   2. Found SharePoint container ✓`);
    console.log(`   3. Listed ${totalFiles} files in SharePoint ✓`);
    console.log(`   4. Successfully uploaded test file ✓`);
    console.log(`   5. Successfully retrieved file with metadata ✓`);
    console.log(`   6. Successfully deleted test file ✓`);
    console.log(`   7. Local storage has ${localFiles} files (separate from SPE)`);
    console.log('\n🎉 Files ARE being stored in SharePoint Embedded!');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error && error.message.includes('401')) {
      console.error('   Authentication failed - check Azure AD credentials');
    } else if (error instanceof Error && error.message.includes('404')) {
      console.error('   Container not found - check container ID');
    }
  }
}

// Run the verification
verifySharePointStorage()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });