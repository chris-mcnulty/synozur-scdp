# SharePoint Embedded Container Manual Setup

This document provides alternative instructions for creating SharePoint Embedded containers manually for the SCDP system.

## Prerequisites

- Azure tenant with SharePoint Embedded enabled
- Azure AD application with FileStorageContainer.Selected permissions
- PowerShell with Microsoft Graph PowerShell module (recommended)

## Option 1: PowerShell with Microsoft Graph

### Step 1: Install Microsoft Graph PowerShell Module

```powershell
Install-Module Microsoft.Graph -Scope CurrentUser
```

### Step 2: Connect to Microsoft Graph

```powershell
Connect-MgGraph -Scopes "FileStorageContainer.Selected"
```

### Step 3: Create Production Container

```powershell
$productionContainer = New-MgStorageFileStorageContainer -BodyParameter @{
    displayName = "SCDP Content Storage"
    description = "Content Storage for SCDP"
    containerTypeId = "91710488-5756-407f-9046-fbe5f0b4de73"
}

Write-Host "Production Container Created:"
Write-Host "  ID: $($productionContainer.Id)"
Write-Host "  Name: $($productionContainer.DisplayName)"
Write-Host "  Description: $($productionContainer.Description)"
```

### Step 4: Create Development Container

```powershell
$devContainer = New-MgStorageFileStorageContainer -BodyParameter @{
    displayName = "SCDP Content Storage Dev"
    description = "Content Storage for SCDP"
    containerTypeId = "91710488-5756-407f-9046-fbe5f0b4de73"
}

Write-Host "Development Container Created:"
Write-Host "  ID: $($devContainer.Id)"
Write-Host "  Name: $($devContainer.DisplayName)"
Write-Host "  Description: $($devContainer.Description)"
```

### Step 5: Configure Environment Variables

Add the container IDs to your environment:

```bash
# For production
export SHAREPOINT_CONTAINER_ID="<production-container-id>"

# For development 
export SHAREPOINT_CONTAINER_ID="<development-container-id>"
```

## Option 2: REST API with cURL

### Step 1: Get Access Token

```bash
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id={client-id}&client_secret={client-secret}&scope=https://graph.microsoft.com/.default"
```

### Step 2: Create Production Container

```bash
curl -X POST "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {access-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "SCDP Content Storage",
    "description": "Content Storage for SCDP",
    "containerTypeId": "91710488-5756-407f-9046-fbe5f0b4de73"
  }'
```

### Step 3: Create Development Container

```bash
curl -X POST "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {access-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "SCDP Content Storage Dev", 
    "description": "Content Storage for SCDP",
    "containerTypeId": "91710488-5756-407f-9046-fbe5f0b4de73"
  }'
```

## Option 3: Azure Portal (Coming Soon)

Microsoft is working on Azure Portal integration for SharePoint Embedded containers. This option will be available in future updates.

## Verification

After creating containers, verify access:

```powershell
# List all containers
Get-MgStorageFileStorageContainer

# Get specific container details
Get-MgStorageFileStorageContainer -FileStorageContainerId "{container-id}"
```

Or with cURL:

```bash
# List containers
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer {access-token}"

# Get container details  
curl -X GET "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/{container-id}" \
  -H "Authorization: Bearer {access-token}"
```

## Notes

- Container names "scdp-content-prod" and "scdp-content-dev" are used as friendly identifiers
- Display names "SCDP Content Storage" and "SCDP Content Storage Dev" are what users see
- Description "Content Storage for SCDP" explains the purpose for future content types
- The `containerTypeId` shown is the standard SharePoint Embedded container type
- Keep the automated provisioning script for future multi-tenant deployments

## Next Steps

1. Note the container IDs from the creation responses
2. Update your environment variables or system settings
3. Test container access using the SCDP health check endpoint
4. Initialize receipt metadata schema (optional, done automatically on first upload)