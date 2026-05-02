-- Task #53: Per-tenant settings overrides (initially used for the Copilot Studio
-- known-client-ID allow list, but a generic key/value store keyed by tenant).

CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" varchar NOT NULL,
  "setting_key" text NOT NULL,
  "setting_value" text NOT NULL,
  "description" text,
  "setting_type" text NOT NULL DEFAULT 'string',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_tenant_setting_key"
  ON "tenant_settings" USING btree ("tenant_id", "setting_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_settings_tenant"
  ON "tenant_settings" USING btree ("tenant_id");
