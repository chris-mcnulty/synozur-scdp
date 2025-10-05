#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
Register Microsoft Graph CLI with your container type

.DESCRIPTION
Since you're the container type owner, you can register the Graph CLI app 
(14d82eec-204b-4c2f-b7e8-296a70dab67e) with your container type.
This allows the existing scripts to work without authentication issues.
#>

# Configuration
$ContainerTypeId = "358aba7d-bb55-4ce0-a08d-e51f03d5edf1"
$GraphCLIAppId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"  # Microsoft Graph CLI
$OwningAppId = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6"    # Your owning app
$TenantId = "b4fbeaf7-1c91-43bb-8031-49eb8d4175ee"

$Green = "Green"
$Yellow = "Yellow"
$Red = "Red"
$Cyan = "Cyan"
$White = "White"

Write-Host "🔧 Registering Microsoft Graph CLI with Container Type" -ForegroundColor $Cyan
Write-Host "====================================================" -ForegroundColor $Cyan
Write-Host "Container Type: $ContainerTypeId" -ForegroundColor $Cyan
Write-Host "Graph CLI App: $GraphCLIAppId" -ForegroundColor $Cyan

try {
    # Connect using your owning app (device code to avoid redirect issues)
    Write-Host "`n📋 Connecting with your owning app..." -ForegroundColor $Yellow
    Connect-MgGraph -ClientId $OwningAppId -TenantId $TenantId -UseDeviceAuthentication -Scopes "https://graph.microsoft.com/Sites.FullControl.All"
    
    # Get SharePoint root site URL
    $sharepointUrl = "https://synozur.sharepoint.com"
    Write-Host "SharePoint URL: $sharepointUrl" -ForegroundColor $Cyan
    
    # Registration endpoint
    $registrationUri = "$sharepointUrl/_api/v2.1/storageContainerTypes/$ContainerTypeId/applicationPermissions"
    
    Write-Host "`n🔑 Registering Graph CLI app with container type..." -ForegroundColor $White
    
    # Registration payload - grant full permissions to Graph CLI app
    $registrationBody = @{
        value = @(
            @{
                appId = $GraphCLIAppId
                delegated = @("full")
                appOnly = @("full")
            }
        )
    } | ConvertTo-Json -Depth 4
    
    Write-Host "Registration payload:" -ForegroundColor $Yellow
    Write-Host $registrationBody -ForegroundColor $White
    
    # Make registration call using SharePoint REST API
    $headers = @{
        'Content-Type' = 'application/json'
        'Accept' = 'application/json'
    }
    
    $response = Invoke-MgGraphRequest -Uri $registrationUri -Method PUT -Body $registrationBody -Headers $headers
    
    Write-Host "✅ Graph CLI app registered successfully!" -ForegroundColor $Green
    Write-Host "📋 Registration response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor $Cyan
    
    Write-Host "`n🎉 Registration Complete!" -ForegroundColor $Green
    Write-Host "======================" -ForegroundColor $Green
    Write-Host "`n📋 Next Steps:" -ForegroundColor $Yellow
    Write-Host "1. Wait 2-3 minutes for registration to propagate" -ForegroundColor $White
    Write-Host "2. Run the original Configure-SCDP-Metadata.ps1 script" -ForegroundColor $White
    Write-Host "3. It should now work with Graph CLI authentication" -ForegroundColor $White

} catch {
    Write-Host "❌ Registration failed: $($_.Exception.Message)" -ForegroundColor $Red
    
    Write-Host "`n🔧 Alternative Solutions:" -ForegroundColor $Yellow
    Write-Host "1. Add redirect URI to your app registration:" -ForegroundColor $White
    Write-Host "   Azure Portal → App registrations → $OwningAppId → Authentication" -ForegroundColor $Cyan
    Write-Host "   Add URI: http://localhost:60032" -ForegroundColor $Cyan
    Write-Host "2. Use the device code script: Configure-SCDP-Metadata-DeviceCode.ps1" -ForegroundColor $White
    Write-Host "3. Enable public client flows in your app registration" -ForegroundColor $White
    
} finally {
    Write-Host "`n🔌 Disconnecting..." -ForegroundColor $Yellow
    Disconnect-MgGraph
    Write-Host "✅ Complete!" -ForegroundColor $Green
}