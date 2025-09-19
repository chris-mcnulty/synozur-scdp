# Azure AD & SharePoint Embedded Setup Guide for SCDP Expense Attachments

This comprehensive guide will walk you through setting up Azure AD app registration and SharePoint Embedded container configuration required for the SCDP expense attachment system.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Azure AD App Registration](#azure-ad-app-registration)
3. [SharePoint Embedded Container Setup](#sharepoint-embedded-container-setup)
4. [Environment Configuration](#environment-configuration)
5. [Security Best Practices](#security-best-practices)
6. [Configuration Checklist](#configuration-checklist)
7. [Integration with Existing MSAL Setup](#integration-with-existing-msal-setup)
8. [Testing & Troubleshooting](#testing--troubleshooting)

## Prerequisites

Before starting, ensure you have:

- **Azure Subscription** with admin access to create app registrations
- **Microsoft 365 tenant** with SharePoint Embedded capabilities
- **SharePoint Admin privileges** to create and manage containers
- **Global Administrator** or **Application Administrator** role in Azure AD
- Access to the SCDP application environment variables

### Required Permissions Levels

| Component | Required Role | Purpose |
|-----------|---------------|---------|
| Azure AD | Application Administrator | Create app registrations, manage permissions |
| SharePoint Embedded | SharePoint Administrator | Create and manage containers |
| Application | System Administrator | Configure environment variables |

## Azure AD App Registration

### Step 1: Create the App Registration

1. **Navigate to Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Search for "App registrations" or navigate to Azure Active Directory > App registrations

2. **Create New Registration**
   - Click "New registration"
   - Fill in the details:
     ```
     Name: SCDP Expense Attachments
     Supported account types: Accounts in this organizational directory only
     Redirect URI: Web - [Leave blank for now]
     ```
   - Click "Register"

3. **Note Important Values**
   After registration, record these values (you'll need them later):
   ```
   Application (client) ID: [Copy this value]
   Directory (tenant) ID: [Copy this value]
   Object ID: [Copy this value]
   ```

### Step 2: Configure Authentication

1. **Set Redirect URIs**
   - Go to "Authentication" in the left menu
   - Click "Add a platform" > "Web"
   - Add redirect URIs based on your environment:
     ```
     Development: http://localhost:5000/api/auth/callback
     Replit: https://[repl-name].[username].repl.co/api/auth/callback
     Production: https://scdp.synozur.com/api/auth/callback
     ```

2. **Configure Logout URL**
   - In the same Authentication section, add:
     ```
     Front-channel logout URL: [Your base URL]
     ```

### Step 3: Create Client Secret

1. **Generate Secret**
   - Go to "Certificates & secrets" > "Client secrets"
   - Click "New client secret"
   - Add description: "SCDP Production Secret"
   - Set expiration: "24 months" (recommended for production)
   - Click "Add"

2. **Record Secret Value**
   ```
   ⚠️ CRITICAL: Copy the secret VALUE immediately!
   This is your only chance to see the full secret.
   
   Client Secret: [Copy this value - it's long]
   Secret ID: [For reference only]
   Expires: [Note the expiration date]
   ```

### Step 4: Configure API Permissions

The application requires specific Microsoft Graph permissions for SharePoint file operations:

1. **Navigate to API Permissions**
   - Go to "API permissions" in the left menu
   - Click "Add a permission"

2. **Add Microsoft Graph Permissions**
   **RECOMMENDED (SharePoint Embedded)**: Add **FileStorageContainer.Selected** permission:
   
   | Permission | Type | Purpose | Scope |
   |------------|------|---------|-------|
   | `FileStorageContainer.Selected` | Application | Access specific SharePoint Embedded containers only | Container-specific |

   **Steps to add FileStorageContainer.Selected:**
   - Click "Add a permission" > "Microsoft Graph" > "Application permissions"
   - Search for "FileStorageContainer.Selected"
   - Check the permission box
   - Click "Add permissions"

   ⚠️ **LEGACY PERMISSIONS**: SharePoint Online Permissions (NOT FOR EMBEDDED)
   
   **DO NOT USE** these SharePoint Online permissions for SharePoint Embedded containers:
   
   | Permission | Type | ⚠️ Issue |
   |------------|------|---------|
   | `Sites.ReadWrite.All` | Application | **Legacy** - For SharePoint Online sites only |
   | `Files.ReadWrite.All` | Application | **Legacy** - For SharePoint Online files only |
   | `Sites.Selected` | Application | **Legacy** - For SharePoint Online site-specific access |
   
   **For SharePoint Embedded containers, use only:**
   - `FileStorageContainer.Selected` - Container-specific access
   
   **SharePoint Embedded provides isolated containers with built-in security boundaries.**

3. **Grant Admin Consent**
   ```
   ⚠️ REQUIRED: Admin consent must be granted for application permissions
   ```
   - Click "Grant admin consent for [Your Organization]"
   - Confirm by clicking "Yes"
   - Verify all permissions show "Granted for [Your Organization]"

### Step 5: Configure Application Settings

1. **Set Application Type**
   - Go to "Manifest" in the left menu
   - Ensure these settings:
     ```json
     "allowPublicClient": false,
     "signInAudience": "AzureADMyOrg"
     ```

2. **Optional: Add App Roles** (for future granular permissions)
   - Go to "App roles" 
   - You can define custom roles like "ExpenseManager", "FileUploader" etc.

## SharePoint Embedded Container Setup

### Step 1: Create SharePoint Embedded Container

SharePoint Embedded containers provide isolated storage environments with built-in security and access control.

1. **Create Container via Graph API**
   ```bash
   # Get access token with FileStorageContainer.Selected permission
   curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id={client-id}&client_secret={client-secret}&scope=https://graph.microsoft.com/.default"
   
   # Create new container
   curl -X POST "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
     -H "Authorization: Bearer {access-token}" \
     -H "Content-Type: application/json" \
     -d '{
       "displayName": "SCDP Expense Attachments",
       "description": "Container for SCDP expense receipt storage",
       "containerTypeId": "{container-type-id}"
     }'
   ```

2. **Alternative: Use Existing Container**
   - Identify an existing SharePoint Embedded container
   - Ensure your application has access to the container
   - Note the container ID for configuration

### Step 2: Verify Container Access

Confirm your application can access the SharePoint Embedded container:

```bash
# List accessible containers
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {access-token}"

# Get specific container details
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}" \
  -H "Authorization: Bearer {access-token}"

# Test container drive access
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}/drive/root/children" \
  -H "Authorization: Bearer {access-token}"
```

### Step 3: Set Up Folder Structure

The system automatically creates folders in the **container** using this structure:
```
/Container Root/
  └── Receipts/
      ├── 2025/
      │   ├── PROJECT1/
      │   │   ├── EXP001/
      │   │   │   ├── receipt1.pdf
      │   │   │   └── receipt2.jpg
      │   │   └── EXP002/
      │   └── PROJECT2/
      └── 2026/
```

**Initial Setup:**
1. ✅ Use the SharePoint Embedded container (isolated storage)
2. 🤖 The application will automatically create the "/Receipts" folder and year/project/expense subfolders as needed
3. 🔒 Built-in security boundaries and access control

### Step 4: Container Access and Permissions

⚠️ **Important**: SharePoint Embedded containers use FileStorageContainer.Selected permission with automatic container access.

**SharePoint Embedded Container Access**

SharePoint Embedded containers automatically grant access when using FileStorageContainer.Selected permission:

```bash
# Container access is automatically granted when:
# 1. Application has FileStorageContainer.Selected permission with admin consent
# 2. Application creates or is assigned to specific containers
# 3. No manual site permission assignment needed

# To list accessible containers:
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {app-access-token}"

# To get specific container details:
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}" \
  -H "Authorization: Bearer {app-access-token}"

# To access container drive:
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}/drive/root/children" \
  -H "Authorization: Bearer {app-access-token}"
```

**Replace the placeholders:**
- `{app-access-token}`: Access token with FileStorageContainer.Selected
- `{container-id}`: Your SharePoint Embedded container ID

**Get app access token for testing:**
```bash
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id={your-app-id}&client_secret={your-app-secret}&scope=https://graph.microsoft.com/.default"
```

### Step 5: Get SharePoint Embedded Container ID

You'll need the container ID for environment configuration:

1. **Get Container ID via Graph API**
   ```bash
   # Using Microsoft Graph Explorer (recommended)
   # Go to: https://developer.microsoft.com/en-us/graph/graph-explorer
   # Query: GET https://graph.microsoft.com/v1.0/storage/fileStorage/containers
   # Find your container in the response and note the 'id' field
   ```

2. **Get Container ID via cURL**
   ```bash
   # List all accessible containers
   curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
     -H "Authorization: Bearer {access-token}"
   
   # Find your container by displayName and note the 'id' field
   ```

3. **Container Information**
   - Container ID: Use this as SHAREPOINT_CONTAINER_ID
   - Container Type ID: Optional, use as CONTAINER_TYPE_ID if needed
   - Display Name: For reference and identification

## Environment Configuration

### Required Environment Variables

Configure these environment variables in your application:

```bash
# Azure AD Configuration
AZURE_CLIENT_ID="[Application ID from Step 1]"
AZURE_TENANT_ID="[Directory ID from Step 1]"
AZURE_CLIENT_SECRET="[Client Secret from Step 3]"

# Optional: Custom redirect URIs (if different from auto-detected)
AZURE_REDIRECT_URI="https://yourdomain.com/api/auth/callback"
POST_LOGOUT_REDIRECT_URI="https://yourdomain.com"

# SharePoint Embedded Configuration
SHAREPOINT_CONTAINER_ID="[Container ID from Step 5]"

# Optional: Container Type ID for reference
CONTAINER_TYPE_ID="[Container Type ID if needed]"
```

### Environment-Specific Configuration

#### Development Environment

```bash
# Local development
AZURE_CLIENT_ID="your-dev-app-id"
AZURE_TENANT_ID="your-tenant-id"
AZURE_CLIENT_SECRET="your-dev-secret"
SHAREPOINT_CONTAINER_ID="your-container-id"
NODE_ENV="development"
```

#### Replit Environment

```bash
# Replit deployment
AZURE_CLIENT_ID="your-replit-app-id"
AZURE_TENANT_ID="your-tenant-id"
AZURE_CLIENT_SECRET="your-replit-secret"
SHAREPOINT_CONTAINER_ID="your-container-id"
REPL_SLUG="your-repl-name"
REPL_OWNER="your-username"
```

#### Production Environment

```bash
# Production deployment
AZURE_CLIENT_ID="your-prod-app-id"
AZURE_TENANT_ID="your-tenant-id"
AZURE_CLIENT_SECRET="your-prod-secret"
SHAREPOINT_CONTAINER_ID="your-container-id"
NODE_ENV="production"
REPLIT_DOMAINS="1" # if using Replit for production
```

### How to Find SharePoint Embedded Container ID

#### Method 1: Microsoft Graph Explorer (Easiest)

1. Go to [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
2. Sign in with your admin account
3. **List Accessible Containers:**
   ```
   GET https://graph.microsoft.com/v1.0/storage/fileStorage/containers
   ```
   Look for your container in the response and note the `id` field

4. **Get Specific Container Details:**
   ```
   GET https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}
   ```
   Verify container details and access

#### Method 2: cURL Commands

```bash
# Get access token first
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id={client-id}&client_secret={client-secret}&scope=https://graph.microsoft.com/.default"

# List containers
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {access-token}"
```

#### Method 3: PowerShell with Graph API

```powershell
# Install Microsoft Graph PowerShell
Install-Module Microsoft.Graph -Force

# Connect with appropriate scopes
Connect-MgGraph -Scopes "FileStorageContainer.Selected"

# List containers
Get-MgStorageFileStorageContainer
```

## Security Best Practices

### 1. Principle of Least Privilege

**RECOMMENDED: SharePoint Embedded Container Permissions**
- ✅ Use `FileStorageContainer.Selected` application permission
- ✅ Automatic access to assigned containers only
- ✅ Built-in isolation and security boundaries
- ✅ No tenant-wide permissions needed

**⚠️ AVOID: Legacy SharePoint Online Permissions**
- ❌ `Sites.ReadWrite.All` (for SharePoint Online sites)
- ❌ `Files.ReadWrite.All` (for SharePoint Online files)
- ❌ `Sites.Selected` (for SharePoint Online site-specific)
- ❌ `Sites.FullControl.All` (for SharePoint Online administration)

**Modern SharePoint App Security Model:**
- Use Graph API permissions instead of classic SharePoint permissions
- Assign app to specific sites via SharePoint Admin Center
- No AppInv.aspx or XML permission requests required
- Site assignments can be managed without app registration changes

### 2. Modern Authentication & Secret Management

**Client Credentials Flow (Recommended for Backend Apps):**
- ✅ Use confidential client application type
- ✅ Client credentials grant for app-only operations
- ✅ No user interaction required for file operations
- ❌ Do NOT use implicit grant flow (legacy)
- ❌ Do NOT enable public client flows

**Client Secret Security:**
```bash
# DO NOT commit secrets to version control
# Use environment variables or secure vaults

# Secret rotation schedule (recommended)
Production: Rotate every 12 months
Development: Rotate every 24 months  
Test/Staging: Rotate every 18 months
```

**Secret Storage Options (Preferred Order):**
1. **Azure Key Vault** (production environments)
2. **Replit Secrets** (Replit deployments)
3. **CI/CD secret stores** (GitHub Secrets, Azure DevOps)
4. **Environment variables** (local development only)

### 3. Network Security

**Allowed Redirect URIs:**
- Only add necessary redirect URIs
- Use HTTPS for all production URLs
- Avoid wildcard domains

**CORS Configuration:**
- Configure CORS policies to restrict domains
- Don't use `*` for allowed origins in production

### 4. Monitoring and Auditing

**Enable Audit Logging:**
```bash
# Azure AD Sign-in logs
# SharePoint audit logs
# Application insights for the SCDP app
```

**Monitor for:**
- Failed authentication attempts
- Unusual file access patterns
- Large file uploads outside business hours
- Geographic anomalies in access

### 5. Production vs Development Configurations

#### Development Environment
- Use separate Azure AD app registration
- Point to test SharePoint site
- Enable verbose logging
- Allow HTTP for localhost

#### Production Environment
- Dedicated app registration with production secrets
- Production SharePoint site with backups
- Minimal logging (no PII)
- HTTPS only
- IP restrictions (if applicable)

**Configuration Separation:**
```bash
# Use different environment files
.env.development
.env.production
.env.test

# Never mix development and production credentials
```

## Configuration Checklist

### Pre-Setup Checklist

- [ ] Azure subscription with admin access
- [ ] Microsoft 365 tenant with SharePoint Online
- [ ] SharePoint Admin or Site Collection Admin role
- [ ] Application Administrator role in Azure AD
- [ ] Access to application deployment environment

### Azure AD App Registration Checklist

- [ ] Created new app registration with descriptive name
- [ ] Recorded Application (client) ID
- [ ] Recorded Directory (tenant) ID
- [ ] Configured redirect URIs for all environments
- [ ] Generated client secret and recorded value securely
- [ ] Added Microsoft Graph application permissions:
  - [ ] FileStorageContainer.Selected (for container access)
- [ ] Granted admin consent for all permissions
- [ ] Verified permissions show "Granted" status
- [ ] Configured authentication settings (allowPublicClient: false)

### SharePoint Embedded Container Setup Checklist

- [ ] Created or identified target SharePoint Embedded container
- [ ] Container automatically provides isolated storage (application auto-creates /Receipts folder)
- [ ] Verified FileStorageContainer.Selected permission granted with admin consent
- [ ] Obtained Container ID using Graph Explorer or PowerShell
- [ ] Verified app can access the container (using test query)
- [ ] Documented container ID and display name
- [ ] Confirmed container-based file operations work

### Environment Configuration Checklist

- [ ] Set AZURE_CLIENT_ID environment variable
- [ ] Set AZURE_TENANT_ID environment variable
- [ ] Set AZURE_CLIENT_SECRET environment variable (securely)
- [ ] Set SHAREPOINT_CONTAINER_ID environment variable
- [ ] Configured environment-specific redirect URIs (if needed)
- [ ] Verified all environment variables are loaded correctly
- [ ] Tested configuration with test API call

### Security Checklist

- [ ] Client secret stored securely (not in code)
- [ ] Minimum required permissions granted
- [ ] Admin consent completed
- [ ] Redirect URIs restricted to necessary domains
- [ ] Audit logging enabled for Azure AD
- [ ] SharePoint audit logging enabled
- [ ] Secret rotation schedule documented
- [ ] Monitoring alerts configured
- [ ] Separate configurations for dev/test/prod environments

### Verification Steps

#### Automated Configuration Test

**Run the comprehensive test script:**
```bash
# Ensure all environment variables are set first
# Then run the automated test
node test-azure-setup.js
```

**Expected Output:**
```
🧪 SCDP Azure AD & SharePoint Configuration Test
==================================================
🔧 Testing Environment Variables...
   ✅ AZURE_CLIENT_ID: Set (36 characters)
   ✅ AZURE_TENANT_ID: Set (36 characters)
   ✅ AZURE_CLIENT_SECRET: Set (40 characters)
   ✅ SHAREPOINT_CONTAINER_ID: Set (36 characters)

🔐 Testing MSAL Configuration...
   ✅ Azure AD configured: Yes
   ✅ Authority: https://login.microsoftonline.com/[tenant-id]

🌐 Testing Microsoft Graph Authentication...
   ✅ Graph authentication successful
   ✅ Token obtained: 1234 characters

📁 Testing SharePoint Embedded Container Connectivity...
   ✅ Containers List: Success 
   ✅ Container Access: Success
   ✅ Container Drive Access: Success

📤 Testing File Operations...
   ✅ Successfully listed X items in container
   ✅ Folder creation: Success

📊 Configuration Report
==================================================
Environment Variables     ✅ PASS
MSAL Configuration        ✅ PASS
Graph Authentication      ✅ PASS
SharePoint Embedded Connectivity   ✅ PASS
File Operations          ✅ PASS
==================================================
🎉 All tests passed! Your Azure AD and SharePoint Embedded container configuration is ready.
```

**Manual Verification (Alternative):**

If you prefer manual testing, use these Graph API calls:

```bash
# 1. Test authentication and get access token
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id={client-id}&client_secret={client-secret}&scope=https://graph.microsoft.com/.default"

# 2. Test container access
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}" \
  -H "Authorization: Bearer {access-token}"

# 3. Test container drive access
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}/drive/root/children" \
  -H "Authorization: Bearer {access-token}"
```

### Common Issues and Solutions

#### Issue: "AADSTS50011: The reply URL specified in the request does not match"
**Solution:**
- Verify redirect URI in Azure AD matches your application URL exactly
- Check for trailing slashes, HTTP vs HTTPS
- Update redirect URI in Azure AD app registration

#### Issue: "Insufficient privileges to complete the operation"
**Solution:**
- Verify admin consent was granted for all permissions
- Check that permissions are "Application" type, not "Delegated"
- Ensure FileStorageContainer.Selected permission was configured correctly

#### Issue: "MSAL instance not configured"
**Solution:**
- Verify all four required environment variables are set:
  - AZURE_CLIENT_ID
  - AZURE_TENANT_ID
  - AZURE_CLIENT_SECRET
  - SHAREPOINT_CONTAINER_ID  
  - AZURE_CLIENT_SECRET
- Check environment variable values don't contain extra spaces or quotes

#### Issue: "Site or drive not found"
**Solution:**
- Verify Site ID and Drive ID are correct
- Use Microsoft Graph Explorer to validate IDs
- Check that the app has permissions to the specific site

#### Issue: "Invalid client secret"
**Solution:**
- Generate a new client secret (old one may have expired)
- Verify the full secret value was copied correctly
- Check secret hasn't exceeded expiration date

## Integration with Existing MSAL Setup

The SCDP application already has MSAL integration configured. Here's how the expense attachment system integrates:

### Current MSAL Configuration

The application uses two authentication flows:

1. **User Authentication** (existing):
   - Used for user login and profile access
   - Scopes: `user.read`, `profile`, `email`, `openid`
   - Flow: Authorization Code Flow

2. **App-Only Authentication** (for file operations):
   - Used for SharePoint file operations
   - Scopes: `https://graph.microsoft.com/.default`
   - Flow: Client Credentials Flow

### Environment Variable Precedence

The system detects configuration in this order:

```javascript
// 1. Explicit redirect URI (highest priority)
process.env.AZURE_REDIRECT_URI

// 2. Replit automatic detection
`https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`

// 3. Production domain
"https://scdp.synozur.com"

// 4. Local development (lowest priority)
"http://localhost:5000"
```

### Authentication Flow Integration

#### User Login Flow (Existing)
```
User -> Azure AD Login -> Callback -> User Session
```

#### File Upload Flow (New)
```
File Upload Request -> App-Only Token -> SharePoint API -> Success
```

### Code Integration Points

The expense attachment system integrates at these points:

1. **Environment Configuration** (`server/auth/entra-config.ts`):
   ```typescript
   // Already configured - no changes needed
   export const msalInstance = isConfigured 
     ? new ConfidentialClientApplication(msalConfig)
     : null;
   ```

2. **Graph Client Service** (`server/services/graph-client.ts`):
   ```typescript
   // Handles SharePoint operations with app-only authentication
   export const graphClient = new GraphClient();
   ```

3. **API Routes** (to be added):
   ```typescript
   // Expense attachment endpoints
   app.post('/api/expenses/:id/attachments', uploadAttachment);
   app.get('/api/expenses/:id/attachments', listAttachments);
   app.delete('/api/attachments/:id', deleteAttachment);
   ```

### Health Check Endpoints

The system provides health check endpoints for configuration validation:

```bash
# Check Azure AD configuration
GET /api/health/azure-config

# Check SharePoint connectivity  
GET /api/health/sharepoint

# Test file operations
POST /api/test/upload
```

### Troubleshooting Integration Issues

#### Authentication Conflicts
- The app-only flow is independent of user authentication
- Both can run simultaneously without conflicts
- File operations don't require user to be logged in

#### Token Management
- User tokens and app-only tokens are managed separately
- App-only tokens are cached for 5 minutes with automatic refresh
- No user token interaction required for file operations

#### Permission Overlap
- User permissions (delegated) and app permissions (application) are different
- App permissions allow file operations without user context
- No permission elevation concerns

### Development vs Production Behavior

#### Development Mode
- Detailed logging enabled for both authentication flows
- HTTP allowed for localhost redirect URIs
- Verbose error messages for debugging

#### Production Mode
- Minimal logging (no PII)
- HTTPS required for all operations
- Simplified error messages for security

## Testing & Troubleshooting

### Manual Testing Steps

#### 1. Environment Configuration Test
```bash
# Test 1: Verify environment variables
node -e "
console.log('AZURE_CLIENT_ID:', process.env.AZURE_CLIENT_ID ? 'Set' : 'Missing');
console.log('AZURE_TENANT_ID:', process.env.AZURE_TENANT_ID ? 'Set' : 'Missing');
console.log('AZURE_CLIENT_SECRET:', process.env.AZURE_CLIENT_SECRET ? 'Set' : 'Missing');
console.log('SHAREPOINT_SITE_ID:', process.env.SHAREPOINT_SITE_ID ? 'Set' : 'Missing');
console.log('SHAREPOINT_DRIVE_ID:', process.env.SHAREPOINT_DRIVE_ID ? 'Set' : 'Missing');
"
```

#### 2. Application Health Check
```bash
# Test 2: Start the application and check health endpoints
npm run dev

# In another terminal, test the health endpoints:
curl -X GET "http://localhost:5000/api/health/azure-config"
curl -X GET "http://localhost:5000/api/health/sharepoint"
```

#### 3. Microsoft Graph API Test
```bash
# Test 3: Test Graph API connectivity
curl -X POST "http://localhost:5000/api/health/graph-test" \
  -H "Content-Type: application/json"
```

#### 4. SharePoint Access Test
```javascript
// Test 4: Direct SharePoint API test
const { graphClient } = require('./server/services/graph-client.js');

async function testSharePoint() {
  try {
    const result = await graphClient.testConnectivity(
      process.env.SHAREPOINT_SITE_ID,
      process.env.SHAREPOINT_DRIVE_ID
    );
    console.log('SharePoint Test Result:', result);
  } catch (error) {
    console.error('SharePoint Test Failed:', error.message);
  }
}

testSharePoint();
```

### Automated Testing

Create test scripts for continuous validation:

#### Comprehensive Test Script: `test-azure-setup.js`

**Prerequisites:**
1. ✅ Complete Azure AD and SharePoint setup (following this guide)
2. ✅ Set all required environment variables  
3. ✅ **Start the application first**: `npm run dev`

**Run the test:**
```bash
# IMPORTANT: Start the application in one terminal
npm run dev

# In another terminal, run the comprehensive test
node test-azure-setup.js

# Optional: Test against different environment
TEST_BASE_URL=https://your-app.replit.app node test-azure-setup.js
```

**The test validates:**
- 🔧 Environment variables configuration
- 🔐 Azure AD MSAL setup via health endpoint  
- 🌐 Microsoft Graph authentication
- 📁 SharePoint site and drive connectivity
- 📤 File operations capabilities

**Expected Test Output:**
```
🧪 SCDP Azure AD & SharePoint Configuration Test
==================================================

🔧 Testing Environment Variables...
   ✅ All required environment variables are configured.

🔐 Testing MSAL Configuration...  
   ✅ MSAL configuration endpoint accessible
   ✅ Azure AD configured: Yes

🌐 Testing Microsoft Graph Authentication...
   ✅ Authentication successful: Yes
   ✅ Token format is valid (JWT structure)

📁 Testing SharePoint Connectivity...
   🎉 SharePoint connectivity test passed!

📊 Configuration Report
==================================================
Environment Variables     ✅ PASS
MSAL Configuration       ✅ PASS  
Graph Authentication     ✅ PASS
SharePoint Connectivity  ✅ PASS
File Operations         ✅ PASS
==================================================
🎉 All tests passed! Your Azure AD and SharePoint Embedded container configuration is ready.
```

**Troubleshooting Test Failures:**
- **"Health endpoint not found"** → Application not running, start with `npm run dev`
- **"Authentication failed"** → Check Azure AD environment variables and permissions
- **"SharePoint connectivity failed"** → Verify FileStorageContainer.Selected permission and container IDs

### Common Error Scenarios

#### Error: "Application is not assigned to any users or groups"
**Cause:** App registration requires user assignment
**Solution:**
1. Go to Azure AD > Enterprise Applications
2. Find your app registration
3. Go to "Users and groups"
4. Assign appropriate users or groups

#### Error: "The client does not exist or is not enabled for consumers"
**Cause:** Incorrect tenant ID or client ID
**Solution:**
1. Verify AZURE_TENANT_ID matches your Azure AD tenant
2. Verify AZURE_CLIENT_ID matches your app registration
3. Check for extra spaces or characters in environment variables

#### Error: "Access denied" when uploading files
**Cause:** Insufficient SharePoint permissions
**Solution:**
1. Verify SharePoint app permissions were granted correctly
2. Check that admin consent was completed
3. Ensure the app has Write permissions to the specific site

#### Error: "Drive not found"
**Cause:** Incorrect Drive ID or permissions
**Solution:**
1. Re-verify Drive ID using Graph Explorer
2. Check that the document library exists
3. Ensure app has permissions to the site containing the drive

### Performance Monitoring

Monitor these metrics for optimal performance:

```bash
# Token acquisition time (should be < 2 seconds)
# File upload time (varies by file size)
# SharePoint API response time (should be < 5 seconds)
# Error rates (should be < 1%)
```

### Logging Configuration

Enable appropriate logging levels:

```javascript
// Development
process.env.LOG_LEVEL = 'debug';

// Production  
process.env.LOG_LEVEL = 'info';

// Error tracking
process.env.LOG_LEVEL = 'error';
```

---

## Summary

This guide provides comprehensive instructions for setting up Azure AD app registration and SharePoint configuration for the SCDP expense attachment system. Follow the checklist items systematically, test each component, and use the troubleshooting section to resolve any issues.

### Key Success Criteria

- ✅ Azure AD app registration with proper permissions
- ✅ SharePoint site and document library configured
- ✅ Environment variables set correctly
- ✅ Security best practices implemented
- ✅ Integration tested and verified
- ✅ Monitoring and troubleshooting procedures established

### Next Steps

After completing this setup:
1. Test the expense attachment functionality in the SCDP application
2. Configure monitoring and alerting for the integration
3. Set up secret rotation schedules
4. Train users on the new expense attachment features
5. Plan for production deployment and scaling

For additional support or questions, refer to the Microsoft Graph documentation and Azure AD best practices guides.