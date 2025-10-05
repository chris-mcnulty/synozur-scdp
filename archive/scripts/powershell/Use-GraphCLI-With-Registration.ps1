#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Use Graph CLI authentication and register it with container type via SharePoint Admin

.DESCRIPTION
Since Graph CLI authentication works but your owning app has auth issues,
this script uses Graph CLI auth and attempts container type registration through admin rights.
#>

# Configuration
$DevContainerId = "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ProdContainerId = "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ContainerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$GraphCLIAppId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
$TenantId = "synozur.onmicrosoft.com"

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

function Add-SCDPMetadataColumn {
    param(
        [string]$ContainerId,
        [string]$Environment,
        [hashtable]$ColumnDef
    )
    
    try {
        $body = $ColumnDef | ConvertTo-Json -Depth 4
        $response = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/beta/storage/fileStorage/containers/$ContainerId/columns" -Method POST -Body $body
        Write-Host "   ✅ Added: $($ColumnDef.displayName)" -ForegroundColor $Green
        return $response
    } catch {
        Write-Host "   ❌ Failed: $($ColumnDef.displayName) - $($_.Exception.Message)" -ForegroundColor $Red
        return $null
    }
}

Write-Host "🔧 SharePoint Embedded Metadata Setup (Graph CLI + Registration)" -ForegroundColor $Cyan
Write-Host "==============================================================" -ForegroundColor $Cyan

try {
    # Step 1: Connect with Graph CLI (we know this works)
    Write-Host "`n📋 Step 1: Connecting with Microsoft Graph CLI..." -ForegroundColor $Yellow
    Connect-MgGraph -Scopes "FileStorageContainer.Selected","Sites.FullControl.All" -TenantId $TenantId -NoWelcome
    
    $context = Get-MgContext
    Write-Host "✅ Connected as: $($context.Account)" -ForegroundColor $Green
    Write-Host "📋 Using App: $($context.ClientId)" -ForegroundColor $Cyan
    
    # Step 2: Test container access
    Write-Host "`n📋 Step 2: Testing container access..." -ForegroundColor $Yellow
    try {
        $devContainer = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$DevContainerId" -Method GET
        Write-Host "✅ Development container accessible" -ForegroundColor $Green
        
        $prodContainer = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ProdContainerId" -Method GET  
        Write-Host "✅ Production container accessible" -ForegroundColor $Green
        
        # If we can access containers, try to add metadata directly
        Write-Host "`n📋 Step 3: Adding metadata columns..." -ForegroundColor $Yellow
        
        # Test with one simple column first
        $testColumn = @{
            description = "Type of SCDP document"
            displayName = "Document Type"
            enforceUniqueValues = $false
            hidden = $false
            indexed = $true
            name = "scdp_documentType"
            required = $true
            choice = @{
                allowTextEntry = $false
                choices = @(
                    @{ value = "receipt"; displayName = "Expense Receipt" }
                    @{ value = "invoice"; displayName = "Client Invoice" }
                )
                displayAs = "dropDownMenu"
            }
        }
        
        # Try adding to dev container
        Write-Host "   🧪 Testing metadata addition to dev container..." -ForegroundColor $White
        $result = Add-SCDPMetadataColumn -ContainerId $DevContainerId -Environment "Development" -ColumnDef $testColumn
        
        if ($result) {
            Write-Host "`n🎉 SUCCESS! Metadata can be added!" -ForegroundColor $Green
            Write-Host "The Graph CLI app already has the necessary permissions." -ForegroundColor $Green
            Write-Host "`n📋 You can now run the original Configure-SCDP-Metadata.ps1 script" -ForegroundColor $Cyan
        } else {
            Write-Host "`n❌ Metadata addition failed - container type registration needed" -ForegroundColor $Red
        }
        
    } catch {
        Write-Host "❌ Container access failed: $($_.Exception.Message)" -ForegroundColor $Red
        
        # Step 3: If container access fails, try SharePoint admin approach
        Write-Host "`n📋 Step 3: Attempting SharePoint admin registration..." -ForegroundColor $Yellow
        
        try {
            $sharepointUrl = "https://synozur.sharepoint.com"
            $registrationUri = "$sharepointUrl/_api/v2.1/storageContainerTypes/$ContainerTypeId/applicationPermissions"
            
            $registrationBody = @{
                value = @(
                    @{
                        appId = $GraphCLIAppId
                        delegated = @("full")
                        appOnly = @("full")
                    }
                )
            } | ConvertTo-Json -Depth 4
            
            Write-Host "   🔑 Registering Graph CLI app with container type..." -ForegroundColor $White
            $response = Invoke-MgGraphRequest -Uri $registrationUri -Method PUT -Body $registrationBody
            
            Write-Host "✅ Registration successful!" -ForegroundColor $Green
            Write-Host "📋 Wait 2-3 minutes, then run Configure-SCDP-Metadata.ps1" -ForegroundColor $Cyan
            
        } catch {
            Write-Host "❌ Admin registration also failed: $($_.Exception.Message)" -ForegroundColor $Red
            
            Write-Host "`n🔧 Manual Steps Required:" -ForegroundColor $Yellow
            Write-Host "1. You may need to register the container type through:" -ForegroundColor $White
            Write-Host "   - SharePoint Admin Center (if available)" -ForegroundColor $White
            Write-Host "   - Direct API calls with certificate authentication" -ForegroundColor $White
            Write-Host "   - Microsoft Support for container type registration" -ForegroundColor $White
            Write-Host "`n2. Container Type ID: $ContainerTypeId" -ForegroundColor $Cyan
            Write-Host "3. Graph CLI App ID: $GraphCLIAppId" -ForegroundColor $Cyan
        }
    }

} catch {
    Write-Host "❌ Connection failed: $($_.Exception.Message)" -ForegroundColor $Red
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}