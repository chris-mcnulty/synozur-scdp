CREATE TABLE "estimate_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"tenant_id" varchar,
	"version_number" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"trigger_event" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"snapshotted_at" timestamp DEFAULT now() NOT NULL,
	"snapshotted_by" varchar,
	CONSTRAINT "uq_estimate_versions_version" UNIQUE("estimate_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_snapshotted_by_users_id_fk" FOREIGN KEY ("snapshotted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_estimate_versions_estimate" ON "estimate_versions" USING btree ("estimate_id");