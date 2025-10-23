# Azure AD App Permissions Setup for SharePoint Embedded

## Critical Issue: Missing SharePoint Online Permissions

The file upload failures are caused by missing **SharePoint Online Container.Selected** permissions. SharePoint Embedded requires permissions from TWO different resource applications.

## Required Permissions

### 1. Microsoft Graph Permissions ✅
**Resource App ID**: `00000003-0000-0000-c000-000000000000`

| Permission ID | Permission Name | Type | Status |
|--------------|-----------------|------|--------|
| `40dc41bc-0f7e-42ff-89bd-d9516947e474` | FileStorageContainer.Selected | Application | ✅ Configured |
| `085ca537-6565-41c2-aca7-db852babc212` | FileStorageContainer.Selected | Delegated | ✅ Configured |

### 2. SharePoint Online Permissions ❌
**Resource App ID**: `00000003-0000-0ff1-ce00-000000000000`

| Permission ID | Permission Name | Type | Status |
|--------------|-----------------|------|--------|
| `19766c1b-905b-43af-8756-06526ab42875` | Container.Selected | Application | ❌ **MISSING** |
| `4d114b1a-3649-4764-9dfb-be1e236ff371` | Container.Selected | Delegated | ❌ **MISSING** |

---

## Step-by-Step Fix

### Step 1: Add SharePoint Permissions via Manifest

1. Go to **Azure Portal** → **App Registrations** → **SCDP-Content** (198aa0a6-d2ed-4f35-b41b-b6f6778a30d6)
2. Click **Manifest** in left sidebar
3. Find the `requiredResourceAccess` array
4. Add the following SharePoint Online entry:

```json
{
  "resourceAppId": "00000003-0000-0ff1-ce00-000000000000",
  "resourceAccess": [
    {
      "id": "19766c1b-905b-43af-8756-06526ab42875",
      "type": "Role"
    },
    {
      "id": "4d114b1a-3649-4764-9dfb-be1e236ff371",
      "type": "Scope"
    }
  ]
}
```

5. Click **Save**

### Step 2: Grant Admin Consent

**Option A: Via Azure Portal (May Show Errors)**
1. Go to **API Permissions**
2. Scroll to bottom and click **Enterprise applications** link
3. Click **Grant admin consent for [your tenant]**
4. Click **Yes**

**Note**: You may see errors like "Claim is invalid: 19766c1b-905b-43af-8756-06526ab42875 does not exist" - these can often be ignored if permissions are actually applied.

**Option B: Via Admin Consent URL (Recommended)**
```
https://login.microsoftonline.com/b4fbeaf7-1c91-43bb-8031-49eb8d4175ee/adminconsent?client_id=198aa0a6-d2ed-4f35-b41b-b6f6778a30d6
```

### Step 3: Verify Permissions

After granting consent, verify in **API Permissions** tab:
- ✅ Microsoft Graph: FileStorageContainer.Selected (Application)
- ✅ Microsoft Graph: FileStorageContainer.Selected (Delegated)
- ✅ SharePoint: Container.Selected (Application)
- ✅ SharePoint: Container.Selected (Delegated)

All four should show **"Granted for [tenant]"** with a green checkmark.

### Step 4: Register Container Type (One-Time Setup)

After permissions are granted, the app needs to register the container type with the tenant. This is done automatically on app startup via the `/api/admin/register-container-type` endpoint.

**Manual Registration (if needed)**:
```bash
curl -X POST https://your-domain/api/admin/register-container-type \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json"
```

---

## Complete Manifest Example

Your `requiredResourceAccess` should look like this:

```json
{
  "requiredResourceAccess": [
    {
      "resourceAppId": "00000003-0000-0000-c000-000000000000",
      "resourceAccess": [
        {
          "id": "40dc41bc-0f7e-42ff-89bd-d9516947e474",
          "type": "Role"
        },
        {
          "id": "085ca537-6565-41c2-aca7-db852babc212",
          "type": "Scope"
        },
        {
          "id": "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
          "type": "Scope"
        }
      ]
    },
    {
      "resourceAppId": "00000003-0000-0ff1-ce00-000000000000",
      "resourceAccess": [
        {
          "id": "19766c1b-905b-43af-8756-06526ab42875",
          "type": "Role"
        },
        {
          "id": "4d114b1a-3649-4764-9dfb-be1e236ff371",
          "type": "Scope"
        }
      ]
    }
  ]
}
```

---

## Troubleshooting

### "Container may not be properly configured" Error
**Cause**: Missing SharePoint Online Container.Selected permissions
**Fix**: Follow Step 1 and Step 2 above

### Admin Consent Shows Errors
**Symptom**: "Claim is invalid: 19766c1b-905b-43af-8756-06526ab42875 does not exist"
**Fix**: 
- These errors can sometimes be ignored
- Check if permissions appear in API Permissions tab with green checkmarks
- Try the admin consent URL method (Option B)

### Permissions Disappear After Adding New API Permissions
**Issue**: SharePoint Embedded permissions may be removed from manifest when adding other permissions
**Fix**: 
- Always check the manifest after adding new permissions
- Re-add SharePoint permissions if they're missing
- Grant admin consent again

### 401 Unauthorized in Development
**Cause**: Missing permissions or invalid certificate authentication
**Fix**:
- Verify certificate is uploaded to Azure Portal
- Verify thumbprint matches: `FB:AA:23:CA:DE:67:1C:19:8B:EE:FB:35:A5:33:FE:72:FD:94:7E:7B`
- Check that both Graph and SharePoint permissions are granted

---

## References

- [SharePoint Embedded Authentication](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/auth)
- [Register Container Type API](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation)
- [GitHub Issue: Unable to admin consent](https://github.com/SharePoint/sp-dev-docs/issues/9425)
