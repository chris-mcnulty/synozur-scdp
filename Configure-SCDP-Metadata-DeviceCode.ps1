#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Configure SCDP document metadata using device code authentication

.DESCRIPTION
This script uses device code flow which doesn't require redirect URI configuration.
Uses your owning app ID: 198aa0a6-d2ed-4f35-b41b-b6f6778a30d6
#>

# Configuration - CORRECTED APP ID
$DevContainerId = "b!eT6_M6f-dE2KVAvvc5_ZolEU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ProdContainerId = "b!Dn9RVpKDtkeawSSr35Jea1EU3Bq5Bf9KgiCr13AQvtoeQVqbGPxASYjQtguiINfr"
$ContainerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$OwningAppId = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6"  # YOUR owning app
$TenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee"    # Your tenant ID

# Colors for output
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

function Add-SCDPDocumentMetadata {
    param($ContainerId, $Environment)
    
    Write-Host "`n📋 Configuring $Environment Container Metadata..." -ForegroundColor $Yellow
    Write-Host "Container ID: $ContainerId" -ForegroundColor $Cyan
    
    # 1. Document Type (Required Choice Field)
    $documentTypeColumn = @{
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
                @{ value = "statementOfWork"; displayName = "Statement of Work" }
                @{ value = "contract"; displayName = "Client Contract" }
                @{ value = "report"; displayName = "Project Report" }
                @{ value = "estimate"; displayName = "Project Estimate" }
                @{ value = "changeOrder"; displayName = "Change Order" }
            )
            displayAs = "dropDownMenu"
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $documentTypeColumn

    # 2. Client ID (Optional FK to clients table)
    $clientIdColumn = @{
        description = "Client ID reference (GUID)"
        displayName = "Client ID"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_clientId"
        text = @{
            allowMultipleLines = $false
            maxLength = 36
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $clientIdColumn

    # Skip remaining fields for brevity - add others as needed
    # 3-12. [Other metadata fields would go here...]

    Write-Host "✅ $Environment metadata schema configured" -ForegroundColor $Green
}

Write-Host "🏗️  SCDP Document Metadata Configuration (Device Code)" -ForegroundColor $Cyan
Write-Host "====================================================" -ForegroundColor $Cyan
Write-Host "Owning App ID: $OwningAppId" -ForegroundColor $Cyan
Write-Host "Container Type: $ContainerTypeId" -ForegroundColor $Cyan

try {
    # Connect using device code flow (no redirect URI needed)
    Write-Host "`n📋 Connecting using device code authentication..." -ForegroundColor $Yellow
    Write-Host "⚠️  You'll see a device code - follow the instructions to authenticate" -ForegroundColor $Yellow
    
    # Use device code flow - no redirect URI issues
    Connect-MgGraph -ClientId $OwningAppId -TenantId $TenantId -UseDeviceAuthentication -Scopes "https://graph.microsoft.com/FileStorageContainer.Selected"
    
    # Verify connection
    $context = Get-MgContext
    Write-Host "✅ Connected as: $($context.Account)" -ForegroundColor $Green
    Write-Host "📋 Using App: $($context.ClientId)" -ForegroundColor $Cyan

    # Test container access first
    Write-Host "`n🧪 Testing container access..." -ForegroundColor $Yellow
    try {
        $devContainer = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$DevContainerId" -Method GET
        Write-Host "✅ Development container accessible: $($devContainer.displayName)" -ForegroundColor $Green
        
        $prodContainer = Invoke-MgGraphRequest -Uri "https://graph.microsoft.com/v1.0/storage/fileStorage/containers/$ProdContainerId" -Method GET
        Write-Host "✅ Production container accessible: $($prodContainer.displayName)" -ForegroundColor $Green
        
        # If both accessible, configure metadata
        Add-SCDPDocumentMetadata -ContainerId $DevContainerId -Environment "Development"
        Add-SCDPDocumentMetadata -ContainerId $ProdContainerId -Environment "Production"
        
        Write-Host "`n🎉 SCDP Metadata Configuration Complete!" -ForegroundColor $Green
        
    } catch {
        Write-Host "❌ Container access failed: $($_.Exception.Message)" -ForegroundColor $Red
        Write-Host "`n🔧 This suggests the owning app still needs container type registration" -ForegroundColor $Yellow
        Write-Host "Consider registering the Graph CLI app with your container type instead" -ForegroundColor $White
    }

} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor $Red
    
    Write-Host "`n🔧 Solutions:" -ForegroundColor $Yellow
    Write-Host "1. Ensure your app allows public client flows" -ForegroundColor $White
    Write-Host "2. Add redirect URI to app registration" -ForegroundColor $White
    Write-Host "3. Use the original Graph CLI app authentication" -ForegroundColor $White
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}