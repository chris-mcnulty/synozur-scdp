CREATE TABLE "user_calendar_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar,
	"event_key" varchar(255) NOT NULL,
	"project_id" varchar NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "from_calendar_suggestion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_suggestions_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calendar_suggestions_days_back" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_calendar_mappings" ADD CONSTRAINT "user_calendar_mappings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calendar_mappings" ADD CONSTRAINT "user_calendar_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calendar_mappings" ADD CONSTRAINT "user_calendar_mappings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_calendar_mappings_user_key" ON "user_calendar_mappings" USING btree ("user_id","event_key");--> statement-breakpoint
CREATE INDEX "idx_user_calendar_mappings_user" ON "user_calendar_mappings" USING btree ("user_id");