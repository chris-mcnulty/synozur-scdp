#!/usr/bin/env node
/**
 * Test SharePoint upload to diagnose the exact error
 */

import { SharePointFileStorage } from './server/services/sharepoint-file-storage.js';

async function testUpload() {
  console.log('=== SharePoint Upload Diagnostic Test ===\n');
  
  const storage = new SharePointFileStorage();
  
  // Create a small test file
  const testBuffer = Buffer.from('Test receipt file', 'utf-8');
  
  const metadata = {
    documentType: 'receipt',
    clientId: 'test-client',
    clientName: 'Test Client',
    projectId: 'test-project',
    projectCode: 'TEST',
    amount: 100.00,
    createdByUserId: 'test-user',
    metadataVersion: 1,
    tags: 'test,receipt'
  };
  
  console.log('Environment check:');
  console.log('- Container ID (Dev):', process.env.SHAREPOINT_CONTAINER_ID_DEV ? 'SET' : 'MISSING');
  console.log('- Container ID (Prod):', process.env.SHAREPOINT_CONTAINER_ID_PROD ? 'SET' : 'MISSING');
  console.log('- Azure Client ID:', process.env.AZURE_CLIENT_ID ? 'SET' : 'MISSING');
  console.log('- Auth method:', process.env.AZURE_CERTIFICATE_PRIVATE_KEY ? 'Certificate' : process.env.AZURE_CLIENT_SECRET ? 'Secret' : 'MISSING');
  console.log('- Environment:', process.env.NODE_ENV || 'development');
  console.log();
  
  try {
    console.log('Attempting test upload...\n');
    const result = await storage.storeFile(
      testBuffer,
      'test-receipt.txt',
      'text/plain',
      metadata,
      'test-user'
    );
    
    console.log('✅ Upload successful!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log('❌ Upload failed with error:\n');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    if (error.stack) {
      console.log('\nStack trace:');
      console.log(error.stack.split('\n').slice(0, 10).join('\n'));
    }
    
    // Try to extract more details
    if (error.response) {
      console.log('\nResponse details:', error.response);
    }
    if (error.statusCode) {
      console.log('Status code:', error.statusCode);
    }
    if (error.code) {
      console.log('Error code:', error.code);
    }
    
    process.exit(1);
  }
}

testUpload();
