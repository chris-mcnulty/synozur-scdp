#!/usr/bin/env node

/**
 * Azure AD & SharePoint Configuration Test Script
 * 
 * This script validates the complete setup for SCDP expense attachment system.
 * Run this after completing the Azure AD and SharePoint setup to verify everything works.
 * 
 * Usage: node test-azure-setup.js
 */

const fs = require('fs');
const path = require('path');

// Helper function to determine base URL for API calls
function getBaseUrl() {
  // Check if explicit base URL is provided
  if (process.env.TEST_BASE_URL) {
    return process.env.TEST_BASE_URL;
  }
  
  // For Replit deployments
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  
  // For production domains
  if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DOMAINS) {
    return 'https://scdp.synozur.com';
  }
  
  // Default to localhost for development
  return 'http://localhost:5000';
}

// Helper function to check if we're in the correct directory
function validateProjectStructure() {
  const requiredFiles = [
    'server/auth/entra-config.ts',
    'server/services/graph-client.ts',
    'package.json'
  ];
  
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
  if (missingFiles.length > 0) {
    console.log('❌ Error: Not in SCDP project directory or missing files:');
    missingFiles.forEach(file => console.log(`   - ${file}`));
    console.log('\nPlease run this script from the SCDP project root directory.');
    process.exit(1);
  }
}

// Test environment variables
function testEnvironmentVariables() {
  console.log('🔧 Testing Environment Variables...\n');
  
  const requiredEnvVars = {
    'AZURE_CLIENT_ID': 'Azure AD Application (Client) ID',
    'AZURE_TENANT_ID': 'Azure AD Directory (Tenant) ID', 
    'AZURE_CLIENT_SECRET': 'Azure AD Client Secret',
    'SHAREPOINT_SITE_ID': 'SharePoint Site ID',
    'SHAREPOINT_DRIVE_ID': 'SharePoint Drive ID (Document Library)'
  };
  
  const optionalEnvVars = {
    'AZURE_REDIRECT_URI': 'Custom redirect URI (optional)',
    'POST_LOGOUT_REDIRECT_URI': 'Custom logout redirect URI (optional)',
    'SHAREPOINT_SITE_URL': 'SharePoint site URL for reference (optional)'
  };
  
  let allRequired = true;
  
  console.log('Required Environment Variables:');
  Object.entries(requiredEnvVars).forEach(([envVar, description]) => {
    const value = process.env[envVar];
    if (value) {
      console.log(`   ✅ ${envVar}: Set (${value.length} characters)`);
    } else {
      console.log(`   ❌ ${envVar}: Missing - ${description}`);
      allRequired = false;
    }
  });
  
  console.log('\nOptional Environment Variables:');
  Object.entries(optionalEnvVars).forEach(([envVar, description]) => {
    const value = process.env[envVar];
    if (value) {
      console.log(`   ✅ ${envVar}: Set - ${value}`);
    } else {
      console.log(`   ℹ️  ${envVar}: Not set - ${description}`);
    }
  });
  
  if (!allRequired) {
    console.log('\n❌ Some required environment variables are missing.');
    console.log('Please set all required variables and run the test again.');
    console.log('See docs/azure-sharepoint-setup.md for configuration details.\n');
    return false;
  }
  
  console.log('\n✅ All required environment variables are configured.\n');
  return true;
}

// Test MSAL configuration by validating environment variables directly
async function testMSALConfiguration() {
  console.log('🔐 Testing MSAL Configuration...\n');
  
  try {
    // Check if all required Azure environment variables are present
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    
    const hasClientId = !!clientId;
    const hasTenantId = !!tenantId;
    const hasClientSecret = !!clientSecret;
    const configured = hasClientId && hasTenantId && hasClientSecret;
    
    console.log('   ✅ Azure environment variables validation complete');
    console.log(`   ✅ Azure AD configured: ${configured ? 'Yes' : 'No'}`);
    console.log(`   ✅ Client ID present: ${hasClientId ? 'Yes' : 'No'}`);
    console.log(`   ✅ Tenant ID present: ${hasTenantId ? 'Yes' : 'No'}`);
    console.log(`   ✅ Client Secret present: ${hasClientSecret ? 'Yes' : 'No'}`);
    
    if (configured) {
      const authority = `https://login.microsoftonline.com/${tenantId}`;
      console.log(`   ✅ Authority: ${authority}`);
      
      // Test basic application endpoint connectivity
      try {
        const baseUrl = getBaseUrl();
        console.log(`   🔄 Testing application connectivity at: ${baseUrl}`);
        const response = await fetch(`${baseUrl}/api/health`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          console.log('   ✅ Application is running and accessible');
        } else {
          console.log(`   ⚠️  Application responded with status: ${response.status}`);
        }
      } catch (connectError) {
        console.log('   ⚠️  Application may not be running - start with: npm run dev');
      }
    }
    
    return configured;
  } catch (error) {
    console.log(`   ❌ MSAL configuration test failed: ${error.message}`);
    return false;
  }
}

// Test Microsoft Graph authentication via direct API call
async function testGraphAuthentication() {
  console.log('🌐 Testing Microsoft Graph Authentication...\n');
  
  try {
    console.log('   🔄 Testing Graph authentication with client credentials...');
    
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    
    if (!clientId || !tenantId || !clientSecret) {
      console.log('   ❌ Missing required Azure environment variables');
      return false;
    }
    
    // Get access token using client credentials flow
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': clientId,
      'client_secret': clientSecret,
      'scope': 'https://graph.microsoft.com/.default'
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });
    
    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      console.log('   ✅ Graph authentication successful');
      console.log(`   ✅ Token obtained: ${tokenData.access_token.length} characters`);
      console.log(`   ✅ Token type: ${tokenData.token_type}`);
      console.log(`   ✅ Expires in: ${tokenData.expires_in} seconds`);
      
      // Validate token format (should be JWT)
      const tokenParts = tokenData.access_token.split('.');
      if (tokenParts.length === 3) {
        console.log('   ✅ Token format is valid (JWT structure)');
      }
      
      return true;
    } else {
      const errorData = await tokenResponse.json();
      console.log(`   ❌ Graph authentication failed: ${errorData.error}`);
      console.log(`   ❌ Error description: ${errorData.error_description}`);
      
      // Provide specific guidance based on error
      if (errorData.error === 'invalid_client') {
        console.log('   💡 This suggests invalid client ID or client secret.');
      } else if (errorData.error === 'unauthorized_client') {
        console.log('   💡 This suggests the app registration needs admin consent.');
      } else if (errorData.error_description?.includes('AADSTS7000215')) {
        console.log('   💡 This suggests invalid client secret.');
      }
      
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Graph authentication test failed: ${error.message}`);
    console.log('   💡 Check your network connection and Azure configuration');
    return false;
  }
}

// Test SharePoint connectivity via direct Graph API calls
async function testSharePointConnectivity() {
  console.log('📁 Testing SharePoint Connectivity...\n');
  
  try {
    console.log('   🔄 Testing SharePoint site and drive access...');
    
    const siteId = process.env.SHAREPOINT_SITE_ID;
    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    
    if (!siteId || !driveId) {
      console.log('   ❌ Missing SharePoint configuration (SHAREPOINT_SITE_ID or SHAREPOINT_DRIVE_ID)');
      return false;
    }
    
    // First get an access token (reuse auth logic)
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': clientId,
      'client_secret': clientSecret,
      'scope': 'https://graph.microsoft.com/.default'
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });
    
    if (!tokenResponse.ok) {
      console.log('   ❌ Failed to get access token for SharePoint test');
      return false;
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    console.log('   ✅ Access token obtained for SharePoint testing');
    console.log(`   ✅ Site ID: ${siteId.substring(0, 20)}...`);
    console.log(`   ✅ Drive ID: ${driveId.substring(0, 20)}...`);
    
    let siteAccessible = false;
    let driveAccessible = false;
    let errorDetails = null;
    
    // Test 1: Access the SharePoint site
    try {
      const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (siteResponse.ok) {
        const siteData = await siteResponse.json();
        console.log(`   ✅ Site Access: Success (${siteData.displayName})`);
        siteAccessible = true;
      } else {
        const errorText = await siteResponse.text();
        console.log(`   ❌ Site Access: Failed (HTTP ${siteResponse.status})`);
        errorDetails = errorText;
      }
    } catch (siteError) {
      console.log(`   ❌ Site Access: Error - ${siteError.message}`);
      errorDetails = siteError.message;
    }
    
    // Test 2: Access the SharePoint drive (only if site access works)
    if (siteAccessible) {
      try {
        const driveResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (driveResponse.ok) {
          const driveData = await driveResponse.json();
          console.log(`   ✅ Drive Access: Success (${driveData.name})`);
          driveAccessible = true;
        } else {
          const errorText = await driveResponse.text();
          console.log(`   ❌ Drive Access: Failed (HTTP ${driveResponse.status})`);
          errorDetails = errorText;
        }
      } catch (driveError) {
        console.log(`   ❌ Drive Access: Error - ${driveError.message}`);
        errorDetails = driveError.message;
      }
    }
    
    // Provide specific guidance based on errors
    if (errorDetails) {
      if (errorDetails.includes('Forbidden') || errorDetails.includes('403')) {
        console.log('   💡 This suggests permission issues. Check Sites.Selected assignment.');
        console.log('   💡 Use: POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions');
      } else if (errorDetails.includes('NotFound') || errorDetails.includes('404')) {
        console.log('   💡 This suggests incorrect Site ID or Drive ID.');
        console.log('   💡 Verify IDs using Graph Explorer or PnP PowerShell.');
      } else if (errorDetails.includes('Unauthorized') || errorDetails.includes('401')) {
        console.log('   💡 This suggests authentication issues. Check app registration permissions.');
      }
    }
    
    const success = siteAccessible && driveAccessible;
    
    if (success) {
      console.log('   🎉 SharePoint connectivity test passed!');
    }
    
    return success;
  } catch (error) {
    console.log(`   ❌ SharePoint connectivity test failed: ${error.message}`);
    console.log('   💡 Check your Azure and SharePoint configuration');
    return false;
  }
}

// Test file operations via direct Graph API calls
async function testFileOperations() {
  console.log('📤 Testing File Operations...\n');
  
  try {
    console.log('   🔄 Testing file operations capabilities...');
    
    const driveId = process.env.SHAREPOINT_DRIVE_ID;
    
    if (!driveId) {
      console.log('   ❌ Missing SHAREPOINT_DRIVE_ID environment variable');
      return false;
    }
    
    // Get access token (reuse auth logic)
    const clientId = process.env.AZURE_CLIENT_ID;
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenParams = new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': clientId,
      'client_secret': clientSecret,
      'scope': 'https://graph.microsoft.com/.default'
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });
    
    if (!tokenResponse.ok) {
      console.log('   ❌ Failed to get access token for file operations test');
      return false;
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Test 1: List items in the Documents library root
    try {
      const listResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (listResponse.ok) {
        const listData = await listResponse.json();
        console.log(`   ✅ Successfully listed ${listData.value.length} items in Documents library`);
        
        if (listData.value.length > 0) {
          const sampleItem = listData.value[0];
          console.log(`   ✅ Sample item: "${sampleItem.name}" (${sampleItem.folder ? 'folder' : 'file'})`);
        }
        
        // Check if Receipts folder exists
        const receiptsFolder = listData.value.find(item => item.name === 'Receipts' && item.folder);
        if (receiptsFolder) {
          console.log('   ✅ Receipts folder: Already exists');
        } else {
          console.log('   ℹ️ Receipts folder: Will be auto-created by application when needed');
        }
      } else {
        const errorText = await listResponse.text();
        console.log(`   ❌ File listing failed: HTTP ${listResponse.status}`);
        
        if (listResponse.status === 403) {
          console.log('   💡 This suggests insufficient permissions for file operations.');
          console.log('      Check that Sites.Selected permission is assigned to your site.');
        }
        return false;
      }
    } catch (listError) {
      console.log(`   ❌ File listing error: ${listError.message}`);
      return false;
    }
    
    // Test 2: Test folder creation capability (create a test folder and delete it)
    try {
      const testFolderName = `test-folder-${Date.now()}`;
      
      // Create test folder
      const createResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: testFolderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename'
        })
      });
      
      if (createResponse.ok) {
        const createdFolder = await createResponse.json();
        console.log('   ✅ Folder creation: Success');
        
        // Clean up: delete the test folder
        const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${createdFolder.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (deleteResponse.ok || deleteResponse.status === 204) {
          console.log('   ✅ Folder deletion: Success (cleanup completed)');
        } else {
          console.log('   ⚠️ Folder deletion: Failed (manual cleanup may be needed)');
        }
      } else {
        console.log(`   ❌ Folder creation failed: HTTP ${createResponse.status}`);
        return false;
      }
    } catch (folderError) {
      console.log(`   ❌ Folder operations error: ${folderError.message}`);
      return false;
    }
    
    console.log('   🎉 File operations test completed successfully!');
    return true;
  } catch (error) {
    console.log(`   ❌ File operations test failed: ${error.message}`);
    console.log('   💡 Check your Azure and SharePoint configuration');
    return false;
  }
}

// Generate configuration report
function generateConfigReport(results) {
  console.log('📊 Configuration Report\n');
  console.log('='.repeat(50));
  
  const testResults = [
    { name: 'Environment Variables', status: results.env },
    { name: 'MSAL Configuration', status: results.msal },
    { name: 'Graph Authentication', status: results.auth },
    { name: 'SharePoint Connectivity', status: results.sharepoint },
    { name: 'File Operations', status: results.fileOps }
  ];
  
  testResults.forEach(test => {
    const status = test.status ? '✅ PASS' : '❌ FAIL';
    console.log(`${test.name.padEnd(25)} ${status}`);
  });
  
  console.log('='.repeat(50));
  
  const passedTests = testResults.filter(test => test.status).length;
  const totalTests = testResults.length;
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Your Azure AD and SharePoint configuration is ready.');
    console.log('🚀 You can now use the expense attachment features in SCDP.');
  } else {
    console.log(`⚠️  ${passedTests}/${totalTests} tests passed. Please review failed tests above.`);
    console.log('📖 See docs/azure-sharepoint-setup.md for troubleshooting guidance.');
  }
  
  console.log('\n📋 Next Steps:');
  if (passedTests === totalTests) {
    console.log('   1. Test expense attachment upload in the SCDP application');
    console.log('   2. Configure monitoring and alerts');
    console.log('   3. Set up secret rotation schedule');
    console.log('   4. Train users on new functionality');
    console.log('\n🚀 Ready for Production:');
    console.log('   - All Azure AD and SharePoint configurations are working');
    console.log('   - Sites.Selected permission is properly assigned');
    console.log('   - Documents library is accessible with /Receipts folder support');
    console.log('   - File operations (create, read, delete) are functional');
  } else {
    console.log('   1. Fix the failed configuration issues');
    console.log('   2. Re-run this test script: node test-azure-setup.js');
    console.log('   3. Check the setup guide: docs/azure-sharepoint-setup.md');
    console.log('\n🔧 Common Issues:');
    console.log('   - Missing environment variables (check .env file)');
    console.log('   - Sites.Selected permission not assigned to SharePoint site');
    console.log('   - Invalid Site ID or Drive ID (verify with Graph Explorer)');
    console.log('   - Admin consent not granted for application permissions');
  }
}

// Show usage help
function showHelp() {
  console.log('Azure AD & SharePoint Configuration Test Script');
  console.log('=============================================\n');
  console.log('This script validates your SCDP expense attachment system configuration.\n');
  console.log('Prerequisites:');
  console.log('  - Complete Azure AD app registration');
  console.log('  - Configure SharePoint site and document library');
  console.log('  - Set all required environment variables\n');
  console.log('Usage:');
  console.log('  npm run dev                     Start the application (required first)');
  console.log('  node test-azure-setup.js        Run all configuration tests');
  console.log('  node test-azure-setup.js --help Show this help message\n');
  console.log('Environment Variables:');
  console.log('  TEST_BASE_URL                   Override base URL for testing (optional)');
  console.log('For setup instructions, see: docs/azure-sharepoint-setup.md');
}

// Main test runner
async function runAllTests() {
  console.log('🧪 SCDP Azure AD & SharePoint Configuration Test');
  console.log('='.repeat(50));
  console.log('This script will validate your Azure and SharePoint setup.\n');
  
  // Validate project structure first
  validateProjectStructure();
  
  const results = {
    env: false,
    msal: false,
    auth: false,
    sharepoint: false,
    fileOps: false
  };
  
  try {
    // Test 1: Environment Variables
    results.env = testEnvironmentVariables();
    if (!results.env) {
      console.log('❌ Cannot continue without required environment variables.\n');
      generateConfigReport(results);
      return;
    }
    
    // Test 2: MSAL Configuration
    results.msal = await testMSALConfiguration();
    
    // Test 3: Graph Authentication (only if MSAL works)
    if (results.msal) {
      results.auth = await testGraphAuthentication();
    }
    
    // Test 4: SharePoint Connectivity (only if auth works)
    if (results.auth) {
      results.sharepoint = await testSharePointConnectivity();
    }
    
    // Test 5: File Operations (only if SharePoint works)
    if (results.sharepoint) {
      results.fileOps = await testFileOperations();
    }
    
  } catch (error) {
    console.log(`\n❌ Unexpected error during testing: ${error.message}`);
    console.log('Please check your configuration and try again.\n');
  }
  
  // Generate final report
  generateConfigReport(results);
}

// CLI handling
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test script failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  testEnvironmentVariables,
  testMSALConfiguration,
  testGraphAuthentication,
  testSharePointConnectivity,
  testFileOperations
};