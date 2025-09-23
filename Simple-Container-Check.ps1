#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Simple SharePoint Embedded Container Diagnostics and Admin Consent Helper

.DESCRIPTION
This script helps diagnose SharePoint Embedded container access issues and guides through the admin consent process.
It uses standard Microsoft Graph PowerShell commands without complex authentication handling.
#>

# Configuration
$ContainerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$DevContainerId = "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ProdContainerId = "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$TenantId = "synozur.onmicrosoft.com"
$ConsumingTenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee"
$OwningAppId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"

# Colors for output
$Green = "Green"
$Yellow = "Yellow" 
$Red = "Red"
$Cyan = "Cyan"
$White = "White"
$Blue = "Blue"

function Test-ContainerAccess {
    param($ContainerId, $ContainerName)
    
    Write-Host "`n🧪 Testing $ContainerName Container Access..." -ForegroundColor $Yellow
    Write-Host "Container ID: $ContainerId" -ForegroundColor $Cyan
    
    try {
        Write-Host "   📋 Attempting basic container info..." -ForegroundColor $White
        $container = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ContainerId" -Method GET
        
        Write-Host "   ✅ Container accessible!" -ForegroundColor $Green
        Write-Host "   📋 Name: $($container.displayName)" -ForegroundColor $Cyan
        Write-Host "   📋 Status: $($container.status)" -ForegroundColor $Cyan
        
        # Test permissions endpoint
        Write-Host "   🔍 Testing permissions endpoint..." -ForegroundColor $White
        $permissions = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ContainerId/permissions" -Method GET
        Write-Host "   ✅ Permissions endpoint accessible - $($permissions.value.Count) permissions found" -ForegroundColor $Green
        
        # Test columns endpoint (metadata schema)
        Write-Host "   📊 Testing metadata columns endpoint..." -ForegroundColor $White
        $columns = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/beta/storage/fileStorage/containers/$ContainerId/columns" -Method GET
        Write-Host "   ✅ Columns endpoint accessible - $($columns.value.Count) columns found" -ForegroundColor $Green
        
        return $true
        
    } catch {
        Write-Host "   ❌ Access failed: $($_.Exception.Message)" -ForegroundColor $Red
        
        if ($_.Exception.Message -match "Forbidden") {
            Write-Host "   🔐 This indicates missing container type registration or permissions" -ForegroundColor $Yellow
        }
        
        return $false
    }
}

function Show-AdminConsentInstructions {
    Write-Host "`n🔗 Admin Consent Required" -ForegroundColor $Yellow
    Write-Host "========================" -ForegroundColor $Yellow
    
    $consentUrl = "https://login.microsoftonline.com/$ConsumingTenantId/adminconsent?client_id=$OwningAppId"
    
    Write-Host "`n📋 Steps to complete admin consent:" -ForegroundColor $White
    Write-Host "1. Open this URL in your browser:" -ForegroundColor $White
    Write-Host "   $consentUrl" -ForegroundColor $Blue
    Write-Host "`n2. Sign in with Global Administrator account" -ForegroundColor $White
    Write-Host "3. Review and accept the permissions:" -ForegroundColor $White
    Write-Host "   • Microsoft Graph: FileStorageContainer.Selected" -ForegroundColor $Cyan
    Write-Host "   • SharePoint Online: Container.Selected" -ForegroundColor $Cyan
    Write-Host "4. Click 'Accept' to grant admin consent" -ForegroundColor $White
    
    Write-Host "`n⚠️  Important: This must be done by a Global Administrator" -ForegroundColor $Yellow
}

function Show-ContainerTypeRegistrationInfo {
    Write-Host "`n🔧 Container Type Registration Process" -ForegroundColor $Yellow
    Write-Host "=====================================" -ForegroundColor $Yellow
    
    Write-Host "`n📋 SharePoint Embedded container types require registration via SharePoint REST API:" -ForegroundColor $White
    Write-Host "1. Container types are managed through Microsoft Graph, not SharePoint Admin Center" -ForegroundColor $White
    Write-Host "2. Registration uses SharePoint REST API: _api/v2.1/storageContainerTypes" -ForegroundColor $Cyan
    Write-Host "3. Requires certificate-based authentication (not client secrets)" -ForegroundColor $White
    Write-Host "4. Must be done by the owning application after admin consent" -ForegroundColor $White
    
    Write-Host "`n⚠️  Key Requirements:" -ForegroundColor $Yellow
    Write-Host "• Admin consent must be completed first" -ForegroundColor $White
    Write-Host "• Certificate authentication required for registration API" -ForegroundColor $White
    Write-Host "• Container type ID: $ContainerTypeId" -ForegroundColor $Cyan
}

function Test-GraphPermissions {
    Write-Host "`n🔍 Testing Microsoft Graph Permissions..." -ForegroundColor $Yellow
    
    try {
        # Test basic Graph access
        $context = Get-MgContext
        Write-Host "   ✅ Connected to Graph as: $($context.Account)" -ForegroundColor $Green
        Write-Host "   📋 Scopes: $($context.Scopes -join ', ')" -ForegroundColor $Cyan
        
        # Test user permissions
        $user = Get-MgUser -UserId $context.Account
        Write-Host "   ✅ User profile accessible" -ForegroundColor $Green
        
        # Test if we can list any file storage containers
        Write-Host "   🗂️  Testing file storage container access..." -ForegroundColor $White
        $containers = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" -Method GET
        Write-Host "   ✅ Container listing works - found $($containers.value.Count) containers" -ForegroundColor $Green
        
        return $true
        
    } catch {
        Write-Host "   ❌ Graph permission test failed: $($_.Exception.Message)" -ForegroundColor $Red
        return $false
    }
}

# Main execution
Write-Host "🔍 SharePoint Embedded Container Diagnostics" -ForegroundColor $Cyan
Write-Host "============================================" -ForegroundColor $Cyan

try {
    # Connect to Microsoft Graph
    Write-Host "`n📋 Connecting to Microsoft Graph..." -ForegroundColor $Yellow
    Connect-MgGraph -Scopes "FileStorageContainer.Selected","User.Read","Directory.Read.All" -TenantId $TenantId -NoWelcome
    
    # Test basic Graph permissions
    $graphWorking = Test-GraphPermissions
    
    if ($graphWorking) {
        # Test container access
        $devAccess = Test-ContainerAccess -ContainerId $DevContainerId -ContainerName "Development"
        $prodAccess = Test-ContainerAccess -ContainerId $ProdContainerId -ContainerName "Production"
        
        if ($devAccess -and $prodAccess) {
            Write-Host "`n🎉 Success! Both containers are accessible!" -ForegroundColor $Green
            Write-Host "=====================================" -ForegroundColor $Green
            Write-Host "`n✅ You can now run the metadata configuration script:" -ForegroundColor $Green
            Write-Host ".\Configure-SCDP-Metadata.ps1" -ForegroundColor $Cyan
            
        } else {
            Write-Host "`n❌ Container Access Issues Detected" -ForegroundColor $Red
            Write-Host "==================================" -ForegroundColor $Red
            
            Write-Host "`n🔧 Required Actions:" -ForegroundColor $Yellow
            
            # Show admin consent instructions
            Show-AdminConsentInstructions
            
            # Show container type registration information
            Show-ContainerTypeRegistrationInfo
            
            Write-Host "`n📋 After completing admin consent:" -ForegroundColor $Yellow
            Write-Host "1. Wait 5-10 minutes for changes to propagate" -ForegroundColor $White
            Write-Host "2. Re-run this diagnostic script" -ForegroundColor $White
            Write-Host "3. If containers become accessible, run metadata script" -ForegroundColor $White
        }
    } else {
        Write-Host "`n❌ Basic Graph access failed" -ForegroundColor $Red
        Write-Host "Check your account permissions and try again" -ForegroundColor $White
    }

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor $Red
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}