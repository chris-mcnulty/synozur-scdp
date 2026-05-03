-- Task #143: AI Project Manager Agent — chat panel scoped to a project.

CREATE TABLE IF NOT EXISTS "agent_conversations" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar NOT NULL,
    "project_id" varchar NOT NULL,
    "user_id" varchar NOT NULL,
    "title" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_messages" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" varchar NOT NULL,
    "role" varchar(20) NOT NULL,
    "content" text NOT NULL,
    "tool_calls" jsonb,
    "tool_call_id" varchar,
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_actions" (
    "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" varchar NOT NULL,
    "conversation_id" varchar NOT NULL,
    "message_id" varchar,
    "project_id" varchar NOT NULL,
    "user_id" varchar NOT NULL,
    "tool" varchar(80) NOT NULL,
    "user_prompt" text,
    "args" jsonb NOT NULL,
    "preview_diff" jsonb,
    "status" varchar(20) DEFAULT 'proposed' NOT NULL,
    "result" jsonb,
    "error_message" text,
    "applied_at" timestamp,
    "applied_by" varchar,
    "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_agent_conversations_project" ON "agent_conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_user" ON "agent_conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_agent_messages_conversation" ON "agent_messages" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_agent_actions_project" ON "agent_actions" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_agent_actions_conversation" ON "agent_actions" ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_agent_actions_status" ON "agent_actions" ("status");
