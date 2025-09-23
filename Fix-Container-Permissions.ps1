#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Grant user permissions to SharePoint Embedded containers before metadata configuration

.DESCRIPTION
This script grants the current user (admin@synozur.com) permissions to both development and production containers
to resolve the 403 Forbidden errors when configuring metadata.
#>

# Configuration - same as metadata script
$DevContainerId = "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ProdContainerId = "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$TenantId = "synozur.onmicrosoft.com"
$AdminUser = "admin@synozur.com"

# Colors for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

function Grant-ContainerPermissions {
    param(
        [string]$ContainerId,
        [string]$Environment,
        [string]$UserPrincipalName
    )
    
    Write-Host "`n📋 Granting $Environment Container Permissions..." -ForegroundColor $Yellow
    Write-Host "Container ID: $ContainerId" -ForegroundColor $Cyan
    Write-Host "User: $UserPrincipalName" -ForegroundColor $Cyan
    
    try {
        # Check current permissions
        Write-Host "   🔍 Checking current permissions..." -ForegroundColor $White
        $currentPermissions = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ContainerId/permissions" -Method GET
        
        Write-Host "   📊 Current permissions count: $($currentPermissions.value.Count)" -ForegroundColor $White
        
        # Check if user already has permissions
        $userPermission = $currentPermissions.value | Where-Object { 
            $_.grantedToV2.user.userPrincipalName -eq $UserPrincipalName 
        }
        
        if ($userPermission) {
            Write-Host "   ✅ User already has permissions: $($userPermission.roles -join ', ')" -ForegroundColor $Green
            return $userPermission
        }
        
        # Grant full access permissions to the user
        $permissionBody = @{
            roles = @("owner")  # Full access to container
            grantedToV2 = @{
                user = @{
                    userPrincipalName = $UserPrincipalName
                }
            }
        } | ConvertTo-Json -Depth 4
        
        Write-Host "   🔑 Granting owner permissions..." -ForegroundColor $White
        $response = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ContainerId/permissions" -Method POST -Body $permissionBody
        
        Write-Host "   ✅ Permissions granted successfully!" -ForegroundColor $Green
        Write-Host "   📋 Permission ID: $($response.id)" -ForegroundColor $Cyan
        Write-Host "   👤 Roles: $($response.roles -join ', ')" -ForegroundColor $Cyan
        
        return $response
        
    } catch {
        Write-Host "   ❌ Failed to grant permissions: $($_.Exception.Message)" -ForegroundColor $Red
        
        # Try to get more detailed error information
        if ($_.Exception.Response) {
            $errorDetail = $_.Exception.Response.Content.ReadAsStringAsync().Result
            Write-Host "   📄 Error details: $errorDetail" -ForegroundColor $Red
        }
        
        return $null
    }
}

Write-Host "🔐 SharePoint Embedded Container Permissions Setup" -ForegroundColor $Cyan
Write-Host "=================================================" -ForegroundColor $Cyan

try {
    # Connect to Microsoft Graph with broader permissions
    Write-Host "📋 Connecting to Microsoft Graph..." -ForegroundColor $Yellow
    Connect-MgGraph -Scopes "FileStorageContainer.Selected","User.Read" -TenantId $TenantId
    
    # Verify connection and get current user
    $currentUser = Get-MgContext
    Write-Host "✅ Connected as: $($currentUser.Account)" -ForegroundColor $Green
    Write-Host "🏢 Tenant: $($currentUser.TenantId)" -ForegroundColor $Cyan
    
    # Grant permissions to both containers
    $devResult = Grant-ContainerPermissions -ContainerId $DevContainerId -Environment "Development" -UserPrincipalName $AdminUser
    $prodResult = Grant-ContainerPermissions -ContainerId $ProdContainerId -Environment "Production" -UserPrincipalName $AdminUser
    
    Write-Host "`n🎉 Container Permissions Setup Complete!" -ForegroundColor $Green
    Write-Host "========================================" -ForegroundColor $Green
    
    if ($devResult -and $prodResult) {
        Write-Host "`n✅ Both containers are now accessible!" -ForegroundColor $Green
        Write-Host "📋 Next Steps:" -ForegroundColor $Yellow
        Write-Host "1. Wait 2-3 minutes for permissions to propagate" -ForegroundColor $White
        Write-Host "2. Re-run the Configure-SCDP-Metadata.ps1 script" -ForegroundColor $White
        Write-Host "3. Metadata configuration should now succeed" -ForegroundColor $White
    } else {
        Write-Host "`n⚠️  Some containers may still have permission issues" -ForegroundColor $Yellow
        Write-Host "📋 Check the error messages above for troubleshooting" -ForegroundColor $White
    }

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor $Red
    
    # Common issues and solutions
    Write-Host "`n🔧 Common Solutions:" -ForegroundColor $Yellow
    Write-Host "1. Ensure you're a SharePoint Administrator in the tenant" -ForegroundColor $White
    Write-Host "2. Check that container type is registered in consuming tenant" -ForegroundColor $White
    Write-Host "3. Verify the container IDs are correct" -ForegroundColor $White
    Write-Host "4. Try running as Global Administrator" -ForegroundColor $White
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}