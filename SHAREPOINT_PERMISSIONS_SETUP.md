# SharePoint Embedded Container Permissions Setup

## Overview

SharePoint Embedded requires **two-layer authorization** for file access:

1. **Microsoft Graph API Permissions** (configured in Azure Portal)
   - `FileStorageContainer.Selected` - Already configured ✅
   - `Sites.Read.All` - Already configured ✅

2. **Container Type Application Permissions** (registered via SharePoint REST API v2.1)
   - Grants your application "full" access to all containers of your container type
   - Required for file upload/download/delete operations
   - **This is what we're setting up here**

---

## Automated Setup (Recommended)

### Using the Admin Diagnostics Page

1. **Navigate to Admin SharePoint Diagnostics**
   - Log in as admin (use `admin@synozur.com` / `demo123` for local development)
   - Go to: `/admin/sharepoint`

2. **Register Container Type Permissions**
   - Scroll to the **"Grant Permissions"** section (blue box)
   - Click **"Grant Application Permissions"**
   - Wait for success message

3. **Test File Upload**
   - After permissions are granted, click **"Test File Upload"**
   - You should see a success message with the uploaded file details

---

## Manual Setup (PowerShell Alternative)

If the automated setup fails, you can manually register permissions using PowerShell and the SharePoint REST API v2.1.

### Prerequisites

1. **Admin Access Required**
   - SharePoint Embedded Administrator **OR**
   - Global Administrator

2. **Required Information**
   - **Container Type ID**: `358aba7d-bb55-4ce0-a08d-e51f03d5edf1`
   - **Application ID**: `198aa0a6-d2ed-4f35-b41b-b6f6778a30d6`
   - **Tenant ID**: `b4fbeaf7-1c91-43bb-8031-49eb8d4175ee`
   - **SharePoint Root URL**: `https://synozur.sharepoint.com`

### Step 1: Install PowerShell Module

```powershell
# Install SharePoint Online Management Shell
Install-Module -Name Microsoft.Online.SharePoint.PowerShell -Force

# Connect to SharePoint Online
Connect-SPOService -Url https://synozur-admin.sharepoint.com
```

### Step 2: Get Access Token

You'll need an access token with `Sites.FullControl.All` permission to call the SharePoint REST API v2.1 endpoint.

```powershell
# Install MSAL.PS module for authentication
Install-Module -Name MSAL.PS -Force

# Get access token using certificate
$clientId = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6"
$tenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee"
$certThumbprint = "FB:AA:23:CA:DE:67:1C:19:8B:EE:FB:35:A5:33:FE:72:FD:94:7E:7B" # Remove colons

# Load certificate from local store
$cert = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object {$_.Thumbprint -eq $certThumbprint.Replace(":", "")}

# Get token
$token = Get-MsalToken `
  -ClientId $clientId `
  -TenantId $tenantId `
  -ClientCertificate $cert `
  -Scopes "https://graph.microsoft.com/.default"

$accessToken = $token.AccessToken
```

### Step 3: Call SharePoint REST API v2.1

```powershell
# API endpoint
$rootSiteUrl = "https://synozur.sharepoint.com"
$containerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$apiUrl = "$rootSiteUrl/_api/v2.1/storageContainerTypes/$containerTypeId/applicationPermissions"

# Payload
$payload = @{
  value = @(
    @{
      appId = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6"
      delegated = @("full")
      appOnly = @("full")
    }
  )
} | ConvertTo-Json -Depth 10

# Headers
$headers = @{
  "Authorization" = "Bearer $accessToken"
  "Accept" = "application/json"
  "Content-Type" = "application/json"
}

# Make the PUT request
$response = Invoke-WebRequest `
  -Uri $apiUrl `
  -Method PUT `
  -Headers $headers `
  -Body $payload `
  -UseBasicParsing

# Check response
if ($response.StatusCode -eq 200) {
  Write-Host "SUCCESS: Container type permissions registered!" -ForegroundColor Green
  Write-Host $response.Content
} else {
  Write-Host "ERROR: Registration failed with status $($response.StatusCode)" -ForegroundColor Red
  Write-Host $response.Content
}
```

### Step 4: Verify Permissions

After registration, you can verify by testing a file upload using the admin diagnostics page:

1. Go to `/admin/sharepoint`
2. Click **"Test File Upload"**
3. You should see a success message

---

## Permission Levels

The registration grants these permissions:

- **delegated: ["full"]** - Full control when acting on behalf of a user
- **appOnly: ["full"]** - Full control when acting as the application (app-only context)

This allows your application to:
- ✅ Create folders and files
- ✅ Read file content and metadata
- ✅ Update files and metadata
- ✅ Delete files
- ✅ Manage container permissions

---

## Troubleshooting

### Error: "This API is not supported for AAD accounts"

This means the container doesn't have the proper application permissions registered. Follow the steps above to register permissions.

### Error: "400 Bad Request" during registration

Check that:
- Your access token has the correct scopes
- The container type ID is correct: `358aba7d-bb55-4ce0-a08d-e51f03d5edf1`
- The application ID is correct: `198aa0a6-d2ed-4f35-b41b-b6f6778a30d6`

### Error: "404 Not Found" during registration

The SharePoint REST API v2.1 endpoint might not be available in your tenant yet. This API is rolling out gradually. In this case, contact Microsoft support or wait for the API to become available.

### Permissions already registered but uploads still fail

1. Clear the token cache and try again
2. Restart the application
3. Verify the container ID is correct
4. Check that you're using the right environment (DEV vs PROD)

---

## Additional Resources

- [SharePoint Embedded Container Type Registration API](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation)
- [SharePoint Embedded Authentication](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/auth)
- [Azure App Permissions Setup](./AZURE_APP_PERMISSIONS_SETUP.md)

---

## Quick Reference

**Automated Setup:**
1. Go to `/admin/sharepoint`
2. Click "Grant Application Permissions"
3. Test upload

**Manual Setup:**
1. Install PowerShell modules
2. Get access token with certificate
3. Call SharePoint REST API v2.1
4. Verify with test upload
