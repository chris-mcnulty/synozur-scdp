#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Register SharePoint Embedded Container Type in Consuming Tenant

.DESCRIPTION
This script handles the complete registration process for SharePoint Embedded container types:
1. Grants admin consent for required permissions
2. Registers the container type in the consuming tenant
3. Verifies registration success

This must be completed BEFORE any container operations can work.
#>

# Configuration
$ContainerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$OwningAppId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"  # Microsoft Graph Command Line Tools
$TenantId = "synozur.onmicrosoft.com"
$ConsumingTenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee"  # From your connection info

# Colors for output
$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"
$Blue = "Blue"

function Test-AdminRole {
    Write-Host "🔍 Checking admin roles..." -ForegroundColor $Yellow
    
    try {
        # Get current user's directory roles
        $currentUser = Get-MgContext
        $user = Get-MgUser -UserId $currentUser.Account
        $roleAssignments = Get-MgUserDirectoryRole -UserId $user.Id
        
        $adminRoles = @()
        foreach ($role in $roleAssignments) {
            $roleDetail = Get-MgDirectoryRole -DirectoryRoleId $role.Id
            $adminRoles += $roleDetail.DisplayName
        }
        
        Write-Host "📋 Your roles: $($adminRoles -join ', ')" -ForegroundColor $Cyan
        
        $requiredRoles = @("Global Administrator", "SharePoint Administrator")
        $hasRequiredRole = $false
        
        foreach ($requiredRole in $requiredRoles) {
            if ($adminRoles -contains $requiredRole) {
                Write-Host "✅ Found required role: $requiredRole" -ForegroundColor $Green
                $hasRequiredRole = $true
                break
            }
        }
        
        if (-not $hasRequiredRole) {
            Write-Host "⚠️  You may need Global Administrator or SharePoint Administrator role" -ForegroundColor $Yellow
            Write-Host "   Current roles: $($adminRoles -join ', ')" -ForegroundColor $White
        }
        
        return $hasRequiredRole
        
    } catch {
        Write-Host "⚠️  Could not verify admin roles: $($_.Exception.Message)" -ForegroundColor $Yellow
        return $false
    }
}

function Show-AdminConsentUrl {
    param($AppId, $TenantId)
    
    Write-Host "`n🔗 Admin Consent Required" -ForegroundColor $Yellow
    Write-Host "========================" -ForegroundColor $Yellow
    
    $consentUrl = "https://login.microsoftonline.com/$TenantId/adminconsent?client_id=$AppId"
    
    Write-Host "`nVisit this URL to grant admin consent:" -ForegroundColor $White
    Write-Host $consentUrl -ForegroundColor $Blue
    
    Write-Host "`nThis grants the following permissions:" -ForegroundColor $White
    Write-Host "• Microsoft Graph: FileStorageContainer.Selected" -ForegroundColor $Cyan
    Write-Host "• SharePoint Online: Container.Selected" -ForegroundColor $Cyan
    
    $response = Read-Host "`nHave you completed admin consent? (y/n)"
    return ($response -eq 'y' -or $response -eq 'Y')
}

function Register-ContainerType {
    param($ContainerTypeId, $TenantId)
    
    Write-Host "`n📋 Registering Container Type..." -ForegroundColor $Yellow
    Write-Host "Container Type ID: $ContainerTypeId" -ForegroundColor $Cyan
    Write-Host "Tenant: $TenantId" -ForegroundColor $Cyan
    
    try {
        # Get SharePoint root site URL
        $sharepointDomain = "$TenantId.sharepoint.com"
        if ($TenantId.EndsWith(".onmicrosoft.com")) {
            $sharepointDomain = $TenantId.Replace(".onmicrosoft.com", ".sharepoint.com")
        }
        
        $rootSiteUrl = "https://$sharepointDomain"
        Write-Host "SharePoint URL: $rootSiteUrl" -ForegroundColor $Cyan
        
        # Registration endpoint
        $registrationUri = "$rootSiteUrl/_api/v2.1/storageContainerTypes/$ContainerTypeId/applicationPermissions"
        
        Write-Host "`n🔑 Attempting container type registration..." -ForegroundColor $White
        
        # Get access token for SharePoint
        $token = [Microsoft.Graph.Authentication.GraphSession]::Instance.AuthenticationProvider.GetAccessTokenAsync("https://$sharepointDomain/.default").Result
        
        $headers = @{
            'Authorization' = "Bearer $token"
            'Accept' = 'application/json'
            'Content-Type' = 'application/json'
        }
        
        # Registration payload
        $registrationBody = @{
            containerTypeId = $ContainerTypeId
            permissions = @("read", "write", "execute")
        } | ConvertTo-Json -Depth 3
        
        # Make registration call
        $response = Invoke-RestMethod -Uri $registrationUri -Method PUT -Headers $headers -Body $registrationBody
        
        Write-Host "✅ Container type registered successfully!" -ForegroundColor $Green
        Write-Host "📋 Registration response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor $Cyan
        
        return $true
        
    } catch {
        Write-Host "❌ Registration failed: $($_.Exception.Message)" -ForegroundColor $Red
        
        if ($_.Exception.Response) {
            $errorDetail = $_.Exception.Response.Content.ReadAsStringAsync().Result
            Write-Host "📄 Error details: $errorDetail" -ForegroundColor $Red
        }
        
        Write-Host "`n🔧 Common solutions:" -ForegroundColor $Yellow
        Write-Host "1. Ensure admin consent was granted" -ForegroundColor $White
        Write-Host "2. Verify you have Global Administrator role" -ForegroundColor $White
        Write-Host "3. Check the container type ID is correct" -ForegroundColor $White
        Write-Host "4. Ensure SharePoint URL is accessible" -ForegroundColor $White
        
        return $false
    }
}

function Test-ContainerAccess {
    param($ContainerId)
    
    Write-Host "`n🧪 Testing container access..." -ForegroundColor $Yellow
    Write-Host "Container: $ContainerId" -ForegroundColor $Cyan
    
    try {
        $response = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ContainerId" -Method GET
        Write-Host "✅ Container is accessible!" -ForegroundColor $Green
        Write-Host "📋 Container name: $($response.displayName)" -ForegroundColor $Cyan
        return $true
    } catch {
        Write-Host "❌ Container access test failed: $($_.Exception.Message)" -ForegroundColor $Red
        return $false
    }
}

# Main execution
Write-Host "🚀 SharePoint Embedded Container Type Registration" -ForegroundColor $Cyan
Write-Host "==================================================" -ForegroundColor $Cyan

try {
    # Connect to Microsoft Graph
    Write-Host "`n📋 Connecting to Microsoft Graph..." -ForegroundColor $Yellow
    Connect-MgGraph -Scopes "Directory.Read.All","Application.Read.All","User.Read" -TenantId $TenantId
    
    $currentUser = Get-MgContext
    Write-Host "✅ Connected as: $($currentUser.Account)" -ForegroundColor $Green
    Write-Host "🏢 Tenant: $($currentUser.TenantId)" -ForegroundColor $Cyan
    
    # Check admin roles
    $hasAdminRole = Test-AdminRole
    
    # Show admin consent URL and wait for completion
    $consentCompleted = Show-AdminConsentUrl -AppId $OwningAppId -TenantId $ConsumingTenantId
    
    if (-not $consentCompleted) {
        Write-Host "❌ Admin consent is required before proceeding." -ForegroundColor $Red
        Write-Host "Please complete admin consent and re-run this script." -ForegroundColor $White
        return
    }
    
    # Disconnect and reconnect with container permissions
    Disconnect-MgGraph
    Write-Host "`n🔄 Reconnecting with container permissions..." -ForegroundColor $Yellow
    Connect-MgGraph -Scopes "FileStorageContainer.Selected","Sites.FullControl.All" -TenantId $TenantId
    
    # Register container type
    $registrationSuccess = Register-ContainerType -ContainerTypeId $ContainerTypeId -TenantId $TenantId
    
    if ($registrationSuccess) {
        Write-Host "`n🎉 Container Type Registration Complete!" -ForegroundColor $Green
        Write-Host "=====================================" -ForegroundColor $Green
        
        # Test container access
        $devContainerId = "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
        $prodContainerId = "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
        
        Write-Host "`n🧪 Testing container access..." -ForegroundColor $Yellow
        $devAccess = Test-ContainerAccess -ContainerId $devContainerId
        $prodAccess = Test-ContainerAccess -ContainerId $prodContainerId
        
        if ($devAccess -and $prodAccess) {
            Write-Host "`n✅ Both containers are now accessible!" -ForegroundColor $Green
            Write-Host "`n📋 Next Steps:" -ForegroundColor $Yellow
            Write-Host "1. Run Fix-Container-Permissions.ps1 to grant user permissions" -ForegroundColor $White
            Write-Host "2. Run Configure-SCDP-Metadata.ps1 to configure metadata schema" -ForegroundColor $White
            Write-Host "3. Container operations should now work properly" -ForegroundColor $White
        } else {
            Write-Host "`n⚠️  Some containers may still be inaccessible" -ForegroundColor $Yellow
            Write-Host "This may take a few minutes to propagate" -ForegroundColor $White
        }
    } else {
        Write-Host "`n❌ Container type registration failed" -ForegroundColor $Red
        Write-Host "Please check the error messages above and try again" -ForegroundColor $White
    }

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor $Red
    
    Write-Host "`n🔧 Troubleshooting:" -ForegroundColor $Yellow
    Write-Host "1. Ensure you're running as Global Administrator" -ForegroundColor $White
    Write-Host "2. Verify the tenant ID and container type ID are correct" -ForegroundColor $White
    Write-Host "3. Check SharePoint is accessible for your tenant" -ForegroundColor $White
    Write-Host "4. Try running the script again after a few minutes" -ForegroundColor $White
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}