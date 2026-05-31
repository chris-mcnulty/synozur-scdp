-- QuickBooks Online integration (accounting).
-- See docs/design/quickbooks-integration-plan.md
--
-- Three tables, mirroring the CRM integration trio:
--
--   quickbooks_connections      — per-tenant OAuth connection (one realm per
--                                 tenant). Tokens live in `settings` JSONB. The
--                                 `sandbox` flag selects the Intuit API host.
--   quickbooks_entity_mappings  — links a Constellation entity to its QBO
--                                 counterpart. Idempotency backbone: a local
--                                 entity maps to exactly one QBO entity, so a
--                                 re-push is always an update, never a duplicate.
--                                 Caches `qbo_sync_token` for optimistic
--                                 concurrency on updates/voids.
--   quickbooks_sync_log         — audit trail of every sync action.

CREATE TABLE IF NOT EXISTS "quickbooks_connections" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "realm_id"         varchar(64),
  "sandbox"          boolean NOT NULL DEFAULT false,
  "is_enabled"       boolean NOT NULL DEFAULT false,
  "sync_direction"   varchar(20) NOT NULL DEFAULT 'push',
  "cdc_watermark"    timestamp,
  "last_sync_at"     timestamp,
  "last_sync_status" varchar(20),
  "last_sync_error"  text,
  "settings"         jsonb,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_qbo_connections_tenant"
  ON "quickbooks_connections"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_qbo_tenant"
  ON "quickbooks_connections"("tenant_id");

CREATE TABLE IF NOT EXISTS "quickbooks_entity_mappings" (
  "id"                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"         varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "local_object_type" varchar(50) NOT NULL,  -- 'client' | 'vendor_user' | 'invoice_batch' | 'item' | 'account'
  "local_object_id"   varchar(255) NOT NULL,
  "qbo_object_type"   varchar(50) NOT NULL,   -- 'Customer' | 'Vendor' | 'Invoice' | 'Item' | 'Account'
  "qbo_object_id"     varchar(64) NOT NULL,
  "qbo_sync_token"    varchar(32),
  "last_synced_hash"  varchar(64),
  "status"            varchar(20) NOT NULL DEFAULT 'active', -- 'active' | 'voided'
  "metadata"          jsonb,
  "last_sync_at"      timestamp NOT NULL DEFAULT now(),
  "created_at"        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_qbo_mappings_tenant"
  ON "quickbooks_entity_mappings"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_qbo_mappings_qbo_object"
  ON "quickbooks_entity_mappings"("qbo_object_type", "qbo_object_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_qbo_local_mapping"
  ON "quickbooks_entity_mappings"("tenant_id", "local_object_type", "local_object_id");

CREATE TABLE IF NOT EXISTS "quickbooks_sync_log" (
  "id"                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"         varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "action"            varchar(50) NOT NULL,
  "local_object_type" varchar(50),
  "local_object_id"   varchar(255),
  "qbo_object_type"   varchar(50),
  "qbo_object_id"     varchar(64),
  "status"            varchar(20) NOT NULL,
  "error_message"     text,
  "request_payload"   jsonb,
  "response_payload"  jsonb,
  "created_at"        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_qbo_sync_log_tenant"
  ON "quickbooks_sync_log"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_qbo_sync_log_created"
  ON "quickbooks_sync_log"("created_at");
