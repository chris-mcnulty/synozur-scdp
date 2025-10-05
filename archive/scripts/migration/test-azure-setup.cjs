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
    'SHAREPOINT_CONTAINER_ID': 'SharePoint Embedded Container ID'
  };
  
  const optionalEnvVars = {
    'AZURE_REDIRECT_URI': 'Custom redirect URI (optional)',
    'POST_LOGOUT_REDIRECT_URI': 'Custom logout redirect URI (optional)',
    'CONTAINER_TYPE_ID': 'SharePoint Embedded Container Type ID (optional)'
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

// Test SharePoint Embedded container connectivity via direct Graph API calls
async function testSharePointConnectivity() {
  console.log('📁 Testing SharePoint Embedded Container Connectivity...\n');
  
  try {
    console.log('   🔄 Testing SharePoint Embedded container access...');
    
    const containerId = process.env.SHAREPOINT_CONTAINER_ID;
    
    if (!containerId) {
      console.log('   ❌ Missing SharePoint configuration (SHAREPOINT_CONTAINER_ID)');
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
    
    console.log('   ✅ Access token obtained for SharePoint Embedded container testing');
    console.log(`   ✅ Container ID: ${containerId.substring(0, 20)}...`);
    
    let containersAccessible = false;
    let containerAccessible = false;
    let containerDriveAccessible = false;
    let errorDetails = null;
    
    // Test 1: List accessible containers
    try {
      const containersResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (containersResponse.ok) {
        const containersData = await containersResponse.json();
        console.log(`   ✅ Containers List: Success (${containersData.value?.length || 0} containers found)`);
        containersAccessible = true;
        
        // Check if our specific container is in the list
        const ourContainer = containersData.value?.find(c => c.id === containerId);
        if (ourContainer) {
          console.log(`   ✅ Target Container Found: ${ourContainer.displayName || ourContainer.id}`);
        } else {
          console.log(`   ⚠️  Target Container Not Found in accessible containers list`);
        }
      } else {
        const errorText = await containersResponse.text();
        console.log(`   ❌ Containers List: Failed (HTTP ${containersResponse.status})`);
        errorDetails = errorText;
      }
    } catch (containersError) {
      console.log(`   ❌ Containers List: Error - ${containersError.message}`);
      errorDetails = containersError.message;
    }
    
    // Test 2: Access the specific container
    try {
      const containerResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (containerResponse.ok) {
        const containerData = await containerResponse.json();
        console.log(`   ✅ Container Access: Success (${containerData.displayName || containerData.id})`);
        containerAccessible = true;
      } else {
        const errorText = await containerResponse.text();
        console.log(`   ❌ Container Access: Failed (HTTP ${containerResponse.status})`);
        errorDetails = errorText;
      }
    } catch (containerError) {
      console.log(`   ❌ Container Access: Error - ${containerError.message}`);
      errorDetails = containerError.message;
    }
    
    // Test 3: Access the container's drive root (only if container access works)
    if (containerAccessible) {
      try {
        const driveRootResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/root/children`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (driveRootResponse.ok) {
          const driveData = await driveRootResponse.json();
          console.log(`   ✅ Container Drive Access: Success (${driveData.value?.length || 0} items found)`);
          containerDriveAccessible = true;
        } else {
          const errorText = await driveRootResponse.text();
          console.log(`   ❌ Container Drive Access: Failed (HTTP ${driveRootResponse.status})`);
          errorDetails = errorText;
        }
      } catch (driveError) {
        console.log(`   ❌ Container Drive Access: Error - ${driveError.message}`);
        errorDetails = driveError.message;
      }
    }
    
    // Provide specific guidance based on errors
    if (errorDetails) {
      if (errorDetails.includes('Forbidden') || errorDetails.includes('403')) {
        console.log('   💡 This suggests permission issues. Check FileStorageContainer.Selected assignment.');
        console.log('   💡 Ensure your app has FileStorageContainer.Selected permission and admin consent.');
      } else if (errorDetails.includes('NotFound') || errorDetails.includes('404')) {
        console.log('   💡 This suggests incorrect Container ID or container not accessible.');
        console.log('   💡 Run: GET https://graph.microsoft.com/v1.0/storage/fileStorage/containers');
        console.log('   💡 Verify the SHAREPOINT_CONTAINER_ID exists and is accessible.');
      } else if (errorDetails.includes('Unauthorized') || errorDetails.includes('401')) {
        console.log('   💡 This suggests token or permission issues.');
        console.log('   💡 Verify FileStorageContainer.Selected permission is granted with admin consent.');
      }
    }
    
    const success = containersAccessible && containerAccessible && containerDriveAccessible;
    
    if (success) {
      console.log('   🎉 SharePoint Embedded container connectivity test passed!');
    }
    
    return success;
  } catch (error) {
    console.log(`   ❌ SharePoint connectivity test failed: ${error.message}`);
    console.log('   💡 Check your Azure and SharePoint configuration');
    return false;
  }
}

// Test file operations via SharePoint Embedded container endpoints
async function testFileOperations() {
  console.log('📤 Testing File Operations...\n');
  
  try {
    console.log('   🔄 Testing SharePoint Embedded container file operations capabilities...');
    
    const containerId = process.env.SHAREPOINT_CONTAINER_ID;
    
    if (!containerId) {
      console.log('   ❌ Missing SHAREPOINT_CONTAINER_ID environment variable');
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
    
    // Test 1: List items in the container root
    try {
      const listResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/root/children`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (listResponse.ok) {
        const listData = await listResponse.json();
        console.log(`   ✅ Successfully listed ${listData.value.length} items in container`);
        
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
        console.log(`   ❌ Container file listing failed: HTTP ${listResponse.status}`);
        
        if (listResponse.status === 403) {
          console.log('   💡 This suggests insufficient permissions for file operations.');
          console.log('      Check that FileStorageContainer.Selected permission is assigned to your container.');
        }
        return false;
      }
    } catch (listError) {
      console.log(`   ❌ Container file listing error: ${listError.message}`);
      return false;
    }
    
    // Test 2: Test folder creation capability (create a test folder and delete it)
    try {
      const testFolderName = `test-folder-${Date.now()}`;
      
      // Create test folder in container
      const createResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/root/children`, {
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
        console.log('   ✅ Folder creation in container: Success');
        
        // Clean up: delete the test folder using container endpoint
        const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/items/${createdFolder.id}`, {
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
    
    console.log('   🎉 SharePoint Embedded container file operations test completed successfully!');
    return true;
  } catch (error) {
    console.log(`   ❌ Container file operations test failed: ${error.message}`);
    console.log('   💡 Check your Azure and SharePoint Embedded container configuration');
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
    { name: 'SharePoint Embedded Connectivity', status: results.sharepoint },
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
    console.log('🎉 All tests passed! Your Azure AD and SharePoint Embedded container configuration is ready.');
    console.log('🚀 You can now use the expense attachment features in SCDP with SharePoint Embedded containers.');
  } else {
    console.log(`⚠️  ${passedTests}/${totalTests} tests passed. Please review failed tests above.`);
    console.log('📖 See docs/azure-sharepoint-setup.md for SharePoint Embedded troubleshooting guidance.');
  }
  
  console.log('\n📋 Next Steps:');
  if (passedTests === totalTests) {
    console.log('   1. Test expense attachment upload in the SCDP application');
    console.log('   2. Configure monitoring and alerts');
    console.log('   3. Set up secret rotation schedule');
    console.log('   4. Train users on new functionality');
    console.log('\n🚀 Ready for Production:');
    console.log('   - All Azure AD and SharePoint Embedded container configurations are working');
    console.log('   - FileStorageContainer.Selected permission is properly assigned');
    console.log('   - SharePoint Embedded container is accessible with /Receipts folder support');
    console.log('   - Container file operations (create, read, delete) are functional');
  } else {
    console.log('   1. Fix the failed configuration issues');
    console.log('   2. Re-run this test script: node test-azure-setup.js');
    console.log('   3. Check the setup guide: docs/azure-sharepoint-setup.md');
    console.log('\n🔧 Common Issues:');
    console.log('   - Missing environment variables (check SHAREPOINT_CONTAINER_ID)');
    console.log('   - FileStorageContainer.Selected permission not assigned or lacking admin consent');
    console.log('   - Invalid Container ID (verify with Graph Explorer: /storage/fileStorage/containers)');
    console.log('   - Container not created or not accessible by the application');
  }
}

// Show usage help
function showHelp() {
  console.log('Azure AD & SharePoint Configuration Test Script');
  console.log('=============================================\n');
  console.log('This script validates your SCDP expense attachment system configuration.\n');
  console.log('Prerequisites:');
  console.log('  - Complete Azure AD app registration with FileStorageContainer.Selected permission');
  console.log('  - Configure SharePoint Embedded container');
  console.log('  - Set all required environment variables (including SHAREPOINT_CONTAINER_ID)\n');
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
    
    // Test 4: SharePoint Embedded Container Connectivity (only if auth works)
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