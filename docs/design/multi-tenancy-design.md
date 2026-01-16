# Constellation Multi-Tenancy Architecture Design

## Overview

This document outlines the design for converting Constellation from a single-tenant application to a multi-tenant SaaS platform, enabling software subscription offerings in 6-12 months. The design is modeled after Vega's proven multi-tenant architecture.

**Document Version:** 1.1  
**Created:** January 2026  
**Updated:** January 2026  
**Status:** Design Complete - Ready for Backlog  
**Priority:** P1 - High Priority  
**Based on:** Orion/Vega Multi-Tenancy Architecture

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Tenant ID Format** | UUID strings (varchar) | Consistency with Orion and Vega platforms |
| **Billing System** | Internal (for MVP) | Simplifies initial implementation; external integration (Stripe) can be added later |
| **Subdomain Routing** | Post-MVP feature | Not required for initial launch; focus on core multi-tenancy first |

---

## 1. Multi-Tenancy Concept

### What is Multi-Tenancy?

Multi-tenancy allows a single application instance to serve multiple independent organizations (tenants), each with:
- **Data Isolation**: Each tenant's data is completely separate
- **Custom Branding**: Organization-specific logos, colors, and naming (co-branding supported)
- **Independent Settings**: SSO configuration, vocabulary, preferences per tenant
- **User Management**: Each tenant manages their own users

### Constellation Multi-Tenancy Goals

1. **Subscription Readiness**: Enable offering Constellation as a SaaS product
2. **Tenant Isolation**: Complete data separation between organizations
3. **Self-Service Onboarding**: New organizations can sign up and configure their tenant
4. **Platform Administration**: Central management of all tenants by Synozur
5. **Consultant Access**: Synozur consultants can access client tenants for support
6. **Production Continuity**: Synozur's current production system remains fully operational during transition

---

## 2. Service Plans

### Plan Structure

| Plan | Users | Duration | Subdomain | Features |
|------|-------|----------|-----------|----------|
| **Trial** | 5 | 30-60 days | No | Core features, AI enabled, no SSO |
| **Team** | 5 (base) | Monthly or Annual | No | Full features, AI, basic branding |
| **Enterprise** | Generous user tiers | Annual | Yes (Premium) | Full features, SSO, custom branding, priority support |
| **Unlimited** | Unlimited | Perpetual | Yes | All features, used for Synozur and priority accounts |

### Plan Details

#### Trial Plan (30 or 60 days)
- **Max Users**: 5
- **Duration**: 30 or 60 days (configurable)
- **Features**:
  - Full project management functionality
  - AI-powered features (narrative generation, reports)
  - Basic branding (logo only)
  - No SSO
  - No SharePoint integration
  - Standard support
- **Post-Trial**: Read-only access, upgrade prompt, data retained 60 days after expiration

#### Team Plan (Starting at 5 Users)
- **User Tiers**: 5, 10, 25, 50 users
- **Billing**: Monthly or Annual (discount for annual)
- **Features**:
  - All Trial features
  - Co-branding (logo + colors)
  - SharePoint Online integration
  - Email notifications
  - Priority email support
- **No Subdomain**: Uses standard `app.constellation.synozur.com`

#### Enterprise Plan
- **User Tiers**: Generous, negotiated pricing
- **Billing**: Annual only
- **Features**:
  - All Team features
  - **Custom Subdomain** (e.g., `clientname.constellation.synozur.com`)
  - Azure AD SSO configuration
  - Dedicated SharePoint container
  - Advanced reporting
  - Phone/video support
  - Custom vocabulary defaults
  - Dedicated success manager

#### Unlimited Plan (Internal Use)
- **Users**: Unlimited
- **Billing**: N/A (internal/priority accounts)
- **Used For**:
  - Synozur Consulting (primary tenant)
  - Selected priority/strategic accounts
- **Features**:
  - All Enterprise features
  - Custom subdomain
  - Platform admin access (for Synozur)
  - Beta feature access

### Data Retention Policy

| Scenario | Retention Period |
|----------|-----------------|
| Active subscription | Indefinite |
| Trial expired | 60 days |
| Subscription cancelled | 60 days |
| Subscription suspended | 90 days (grace period) |
| After retention period | Permanent deletion with 30-day warning |

---

## 3. Database Schema Changes

### New Core Tables

> **Note:** All tables use UUID strings for primary keys to maintain consistency with Orion and Vega platforms.

```typescript
// Tenants (Organizations)
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(), // URL-friendly identifier
  
  // Branding (Co-branding supported)
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  primaryColor: varchar("primary_color", { length: 7 }), // Hex color
  secondaryColor: varchar("secondary_color", { length: 7 }),
  tagline: text("tagline"),
  
  // Subdomain (Enterprise/Unlimited only) - POST-MVP FEATURE
  customSubdomain: varchar("custom_subdomain", { length: 100 }).unique(), // e.g., "clientname"
  subdomainEnabled: boolean("subdomain_enabled").default(false),
  
  // Status
  status: varchar("status", { length: 50 }).default("active"), 
  // active, trial, expired, suspended, cancelled
  
  // Time settings
  fiscalYearStartMonth: integer("fiscal_year_start_month").default(1),
  defaultTimezone: varchar("default_timezone", { length: 50 }).default("America/New_York"),
  
  // Membership mode
  membershipMode: varchar("membership_mode", { length: 20 }).default("domain"), 
  // domain, invite_only
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Allowed Email Domains per Tenant
export const tenantDomains = pgTable("tenant_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  domain: varchar("domain", { length: 255 }).notNull(), // e.g., "company.com"
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow()
});

// Service Plans (Subscription Tiers)
export const servicePlans = pgTable("service_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  internalName: varchar("internal_name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Plan type
  planType: varchar("plan_type", { length: 50 }).notNull(), 
  // trial, team, enterprise, unlimited
  
  // Limits
  maxUsers: integer("max_users").default(5), // null = unlimited
  maxProjects: integer("max_projects"), // null = unlimited
  maxClients: integer("max_clients"), // null = unlimited
  
  // Features
  aiEnabled: boolean("ai_enabled").default(true),
  sharePointEnabled: boolean("sharepoint_enabled").default(false),
  ssoEnabled: boolean("sso_enabled").default(false),
  customBrandingEnabled: boolean("custom_branding_enabled").default(false),
  coBrandingEnabled: boolean("co_branding_enabled").default(true),
  subdomainEnabled: boolean("subdomain_enabled").default(false),
  
  // Trial settings
  trialDurationDays: integer("trial_duration_days"), // null = not a trial plan
  
  // Pricing (internal billing for MVP)
  monthlyPriceCents: integer("monthly_price_cents"),
  annualPriceCents: integer("annual_price_cents"),
  billingCycle: varchar("billing_cycle", { length: 20 }), // monthly, annual, both
  
  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default for new signups
  displayOrder: integer("display_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow()
});

// Tenant Plan Assignments
export const tenantPlans = pgTable("tenant_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  planId: varchar("plan_id").notNull().references(() => servicePlans.id),
  
  // Duration
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // null = no expiration (Unlimited plan)
  
  // Billing
  billingCycle: varchar("billing_cycle", { length: 20 }), // monthly, annual
  
  // Status
  status: varchar("status", { length: 50 }).default("active"), 
  // active, expired, cancelled, suspended
  
  // Grace period tracking
  gracePeriodEndDate: date("grace_period_end_date"),
  dataRetentionEndDate: date("data_retention_end_date"), // 60 days after expiration
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedBy: varchar("updated_by")
});

// Tenant SSO Configuration
export const tenantSsoConfig = pgTable("tenant_sso_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id).unique(),
  
  // Azure AD / Entra ID Settings
  azureTenantId: varchar("azure_tenant_id", { length: 255 }),
  azureClientId: varchar("azure_client_id", { length: 255 }),
  // Note: Client secret stored in secrets management, not DB
  
  // SSO behavior
  enforceSSO: boolean("enforce_sso").default(false),
  allowLocalAuth: boolean("allow_local_auth").default(true),
  autoProvision: boolean("auto_provision").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Blocked Email Domains (Platform-wide security)
export const blockedDomains = pgTable("blocked_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  reason: text("reason"),
  blockedBy: varchar("blocked_by"),
  createdAt: timestamp("created_at").defaultNow()
});
```

### User Table Modifications

```typescript
// Modify existing users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // Keep existing UUID format
  
  // ... existing fields ...
  
  // NEW: Multi-tenancy fields
  primaryTenantId: varchar("primary_tenant_id").references(() => tenants.id),
  
  // NEW: Platform-level roles (separate from tenant roles)
  platformRole: varchar("platform_role", { length: 50 }).default("user"), 
  // user, constellation_consultant, constellation_admin, global_admin
});

// NEW: User-Tenant Membership (many-to-many with roles)
export const tenantUsers = pgTable("tenant_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Tenant-specific role (existing Constellation roles)
  role: varchar("role", { length: 50 }).notNull().default("employee"),
  // admin, billing-admin, pm, employee, executive
  
  // Status
  status: varchar("status", { length: 50 }).default("active"), 
  // active, suspended, invited
  
  // Invitation tracking
  invitedBy: varchar("invited_by"),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at"),
  
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  uniqueUserTenant: unique().on(table.userId, table.tenantId)
}));

// Consultant Access (for Synozur consultants accessing client tenants)
export const consultantAccess = pgTable("consultant_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consultantUserId: varchar("consultant_user_id").notNull().references(() => users.id),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id),
  
  // Access configuration
  role: varchar("role", { length: 50 }).notNull(), // Their role in this tenant
  grantedBy: varchar("granted_by"),
  grantedAt: timestamp("granted_at").defaultNow(),
  
  // Optional expiration
  expiresAt: timestamp("expires_at"),
  
  // Notes
  reason: text("reason") // "Q1 2026 Implementation Project"
});
```

### Existing Table Modifications

All existing tables need a `tenantId` foreign key for data isolation:

```typescript
// Add to all existing tables:
tenantId: varchar("tenant_id").notNull().references(() => tenants.id),

// Tables requiring tenantId:
// - clients
// - projects
// - estimates
// - invoices
// - expenses
// - expenseReports
// - reimbursementBatches
// - timeEntries
// - allocations
// - rates / rateOverrides
// - vocabularyDefaults (org level becomes tenant level)
// - systemSettings (split into platform vs tenant settings)
// - projectEngagements
// - etc.
```

---

## 4. Role & Permission Architecture

### Two-Tier Role System

#### Platform Roles (Global)
| Role | Description | Scope |
|------|-------------|-------|
| `user` | Standard platform user | Access assigned tenants only |
| `constellation_consultant` | Synozur consultants | Can access client tenants (with permission) |
| `constellation_admin` | Platform administrators | Manage platform settings, plans, all tenants |
| `global_admin` | Super administrator | Full platform access |

#### Tenant Roles (Per-Organization)
| Role | Description | Permissions |
|------|-------------|-------------|
| `admin` | Tenant administrator | Full tenant management, users, settings |
| `billing-admin` | Financial administrator | Billing, invoicing, expense approval |
| `pm` | Project manager | Project management, resource allocation |
| `executive` | Executive/leader | Reporting, dashboards, approvals |
| `employee` | Standard employee | Time entry, expenses, assignments |

### Permission Inheritance

```
Platform Role → Tenant Access → Tenant Role → Feature Permissions

Example 1: Standard User
- User "john@clientcorp.com"
  - Platform Role: user
  - Tenant Memberships:
    - Tenant "Client Corp" → Role: pm
  
Example 2: Synozur Consultant
- User "consultant@synozur.com"
  - Platform Role: constellation_consultant
  - Tenant Memberships:
    - Tenant "Synozur" → Role: admin (home tenant)
    - Tenant "Client A" → Role: pm (client access)
    - Tenant "Client B" → Role: employee (limited access)
```

---

## 5. Subdomain Routing (Enterprise/Unlimited) — POST-MVP

> **Note:** Subdomain routing is a **post-MVP feature**. For MVP, all tenants will use the standard app domain. This section documents the future implementation.

### URL Structure

| Plan | URL Pattern |
|------|-------------|
| Trial/Team | `app.constellation.synozur.com` |
| Enterprise | `{clientname}.constellation.synozur.com` (post-MVP) |
| Unlimited (Synozur) | `synozur.constellation.synozur.com` or custom (post-MVP) |

### Subdomain Implementation

```typescript
// Subdomain routing middleware
const subdomainRouter = async (req, res, next) => {
  const host = req.hostname;
  
  // Extract subdomain
  const subdomain = extractSubdomain(host); // e.g., "clientname"
  
  if (subdomain && subdomain !== 'app') {
    // Look up tenant by subdomain
    const tenant = await db.select()
      .from(tenants)
      .where(and(
        eq(tenants.customSubdomain, subdomain),
        eq(tenants.subdomainEnabled, true)
      ))
      .limit(1);
    
    if (tenant.length) {
      req.tenantId = tenant[0].id;
      req.tenantSlug = subdomain;
      req.tenantBranding = {
        name: tenant[0].name,
        logo: tenant[0].logoUrl,
        primaryColor: tenant[0].primaryColor
      };
    } else {
      return res.status(404).render('tenant-not-found');
    }
  }
  
  next();
};
```

### DNS Configuration

- Wildcard DNS: `*.constellation.synozur.com → app server`
- SSL: Wildcard certificate for `*.constellation.synozur.com`
- Nginx/Load balancer handles subdomain routing

---

## 6. Co-Branding Support

### Co-Branding Features

All paying plans support co-branding:

| Feature | Trial | Team | Enterprise | Unlimited |
|---------|-------|------|------------|-----------|
| Custom Logo | ✓ | ✓ | ✓ | ✓ |
| Dark Mode Logo | ✗ | ✓ | ✓ | ✓ |
| Primary Color | ✗ | ✓ | ✓ | ✓ |
| Secondary Color | ✗ | ✗ | ✓ | ✓ |
| Custom Favicon | ✗ | ✗ | ✓ | ✓ |
| Report Branding | ✗ | ✓ | ✓ | ✓ |
| Email Branding | ✗ | ✗ | ✓ | ✓ |

### Branding Application

```tsx
// ThemeProvider applies tenant branding
<TenantThemeProvider tenant={currentTenant}>
  <App />
</TenantThemeProvider>

// CSS variables injected dynamically
:root {
  --tenant-primary: {tenant.primaryColor};
  --tenant-secondary: {tenant.secondaryColor};
}

// Logo component uses tenant branding
<TenantLogo 
  src={isDarkMode ? tenant.logoDarkUrl : tenant.logoUrl}
  fallback="/constellation-logo.svg"
/>
```

---

## 7. Tenant Lifecycle

### Self-Service Signup Flow

```
1. User visits Constellation signup page
   ↓
2. Enters email address
   ↓
3. System checks email domain:
   ├─ Domain matches existing tenant → 
   │   ├─ Tenant allows domain join → Join existing tenant
   │   └─ Tenant is invite-only → Show "Contact admin" message
   ├─ Domain is blocked → Show error
   └─ Domain not found → Offer to create new tenant
   ↓
4. If creating new tenant:
   - Enter organization name
   - Create account with password
   - Assign default trial plan (30 or 60 days)
   - Send verification email
   ↓
5. User becomes admin of new tenant
   ↓
6. Onboarding wizard:
   - Upload logo (optional)
   - Invite team members
   - Set up first client/project
   ↓
7. Trial countdown begins
```

### Tenant Status States

| Status | Description | User Experience |
|--------|-------------|-----------------|
| `active` | Fully operational | Normal access |
| `trial` | On trial plan | Normal access with trial banner & days remaining |
| `expired` | Trial/plan expired | Read-only access, upgrade prompt, 60-day retention |
| `suspended` | Manually suspended | No access, contact support message |
| `cancelled` | Cancelled subscription | Data retained 60 days, then purged with warning |

### Expiration Handling

```typescript
// Daily scheduled job
async function checkTenantExpirations() {
  const today = new Date();
  
  // Find expiring tenants
  const expiringTenants = await db.select()
    .from(tenantPlans)
    .where(and(
      eq(tenantPlans.status, 'active'),
      lte(tenantPlans.endDate, today)
    ));
  
  for (const tp of expiringTenants) {
    // Update status
    await db.update(tenantPlans)
      .set({ 
        status: 'expired',
        dataRetentionEndDate: addDays(today, 60)
      })
      .where(eq(tenantPlans.id, tp.id));
    
    // Update tenant status
    await db.update(tenants)
      .set({ status: 'expired' })
      .where(eq(tenants.id, tp.tenantId));
    
    // Send notification email
    await sendExpirationNotice(tp.tenantId);
  }
  
  // Find tenants past retention period
  const retentionExpired = await db.select()
    .from(tenantPlans)
    .where(and(
      eq(tenantPlans.status, 'expired'),
      lte(tenantPlans.dataRetentionEndDate, today)
    ));
  
  for (const tp of retentionExpired) {
    // Send 30-day warning, then purge
    await scheduleTenantPurge(tp.tenantId);
  }
}
```

---

## 8. Migration Strategy

### Critical Requirement: Production Continuity

**Synozur's current Constellation instance must remain fully operational throughout the transition.** This is non-negotiable for business continuity.

### Recommended Approach: Parallel Development with Data Migration

#### Option A: Remix and Migrate (Recommended)

Create a new multi-tenant version alongside existing production, then migrate:

```
Phase 1: Remix Codebase
├── Fork/remix current Constellation codebase
├── Implement multi-tenancy in parallel branch
├── Original production continues uninterrupted
└── Test multi-tenant version independently

Phase 2: Schema Migration
├── Add new tables (tenants, tenantUsers, servicePlans, etc.)
├── Add tenantId columns (nullable initially)
├── Deploy schema changes to production (backward compatible)
└── Original app continues working (ignores new columns)

Phase 3: Data Migration
├── Create "Synozur" tenant record
├── Backfill tenantId on all existing data
├── Migrate users to tenantUsers table
├── Validate data integrity
└── Make tenantId non-nullable

Phase 4: Code Cutover
├── Deploy multi-tenant codebase
├── Synozur users experience minimal disruption
├── Rollback plan ready if issues
└── Monitor for 48-72 hours

Phase 5: Enable Multi-Tenancy
├── Open signup for new tenants
├── Create service plans
├── Enable self-service onboarding
└── Full SaaS operational
```

#### Option B: In-Place Migration (Higher Risk)

Modify production codebase incrementally:

```
Pros:
- Single codebase to maintain
- No remix overhead

Cons:
- Higher risk to production
- Longer feature freeze periods
- Complex rollback if issues
- Not recommended for critical production systems
```

### Migration Scripts

#### Step 1: Create Synozur Tenant

```sql
-- Create the Synozur tenant
INSERT INTO tenants (name, slug, status, created_at)
VALUES ('Synozur Consulting', 'synozur', 'active', NOW())
RETURNING id;

-- Store the ID for backfill (e.g., id = 1)
```

#### Step 2: Add tenantId Columns

```sql
-- Add nullable tenantId to all tables
ALTER TABLE clients ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE projects ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE estimates ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE invoices ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE expenses ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE time_entries ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
-- ... etc for all tables
```

#### Step 3: Backfill Existing Data

```sql
-- Backfill all existing data to Synozur tenant (id = 1)
UPDATE clients SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE projects SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE estimates SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE invoices SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE expenses SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE time_entries SET tenant_id = 1 WHERE tenant_id IS NULL;
-- ... etc
```

#### Step 4: Migrate Users

```sql
-- Create tenantUsers records for existing users
INSERT INTO tenant_users (user_id, tenant_id, role, status, joined_at)
SELECT id, 1, role, 'active', created_at
FROM users;

-- Set platform roles
UPDATE users SET platform_role = 'user' WHERE platform_role IS NULL;
UPDATE users SET platform_role = 'constellation_admin' 
WHERE role = 'admin' AND email LIKE '%@synozur.com';
```

#### Step 5: Make Columns Non-Nullable

```sql
-- After validation, make tenantId required
ALTER TABLE clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
-- ... etc
```

### Rollback Plan

If issues occur after multi-tenant deployment:

1. **Immediate**: Switch DNS back to single-tenant version
2. **Data**: Single-tenant version ignores tenantId columns (backward compatible)
3. **Timeline**: 15-minute rollback possible
4. **Communication**: Notify users of brief maintenance

### Testing Strategy

Before production cutover:

1. **Clone Production DB**: Test migration scripts on copy
2. **Parallel Environment**: Run multi-tenant version with copied data
3. **User Acceptance**: Select Synozur users test multi-tenant version
4. **Load Testing**: Verify performance with tenant isolation
5. **Security Audit**: Confirm tenant data isolation

---

## 9. UI/UX Changes

### Global Navigation Updates

```
┌─────────────────────────────────────────────────────────────────┐
│ [Tenant Logo] Constellation                                     │
│                                                                 │
│ ┌─────────────────┐  Synozur Consulting ▼                       │
│ │ Tenant Switcher │  ─────────────────────────────              │
│ │ (multi-tenant   │  • Synozur Consulting ✓                     │
│ │  users only)    │  • Client A Corp                            │
│ └─────────────────┘  • Client B Inc                             │
│                                                                 │
│ [Sidebar Navigation - tenant-scoped]                            │
│                                                                 │
│ My Workspace                                                    │
│ ├── Dashboard                                                   │
│ ├── My Assignments                                              │
│ └── My Time/Expenses                                            │
│                                                                 │
│ Portfolio (PM/Admin)                                            │
│ ├── Projects                                                    │
│ ├── Clients                                                     │
│ └── Estimates                                                   │
│                                                                 │
│ Billing (Billing-Admin/Admin)                                   │
│ ├── Invoices                                                    │
│ └── Expenses                                                    │
│                                                                 │
│ Tenant Admin (Tenant Admin only)                                │
│ ├── Users & Teams                                               │
│ ├── Settings                                                    │
│ ├── Branding                                                    │
│ └── SSO Configuration                                           │
│                                                                 │
│ Platform Admin (Platform Admin only)                            │
│ ├── All Tenants                                                 │
│ ├── Service Plans                                               │
│ ├── Platform Settings                                           │
│ └── Security                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### New Admin Pages

**Tenant Admin** (`/admin/*`):
- `/admin/users` - Manage tenant users
- `/admin/teams` - Manage teams
- `/admin/settings` - Tenant configuration
- `/admin/branding` - Logo, colors, co-branding
- `/admin/sso` - SSO configuration
- `/admin/vocabulary` - Custom terminology
- `/admin/integrations` - M365 connectors

**Platform Admin** (`/platform/*`):
- `/platform/tenants` - All tenants overview, status, plans
- `/platform/plans` - Service plan management
- `/platform/security` - Blocked domains
- `/platform/usage` - Platform-wide analytics
- `/platform/announcements` - System-wide banners

---

## 10. API Changes

### Route Structure

```
/api/auth/...                    # Authentication (platform-level)
/api/tenants/:tenantId/...       # Tenant-scoped resources

# Examples:
GET  /api/tenants/:tenantId/projects
POST /api/tenants/:tenantId/projects
GET  /api/tenants/:tenantId/clients
POST /api/tenants/:tenantId/users/invite

# Platform admin routes
GET  /api/platform/tenants
POST /api/platform/tenants
GET  /api/platform/plans
```

### Backward Compatibility During Migration

```typescript
// Middleware maps legacy routes to tenant-scoped routes
app.use('/api', (req, res, next) => {
  // If no tenantId in route, use user's primary tenant
  if (!req.params.tenantId && req.user) {
    req.tenantId = req.user.primaryTenantId;
  }
  next();
});

// Legacy: GET /api/projects → GET /api/tenants/:primaryTenantId/projects
```

---

## 11. Security Considerations

### Data Isolation
- All queries MUST include `tenantId` filter
- Middleware validates tenant access before any operation
- Database views enforce tenant scoping (optional additional layer)
- Regular security audits of cross-tenant access

### Authentication Security
- Tenant-specific SSO configuration stored securely
- Client secrets in environment variables, not database
- Session tokens include tenant context

### Consultant Access
- Explicit grant required (cannot self-assign)
- Time-limited access with automatic expiration
- Audit logging for all cross-tenant access
- Revocation immediate and logged

### Privacy & Compliance
- Tenant data never mixed in queries or exports
- GDPR data export/deletion per tenant
- Data retention policy enforced automatically
- Deletion warnings 30 days before purge

---

## 12. Existing Feature Compatibility

### Features Requiring Tenant Scoping

| Feature | Current State | Multi-Tenant Adaptation |
|---------|---------------|------------------------|
| Vocabulary | Org/Client/Project hierarchy | Tenant replaces "Org" level |
| Rate Overrides | User/Client/Estimate levels | All scoped within tenant |
| Time Reminders | Global scheduler | Per-tenant scheduling, tenant user filtering |
| SharePoint Integration | Single connection | Per-tenant M365 connections |
| AI Integration | Shared Replit AI | Per-tenant usage tracking |
| Project Engagements | User→Project | Add tenant context |
| Expense Approval | Global workflow | Per-tenant workflow |

### Vocabulary Alignment

Current hierarchy:
```
Organization Default → Client Override → Project Override
```

Multi-tenant hierarchy:
```
Tenant Default → Client Override → Project Override
```

The existing `vocabularyDefaults` table's "organization" scope becomes tenant scope with minimal changes.

---

## 13. Implementation Phases

### Phase 1: Foundation (3-4 weeks)
- [ ] Create new multi-tenant schema tables
- [ ] Add `tenantId` column to all existing tables (nullable)
- [ ] Create Synozur as initial tenant
- [ ] Write and test data migration scripts
- [ ] Backfill existing data with Synozur tenant ID
- [ ] Add tenant middleware layer

### Phase 2: User & Auth (2-3 weeks)
- [ ] Create `tenantUsers` table for multi-tenant membership
- [ ] Migrate existing users to `tenantUsers` 
- [ ] Add platform roles to users
- [ ] Update authentication flow with tenant context
- [ ] Add tenant switcher UI (hidden for single-tenant users)
- [ ] Implement tenant selection on login

### Phase 3: Tenant Admin (2-3 weeks)
- [ ] Build Tenant Admin pages (users, settings, branding)
- [ ] Implement co-branding (logo, colors)
- [ ] Implement per-tenant SSO configuration
- [ ] Per-tenant vocabulary (leverage existing system)
- [ ] User invitation system

### Phase 4: Platform Admin (2 weeks)
- [ ] Build Platform Admin pages
- [ ] Implement service plan management (Trial, Team, Enterprise, Unlimited)
- [ ] Add tenant monitoring dashboard
- [ ] Blocked domains management
- [ ] Consultant access management

### Phase 5: Subdomain Routing (1-2 weeks)
- [ ] Implement subdomain detection middleware
- [ ] Configure wildcard DNS and SSL
- [ ] Tenant-specific login pages
- [ ] Subdomain assignment for Enterprise/Unlimited

### Phase 6: Self-Service & Plans (2-3 weeks)
- [ ] Build signup flow with domain detection
- [ ] Create onboarding wizard
- [ ] Implement trial plan logic (30/60 days)
- [ ] Add plan expiration and grace period handling
- [ ] Data retention enforcement (60 days)
- [ ] Upgrade prompts and billing integration hooks

### Phase 7: Polish & Testing (2 weeks)
- [ ] Security audit (tenant isolation)
- [ ] Performance optimization
- [ ] Documentation updates
- [ ] Staff training
- [ ] Gradual rollout

**Total Estimated Timeline: 13-17 weeks**

---

## 14. Open Items & Decisions

| Item | Options | Recommendation |
|------|---------|----------------|
| Trial Duration | 30 days or 60 days | Start with 60 days, adjust based on conversion data |
| Team Plan Base | 5 users | Confirmed per requirements |
| Billing Integration | Stripe, external, manual | Defer - start with manual plan assignment |
| API Keys for Tenants | Yes/No | Defer to future phase |
| Custom Domain (not subdomain) | Yes/No | Enterprise feature, future phase |

---

## 15. Success Metrics

| Metric | Target |
|--------|--------|
| Synozur production uptime during migration | 99.9% |
| Data migration accuracy | 100% |
| Time to first external tenant | 4 weeks after launch |
| Trial-to-paid conversion | Track from day 1 |
| Support tickets related to multi-tenancy | < 5/week |

---

*Document Version: 1.0*  
*Created: January 2026*  
*Status: Design Complete - Ready for Backlog*  
*Based on: Vega Multi-Tenancy Architecture*
