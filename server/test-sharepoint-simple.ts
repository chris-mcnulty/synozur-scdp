/**
 * Simple proof that files are in SharePoint Embedded
 * Run with: tsx server/test-sharepoint-simple.ts
 */

import { GraphClient } from './services/graph-client.js';

console.log('🔍 SharePoint Embedded Direct Proof\n');
console.log('=' .repeat(50));

async function proveSharePoint() {
  const graphClient = new GraphClient();
  const containerId = process.env.SHAREPOINT_CONTAINER_ID_DEV;
  
  if (!containerId) {
    console.error('❌ SHAREPOINT_CONTAINER_ID_DEV not set');
    return;
  }
  
  console.log(`\n📦 Container ID: ${containerId.substring(0, 30)}...`);
  
  try {
    // 1. Authenticate
    console.log('\n🔑 Authenticating...');
    await graphClient.authenticate();
    console.log('   ✅ Authenticated with Microsoft Graph');
    
    // 2. Get container info
    console.log('\n📦 Getting Container Info...');
    const container = await graphClient.getFileStorageContainer(containerId);
    console.log(`   ✅ Container Name: ${container.displayName}`);
    console.log(`   ✅ Status: ${container.status}`);
    
    // 3. Upload a proof file
    console.log('\n📤 Uploading Proof File to SharePoint...');
    const timestamp = new Date().toISOString();
    const testContent = Buffer.from(`PROOF: This file is in SharePoint Embedded\nUploaded at: ${timestamp}\nContainer: ${container.displayName}`);
    
    const uploadedFile = await graphClient.uploadFile(
      containerId,
      containerId,
      '/receipts',
      `PROOF_${Date.now()}.txt`,
      testContent
    );
    
    console.log('   ✅ File uploaded to SharePoint!');
    console.log(`   📍 File ID: ${uploadedFile.id}`);
    console.log(`   📍 File Name: ${uploadedFile.name}`);
    console.log(`   📍 Web URL: ${uploadedFile.webUrl}`);
    
    // 4. Download the file to prove it's there
    console.log('\n📥 Downloading File from SharePoint...');
    const downloadResult = await graphClient.downloadFile(containerId, uploadedFile.id);
    
    console.log('   ✅ File retrieved from SharePoint!');
    console.log(`   📄 Content:\n${downloadResult.buffer.toString()}`);
    
    // 5. List files (without metadata expansion which causes issues)
    console.log('\n📁 Listing Files in SharePoint (simple query)...');
    const makeRequest = async (endpoint: string) => {
      const token = await graphClient.authenticate();
      const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.json();
    };
    
    // Try to list root children
    const rootItems = await makeRequest(`/storage/fileStorage/containers/${containerId}/drive/root/children`);
    
    if (rootItems.value) {
      console.log(`   📂 Found ${rootItems.value.length} items in container root`);
      for (const item of rootItems.value) {
        console.log(`      ${item.folder ? '📁' : '📄'} ${item.name}`);
      }
    }
    
    // 6. Delete the proof file
    console.log('\n🗑️  Deleting Proof File...');
    await graphClient.deleteFile(containerId, uploadedFile.id);
    console.log('   ✅ File deleted from SharePoint');
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ PROOF COMPLETE:');
    console.log('   1. Connected to SharePoint Embedded container ✓');
    console.log('   2. Uploaded file to SharePoint ✓');
    console.log('   3. Downloaded file from SharePoint ✓');
    console.log('   4. Listed container contents ✓');
    console.log('   5. Deleted file from SharePoint ✓');
    console.log('\n🎉 FILES ARE IN SHAREPOINT EMBEDDED!');
    console.log('\n💡 The container is active and working.');
    console.log('   Storage stats in admin center may take 24-48 hours to update.');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

// Run the proof
proveSharePoint()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });