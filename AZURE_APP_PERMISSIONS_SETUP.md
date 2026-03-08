# Azure AD App Permissions Setup for SharePoint Embedded

## Required Permissions

All SPE container operations go through **Microsoft Graph** — no separate SharePoint API permissions are needed.

### Microsoft Graph Permissions
**Resource App ID**: `00000003-0000-0000-c000-000000000000`

| Permission Name | Type | Purpose |
|-----------------|------|---------|
| FileStorageContainer.Selected | Application | Create/manage SPE containers (app-only) |
| FileStorageContainer.Selected | Delegated | Access SPE containers on behalf of user |
| Files.ReadWrite.All | Application | Read/write files in containers |
| Sites.Read.All | Application | Read site collections |

### Standard Delegated Permissions (sign-in)

| Permission Name | Type | Purpose |
|-----------------|------|---------|
| openid | Delegated | Sign in |
| profile | Delegated | Read user profile |
| email | Delegated | Read user email |
| User.Read | Delegated | Read user profile |
| offline_access | Delegated | Maintain refresh tokens |
| Group.Read.All | Delegated | Read group memberships |
| Tasks.ReadWrite | Delegated | Planner task sync |
| Sites.FullControl.All | Delegated | Full SharePoint access for user |

---

## Granting Admin Consent

### For Your Own Tenant

1. Go to **Azure Portal** → **App Registrations** → **Synozur Constellation SCDP**
2. Click **API Permissions**
3. Verify all permissions above are listed
4. Click **"Grant admin consent for [your tenant]"**
5. All permissions should show green checkmarks

### For Customer Tenants (Multi-Tenant SaaS)

Customer tenant admins grant consent by visiting:

```
https://login.microsoftonline.com/organizations/v2.0/adminconsent
  ?client_id=198aa0a6-d2ed-4f35-b41b-b6f6778a30d6
  &scope=https://graph.microsoft.com/.default
  &redirect_uri=https://constellation.replit.app/api/auth/admin-consent-callback
  &state={tenant-identifier}
```

This is a one-time step per customer tenant. No tenant IDs need to be copied manually.

---

## Container Type Registration

After permissions are granted, the app automatically registers the container type on startup. This can also be triggered manually:

```bash
POST /api/admin/register-container-type
```

---

## Troubleshooting

### Admin Consent Fails with "Claim is invalid"
**Cause**: An outdated or invalid permission ID is in the app's permission list.
**Fix**: Go to API Permissions, find any permission showing only a GUID (no friendly name) or under a non-Graph API section, remove it, then re-consent.

### "missing_tenant_id_error" in Development
**Cause**: Client credentials flow requires a specific Azure AD tenant ID, not `common`.
**Note**: This only affects app-only operations (SPE, Planner sync). User sign-in works fine with `common`.

### 401 Unauthorized
**Fix**:
- Verify certificate is uploaded to Azure Portal
- Check that Graph permissions are granted with admin consent
- Ensure the app registration is set to multi-tenant

---

## ⚠️ Deprecated: SharePoint API Permissions

Previously, this guide recommended adding a **SharePoint Online** `Container.Selected` permission (`19766c1b-905b-43af-8756-06526ab42875`). This permission is **no longer needed** — all SPE operations now use Microsoft Graph's `FileStorageContainer.Selected` instead. If you have this SharePoint permission in your app registration, **remove it** as it can block admin consent.

---

## References

- [SharePoint Embedded Authentication](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/concepts/app-concepts/auth)
- [Register Container Type API](https://learn.microsoft.com/en-us/sharepoint/dev/embedded/getting-started/register-api-documentation)
