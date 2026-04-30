CREATE TABLE "teams_alert_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"trigger_type" varchar(50) NOT NULL,
	"project_id" varchar,
	"entry_id" varchar,
	"target_team_id" varchar,
	"target_channel_id" varchar,
	"alerted_at" timestamp DEFAULT now() NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "agent_card_health_checks" ALTER COLUMN "errors" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD COLUMN "prior_planned_start_date" date;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD COLUMN "prior_planned_end_date" date;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD COLUMN "cascade_source_milestone_id" varchar;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_alerts_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_webhook_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_alert_on_health_change" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_alert_on_raidd_overdue" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_alert_on_status_report_due" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "teams_notification_channels" jsonb;--> statement-breakpoint
ALTER TABLE "teams_alert_log" ADD CONSTRAINT "teams_alert_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_teams_alert_log_tenant" ON "teams_alert_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_teams_alert_log_tenant_trigger" ON "teams_alert_log" USING btree ("tenant_id","trigger_type");--> statement-breakpoint
CREATE INDEX "idx_teams_alert_log_alerted_at" ON "teams_alert_log" USING btree ("alerted_at");