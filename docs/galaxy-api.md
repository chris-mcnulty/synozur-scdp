# Galaxy Client Portal API

The **Galaxy** API is an externally-consumable HTTP API mounted at `/api/galaxy/v1/*` that lets approved client-portal apps read project artifacts and post sign-offs on behalf of a client user.

It runs alongside (and is independent of) the internal A2A and MCP APIs. Tokens are issued by Constellation's own authorization server and authenticated against Microsoft Entra. Each token carries `tenantId` and `clientId` claims so all data is automatically scoped.

## 1. Registering an app

A tenant admin opens **Settings → Galaxy API** and clicks **Register app**. They configure:

| Field | Notes |
|------|------|
| Name / description | Shown in audit logs |
| Redirect URIs | Whitelisted callback URLs for OAuth code exchange |
| Webhook URL | Optional; signed events are POSTed here |
| Allowed origins | Optional CORS allow-list applied to browser callers |
| Scopes | The maximum set of scopes the app can request |

On creation the UI shows the **Client ID**, **Client secret**, and **Webhook signing secret** *once*. They are stored hashed and cannot be retrieved later — rotate the secret if lost.

## 2. OAuth flows

Two OAuth2 grants are supported.

### Authorization Code (delegated)
Use this when an end-user is logging in to your portal.

```
GET /api/galaxy/v1/oauth/authorize
  ?response_type=code
  &client_id=<APP_ID>
  &redirect_uri=<URL>
  &scope=projects:read estimates:read
  &state=<random>
```

The user must already be logged into Constellation as a client portal user belonging to the same tenant. After consent they're redirected to `redirect_uri` with `?code=…&state=…`.

Exchange the code:

```
POST /api/galaxy/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<CODE>
&redirect_uri=<URL>
&client_id=<APP_ID>
&client_secret=<SECRET>
```

Response:
```json
{
  "access_token": "eyJ…",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "grx_…",
  "scope": "projects:read estimates:read"
}
```

Refresh:
```
POST /api/galaxy/v1/oauth/token
grant_type=refresh_token
&refresh_token=<REFRESH>
&client_id=<APP_ID>
&client_secret=<SECRET>
```

Revoke:
```
POST /api/galaxy/v1/oauth/revoke
token=<REFRESH>&client_id=…&client_secret=…
```

### Client Credentials (service-to-service)
Service-to-service tokens are supported, but they are still strictly bound to a **single** client. There is no tenant-wide service token in v1.

```
POST /api/galaxy/v1/oauth/token
grant_type=client_credentials
&client_id=<APP_ID>
&client_secret=<APP_SECRET>
&target_client_id=<RESOURCE_CLIENT_ID>
&scope=projects:read invoices:read
```

The token mint will only succeed if the app already has at least one **non-revoked** authorization-code grant for a portal user belonging to `target_client_id`. This means an end user must have explicitly consented to the app for this client at least once before the service can act on the client's data.

The minted token has the same shape as a delegated token (`cid` is set to `target_client_id`, `gnt = "client_credentials"`), and resource handlers apply the same per-client filter. **Mutating endpoints (`/approve`, `/accept`, `/reject`, `/acknowledge`, `/comments`) reject `client_credentials` tokens with `403 delegated_token_required`** — only an authorization-code token from a real portal user may write.

## 3. Calling the API

### Pagination
List endpoints accept `limit` (max 200, default 50) and `cursor` query params. The response shape is:

```json
{ "items": [...], "nextCursor": "<opaque-string-or-null>" }
```

To fetch the next page, pass the previous response's `nextCursor` back as `?cursor=…`. The cursor is opaque — do not parse it.

### Filtering
Where applicable, list endpoints accept entity-specific filters as query params (e.g. `/projects?status=active`, `/projects/{id}/milestones?status=accepted`). See the OpenAPI document for the exhaustive list.



```
GET /api/galaxy/v1/projects
Authorization: Bearer eyJ…
```

Every response carries:

* `X-Request-Id` — opaque request id (echoed in audit log)
* `X-RateLimit-Limit-App` / `X-RateLimit-Remaining-App` — per-app, per-minute
* `X-RateLimit-Limit-Token` / `X-RateLimit-Remaining-Token` — per-token, per-minute

When rate-limited, expect `429` with `Retry-After`.

### Endpoints (excerpt)
See `/api/galaxy/v1/docs` for the live OpenAPI reference.

| Method | Path | Scope |
|--------|------|-------|
| GET | `/projects` | `projects:read` |
| GET | `/projects/{id}` | `projects:read` |
| GET | `/projects/{id}/status-reports` | `status_reports:read` |
| GET | `/projects/{id}/milestones` | `milestones:read` |
| GET | `/projects/{id}/raidd` | `raidd:read` |
| GET | `/projects/{id}/documents` | `documents:read` |
| GET | `/estimates/{id}` | `estimates:read` |
| GET | `/invoices` | `invoices:read` |
| POST | `/estimates/{id}/approve` | `estimates:approve` |
| POST | `/estimates/{id}/request-changes` | `estimates:approve` |
| POST | `/milestones/{id}/accept` | `milestones:accept` |
| POST | `/milestones/{id}/reject` | `milestones:accept` |
| POST | `/status-reports/{id}/acknowledge` | `status_reports:acknowledge` |
| POST | `/raidd/{id}/comments` | `raidd:comment` |

All sign-off mutations (`approve`, `accept`, `reject`, `acknowledge`, `commented`) write to the `client_signoffs` table and surface in Constellation's project history view.

## 4. Webhooks

If `webhookUrl` is configured, Constellation POSTs the events listed in
`x-galaxy-webhook-events` of the OpenAPI spec to that URL.

```
POST <webhookUrl>
Content-Type: application/json
X-Galaxy-Event: estimate.approved
X-Galaxy-Delivery: <delivery_id>
X-Galaxy-Signature: t=<unix_ts>,v1=<hex_hmac>

{ "id":"…", "event":"estimate.approved", "tenantId":"…", "appId":"…",
  "createdAt":"…", "data":{ "estimateId":"…", "signoffId":"…" } }
```

### Verifying signatures
HMAC-SHA256 over `"<timestamp>.<raw_body>"` using your **webhook signing secret**:

```js
const crypto = require("crypto");
function verify(secret, header, rawBody) {
  const [tsP, sigP] = header.split(",");
  const ts = tsP.split("=")[1];
  const sig = sigP.split("=")[1];
  const expected = crypto.createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`).digest("hex");
  if (Math.abs(Date.now()/1000 - Number(ts)) > 300) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
}
```

### Retry policy
Deliveries that don't return 2xx are retried with exponential backoff:
30 s → 2 m → 10 m → 1 h → 6 h → 24 h, then marked failed.

After **10 consecutive failed deliveries** to the same app, every tenant admin receives a notification with a deep-link to the Galaxy admin page.

## 5. Audit, monitoring & operational notes

* All requests are logged in `galaxy_api_audit` with method, route, status, duration, requestId, origin, IP, missing scope (if any), and error code. Visible at `/admin/galaxy` → **Audit log**.
* Rate-limit buckets live in `galaxy_rate_buckets` with a 90 s TTL. The worker process prunes expired rows on each cycle.
* The webhook delivery worker runs every 30 s inside the Node process.

## 6. Security model

* **Per-app HS256 JWT signing keys** — never exposed to clients. Compromise of one app does not affect others.
* **Secret storage** — `client_secret` and refresh tokens are stored as SHA-256 hashes (never reversible). The webhook signing secret must be stored in raw form server-side because it is used as the HMAC key on every delivery; it is only revealed to the registering admin at create/rotate time, can be rotated at any moment, and is never returned by any read API.
* **Tenant isolation** — every request joins on `tenantId` from the JWT. Resources without a matching tenant return 404.
* **Client isolation** — when a token is bound to a portal user, that user's `tenant_users.clientId` is enforced on every read so cross-client leaks are impossible.
* **Field projection** — internal financial fields (cost, margin, profit) are never serialized through Galaxy.
* **Origin allow-list** — apps may specify a CORS allow-list to defend against token theft from compromised front-ends.
