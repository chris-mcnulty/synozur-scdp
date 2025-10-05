#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Configure SCDP document metadata schema using the correct owning application

.DESCRIPTION
This script uses the correct OwningAppId (198aa0a6-d2ed-4f35-b41b-b6f6778a30d6) to configure
metadata for SharePoint Embedded containers. Since you are the container type owner,
this should work with the correct authentication.
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

    # 3. Client Name (Denormalized for search/display)
    $clientNameColumn = @{
        description = "Client name for search and display"
        displayName = "Client Name"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_clientName"
        text = @{
            allowMultipleLines = $false
            maxLength = 255
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $clientNameColumn

    # 4. Project ID (Optional FK to projects table)
    $projectIdColumn = @{
        description = "Project ID reference (GUID)"
        displayName = "Project ID"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_projectId"
        text = @{
            allowMultipleLines = $false
            maxLength = 36
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $projectIdColumn

    # 5. Project Code (Denormalized for search/filter)
    $projectCodeColumn = @{
        description = "Project code for search and filtering"
        displayName = "Project Code"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_projectCode"
        text = @{
            allowMultipleLines = $false
            maxLength = 50
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $projectCodeColumn

    # 6. Effective Date (Optional)
    $effectiveDateColumn = @{
        description = "Effective date for contracts, SOWs, estimates, change orders"
        displayName = "Effective Date"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_effectiveDate"
        dateTime = @{
            displayAs = "default"
            format = "dateOnly"
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $effectiveDateColumn

    # 7. Amount (Optional - for invoices/receipts/change orders)
    $amountColumn = @{
        description = "Monetary amount for financial documents"
        displayName = "Amount"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_amount"
        number = @{
            decimalPlaces = 2
            displayAs = "number"
            maximum = 9999999.99
            minimum = 0
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $amountColumn

    # 8. Estimate ID (Optional FK to estimates)
    $estimateIdColumn = @{
        description = "Estimate ID reference when applicable"
        displayName = "Estimate ID"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_estimateId"
        text = @{
            allowMultipleLines = $false
            maxLength = 36
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $estimateIdColumn

    # 9. Change Order ID (Optional FK to change orders)
    $changeOrderIdColumn = @{
        description = "Change Order ID reference when applicable"
        displayName = "Change Order ID"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $true
        name = "scdp_changeOrderId"
        text = @{
            allowMultipleLines = $false
            maxLength = 36
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $changeOrderIdColumn

    # 10. Tags (Optional free-form keywords)
    $tagsColumn = @{
        description = "Free-form tags for additional categorization"
        displayName = "Tags"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $false
        name = "scdp_tags"
        text = @{
            allowMultipleLines = $true
            maxLength = 500
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $tagsColumn

    # 11. Created By User ID (For audit trail)
    $createdByColumn = @{
        description = "User ID who uploaded this document"
        displayName = "Created By User ID"
        enforceUniqueValues = $false
        hidden = $false
        indexed = $false
        name = "scdp_createdByUserId"
        text = @{
            allowMultipleLines = $false
            maxLength = 36
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $createdByColumn

    # 12. Metadata Version (For future schema evolution)
    $metadataVersionColumn = @{
        description = "Metadata template version for future upgrades"
        displayName = "Metadata Version"
        enforceUniqueValues = $false
        hidden = $true
        indexed = $false
        name = "scdp_metadataVersion"
        number = @{
            decimalPlaces = 0
            displayAs = "number"
            maximum = 999
            minimum = 1
        }
        defaultValue = @{
            value = 1
        }
    }
    Add-SCDPMetadataColumn -ContainerId $ContainerId -Environment $Environment -ColumnDef $metadataVersionColumn

    Write-Host "✅ $Environment metadata schema configured" -ForegroundColor $Green
}

Write-Host "🏗️  SCDP Document Metadata Configuration (Using Owning App)" -ForegroundColor $Cyan
Write-Host "=============================================================" -ForegroundColor $Cyan
Write-Host "Owning App ID: $OwningAppId" -ForegroundColor $Cyan
Write-Host "Container Type: $ContainerTypeId" -ForegroundColor $Cyan

try {
    # Connect to Microsoft Graph using YOUR owning application
    Write-Host "`n📋 Connecting to Microsoft Graph with your owning app..." -ForegroundColor $Yellow
    Write-Host "⚠️  Important: You must use your owning app for authentication" -ForegroundColor $Yellow
    Write-Host "App ID: $OwningAppId" -ForegroundColor $Cyan
    
    # Note: This will likely require interactive authentication with your specific app
    Connect-MgGraph -ClientId $OwningAppId -TenantId $TenantId -Scopes "https://graph.microsoft.com/FileStorageContainer.Selected"
    
    # Verify connection
    $context = Get-MgContext
    Write-Host "✅ Connected as: $($context.Account)" -ForegroundColor $Green
    Write-Host "📋 Using App: $($context.ClientId)" -ForegroundColor $Cyan

    # Configure Development Container
    Add-SCDPDocumentMetadata -ContainerId $DevContainerId -Environment "Development"
    
    # Configure Production Container  
    Add-SCDPDocumentMetadata -ContainerId $ProdContainerId -Environment "Production"
    
    Write-Host "`n🎉 SCDP Metadata Configuration Complete!" -ForegroundColor $Green
    Write-Host "========================================" -ForegroundColor $Green
    
    Write-Host "`n📋 Document Types Configured:" -ForegroundColor $Yellow
    Write-Host "   • receipt - Expense receipts" -ForegroundColor $Cyan
    Write-Host "   • invoice - Client invoices" -ForegroundColor $Cyan
    Write-Host "   • statementOfWork - SOWs and proposals" -ForegroundColor $Cyan
    Write-Host "   • contract - Client contracts" -ForegroundColor $Cyan
    Write-Host "   • report - Project reports" -ForegroundColor $Cyan
    Write-Host "   • estimate - Project estimates" -ForegroundColor $Cyan
    Write-Host "   • changeOrder - Change orders" -ForegroundColor $Cyan
    
    Write-Host "`n📋 Metadata Fields Added:" -ForegroundColor $Yellow
    Write-Host "   ✅ scdp_documentType (required choice)" -ForegroundColor $Green
    Write-Host "   ✅ scdp_clientId + scdp_clientName" -ForegroundColor $Green
    Write-Host "   ✅ scdp_projectId + scdp_projectCode" -ForegroundColor $Green
    Write-Host "   ✅ scdp_effectiveDate" -ForegroundColor $Green
    Write-Host "   ✅ scdp_amount" -ForegroundColor $Green
    Write-Host "   ✅ scdp_estimateId + scdp_changeOrderId" -ForegroundColor $Green
    Write-Host "   ✅ scdp_tags + scdp_createdByUserId" -ForegroundColor $Green
    Write-Host "   ✅ scdp_metadataVersion" -ForegroundColor $Green

    Write-Host "`n📋 Next Steps:" -ForegroundColor $Yellow
    Write-Host "1. Update SCDP application configuration" -ForegroundColor $White
    Write-Host "2. Test file operations with metadata assignment" -ForegroundColor $White
    Write-Host "3. Verify expense receipt workflow integration" -ForegroundColor $White

} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor $Red
    
    Write-Host "`n🔧 Authentication Notes:" -ForegroundColor $Yellow
    Write-Host "1. You must authenticate using YOUR owning app: $OwningAppId" -ForegroundColor $White
    Write-Host "2. The Microsoft Graph CLI app cannot access your containers" -ForegroundColor $White
    Write-Host "3. Consider using certificate authentication for automation" -ForegroundColor $White
    Write-Host "4. Ensure your app has the required permissions configured" -ForegroundColor $White
    
    throw
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}