-- Task #111: Web Push subscriptions for browser notifications.
-- Stores per-device push subscription endpoints + keys so notify() can fan
-- out alerts to subscribed browsers alongside in-app delivery.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" varchar NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Endpoint uniqueness is scoped to (endpoint, user, tenant) so that a
-- multi-tenant user can opt in to browser push from the same device for
-- each workspace they belong to without one subscription overwriting
-- another.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_push_subs_endpoint"
  ON "push_subscriptions" ("endpoint", "user_id", "tenant_id");

CREATE INDEX IF NOT EXISTS "idx_push_subs_user"
  ON "push_subscriptions" ("user_id", "tenant_id");

-- Server-only VAPID keypair storage. Holds the cryptographic keypair used to
-- sign Web Push payloads. This table is intentionally isolated from
-- system_settings (which is exposed to admin APIs/UI) so the private key is
-- never returned by any HTTP endpoint. Only the push-notification-service
-- accesses it directly via the database connection.
CREATE TABLE IF NOT EXISTS "vapid_keys" (
  "id" varchar PRIMARY KEY DEFAULT 'singleton',
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "subject" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
