CREATE TABLE "agent_card_health_checks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(20) NOT NULL,
	"checked_at" timestamp NOT NULL,
	"skill_count" integer,
	"errors" text[],
	"message" text,
	"trigger" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_configuration" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"active_provider" text DEFAULT 'replit_ai' NOT NULL,
	"active_model" text DEFAULT 'gpt-5' NOT NULL,
	"provider_config" jsonb,
	"enable_streaming" boolean DEFAULT true,
	"max_tokens_per_request" integer DEFAULT 4096,
	"monthly_token_budget" integer,
	"alert_thresholds" jsonb DEFAULT '[75,90,100]'::jsonb,
	"alert_enabled" boolean DEFAULT true,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_month" varchar(7) NOT NULL,
	"threshold_percent" integer NOT NULL,
	"token_usage_at_alert" integer NOT NULL,
	"monthly_budget" integer NOT NULL,
	"alerted_at" timestamp DEFAULT now() NOT NULL,
	"notified_emails" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"deployment_name" text,
	"feature" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_microdollars" integer,
	"latency_ms" integer,
	"was_streaming" boolean DEFAULT false,
	"request_id" text,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"period_type" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"total_completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost_microdollars" integer DEFAULT 0 NOT NULL,
	"usage_by_model" jsonb,
	"usage_by_feature" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airport_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"iata_code" varchar(3) NOT NULL,
	"name" text NOT NULL,
	"municipality" text,
	"iso_country" varchar(2),
	"iso_region" varchar(10),
	"airport_type" text,
	"coordinates" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "airport_codes_iata_code_unique" UNIQUE("iata_code")
);
--> statement-breakpoint
CREATE TABLE "blocked_domains" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" varchar(255) NOT NULL,
	"reason" text,
	"blocked_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "change_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"approved_on" timestamp,
	"delta_hours" numeric(10, 2),
	"delta_fees" numeric(10, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_containers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"container_id" text NOT NULL,
	"container_type_id" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"drive_id" text,
	"web_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_containers_container_id_unique" UNIQUE("container_id")
);
--> statement-breakpoint
CREATE TABLE "client_rate_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"client_id" varchar NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" varchar NOT NULL,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"effective_start" date DEFAULT CURRENT_DATE NOT NULL,
	"effective_end" date,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar NOT NULL,
	"tenant_id" varchar,
	"team_id" varchar(255) NOT NULL,
	"team_name" text,
	"team_web_url" text,
	"sharepoint_site_id" varchar(255),
	"sharepoint_site_url" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_client_teams_client" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"short_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billing_contact" text,
	"contact_name" text,
	"contact_address" text,
	"secondary_contact_name" text,
	"secondary_contact_email" text,
	"vocabulary_overrides" text,
	"epic_term_id" varchar,
	"stage_term_id" varchar,
	"workstream_term_id" varchar,
	"milestone_term_id" varchar,
	"activity_term_id" varchar,
	"msa_date" date,
	"msa_document" text,
	"has_msa" boolean DEFAULT false,
	"since_date" date,
	"nda_date" date,
	"nda_document" text,
	"has_nda" boolean DEFAULT false,
	"microsoft_team_id" text,
	"microsoft_team_name" text,
	"microsoft_team_web_url" text,
	"sharepoint_site_url" text,
	"payment_terms" text,
	"payment_method" text DEFAULT 'ACH Transfer',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultant_access" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultant_user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"role" varchar(50) NOT NULL,
	"granted_by" varchar,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_columns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" text NOT NULL,
	"column_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"column_type" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_indexed" boolean DEFAULT false NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_read_only" boolean DEFAULT false NOT NULL,
	"text_config" jsonb,
	"choice_config" jsonb,
	"number_config" jsonb,
	"date_time_config" jsonb,
	"currency_config" jsonb,
	"boolean_config" jsonb,
	"validation_rules" jsonb,
	"is_receipt_metadata" boolean DEFAULT false NOT NULL,
	"receipt_field_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" text NOT NULL,
	"user_id" varchar,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"roles" text[] NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"granted_by" varchar
);
--> statement-breakpoint
CREATE TABLE "container_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_type_id" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"application_id" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "container_types_container_type_id_unique" UNIQUE("container_type_id")
);
--> statement-breakpoint
CREATE TABLE "contractor_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"report_id" varchar NOT NULL,
	"invoice_number" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"contractor_user_id" varchar NOT NULL,
	"bill_to_name" text NOT NULL,
	"bill_to_address" text,
	"bill_to_contact" text,
	"pdf_file_id" text,
	"pdf_file_name" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar,
	"paid_at" timestamp,
	"paid_by" varchar,
	"payment_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"crm_provider" varchar(50) NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"deal_probability_threshold" integer DEFAULT 40 NOT NULL,
	"deal_stage_filter" text,
	"auto_create_estimate" boolean DEFAULT false NOT NULL,
	"sync_direction" varchar(20) DEFAULT 'bidirectional' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" varchar(20),
	"last_sync_error" text,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_object_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"crm_provider" varchar(50) NOT NULL,
	"crm_object_type" varchar(50) NOT NULL,
	"crm_object_id" varchar(255) NOT NULL,
	"local_object_type" varchar(50) NOT NULL,
	"local_object_id" varchar(255) NOT NULL,
	"metadata" jsonb,
	"last_sync_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sync_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"crm_provider" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"crm_object_type" varchar(50),
	"crm_object_id" varchar(255),
	"local_object_type" varchar(50),
	"local_object_id" varchar(255),
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_status_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" varchar NOT NULL,
	"old_status" varchar(20),
	"new_status" varchar(20) NOT NULL,
	"changed_by" varchar,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"comments" text
);
--> statement-breakpoint
CREATE TABLE "document_metadata" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" text NOT NULL,
	"item_id" text NOT NULL,
	"file_name" text NOT NULL,
	"project_id" text,
	"expense_id" varchar,
	"uploaded_by" varchar,
	"expense_category" text,
	"receipt_date" timestamp,
	"amount" numeric(10, 2),
	"currency" text DEFAULT 'USD',
	"status" text DEFAULT 'pending' NOT NULL,
	"vendor" text,
	"description" text,
	"is_reimbursable" boolean DEFAULT true,
	"tags" text[],
	"raw_metadata" jsonb,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" varchar NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" varchar NOT NULL,
	"week_number" integer NOT NULL,
	"role_id" varchar,
	"person_id" varchar,
	"person_email" text,
	"hours" numeric(10, 2) NOT NULL,
	"pricing_mode" text NOT NULL,
	"rack_rate" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_channels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"tenant_id" varchar,
	"team_id" varchar(255) NOT NULL,
	"team_name" text,
	"channel_id" varchar(255) NOT NULL,
	"channel_name" text,
	"channel_web_url" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_estimate_channels_estimate" UNIQUE("estimate_id")
);
--> statement-breakpoint
CREATE TABLE "estimate_epics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"epic_id" varchar,
	"stage_id" varchar,
	"description" text NOT NULL,
	"category" text,
	"workstream" text,
	"week" integer,
	"duration_weeks" integer,
	"utilization_percent" integer,
	"base_hours" numeric(10, 2) NOT NULL,
	"factor" numeric(10, 2) DEFAULT 1 NOT NULL,
	"rate" numeric(10, 2) DEFAULT 0 NOT NULL,
	"cost_rate" numeric(10, 2),
	"assigned_user_id" varchar,
	"role_id" varchar,
	"resource_name" text,
	"size" text DEFAULT 'small' NOT NULL,
	"complexity" text DEFAULT 'small' NOT NULL,
	"confidence" text DEFAULT 'high' NOT NULL,
	"adjusted_hours" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"total_cost" numeric(10, 2),
	"margin" numeric(10, 2),
	"margin_percent" numeric(5, 2),
	"referral_markup" numeric(10, 2),
	"total_amount_with_referral" numeric(10, 2),
	"comments" text,
	"has_manual_rate_override" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_milestones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount" numeric(10, 2),
	"due_date" date,
	"percentage" numeric(5, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_rate_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"line_item_ids" varchar[],
	"subject_type" text NOT NULL,
	"subject_id" varchar NOT NULL,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"effective_start" date DEFAULT CURRENT_DATE NOT NULL,
	"effective_end" date,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimate_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"granted_by" varchar NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimate_stages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"epic_id" varchar NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"start_date" date,
	"end_date" date,
	"retainer_month_index" integer,
	"retainer_month_label" text,
	"retainer_max_hours" numeric(10, 2),
	"retainer_start_date" date,
	"retainer_end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"name" text NOT NULL,
	"client_id" varchar NOT NULL,
	"project_id" varchar,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"estimate_type" text DEFAULT 'detailed' NOT NULL,
	"pricing_type" text DEFAULT 'hourly' NOT NULL,
	"total_hours" numeric(10, 2),
	"total_fees" numeric(10, 2),
	"block_hours" numeric(10, 2),
	"block_dollars" numeric(10, 2),
	"block_description" text,
	"fixed_price" numeric(10, 2),
	"presented_total" numeric(10, 2),
	"margin" numeric(5, 2),
	"valid_until" date,
	"estimate_date" date DEFAULT CURRENT_DATE NOT NULL,
	"potential_start_date" date,
	"epic_label" text DEFAULT 'Epic',
	"stage_label" text DEFAULT 'Stage',
	"activity_label" text DEFAULT 'Activity',
	"rack_rate_snapshot" jsonb,
	"size_small_multiplier" numeric(4, 2) DEFAULT '1.00',
	"size_medium_multiplier" numeric(4, 2) DEFAULT '1.05',
	"size_large_multiplier" numeric(4, 2) DEFAULT '1.10',
	"complexity_small_multiplier" numeric(4, 2) DEFAULT '1.00',
	"complexity_medium_multiplier" numeric(4, 2) DEFAULT '1.05',
	"complexity_large_multiplier" numeric(4, 2) DEFAULT '1.10',
	"confidence_high_multiplier" numeric(4, 2) DEFAULT '1.00',
	"confidence_medium_multiplier" numeric(4, 2) DEFAULT '1.10',
	"confidence_low_multiplier" numeric(4, 2) DEFAULT '1.20',
	"archived" boolean DEFAULT false NOT NULL,
	"margin_override_active" boolean DEFAULT false NOT NULL,
	"margin_override_percent" numeric(5, 2),
	"original_rates_snapshot" jsonb,
	"retainer_config" jsonb,
	"referral_fee_type" text DEFAULT 'none',
	"referral_fee_percent" numeric(5, 2),
	"referral_fee_flat" numeric(10, 2),
	"referral_fee_amount" numeric(10, 2),
	"referral_fee_paid_to" text,
	"net_revenue" numeric(12, 2),
	"proposal_narrative" text,
	"proposal_narrative_generated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" varchar NOT NULL,
	"drive_id" text NOT NULL,
	"item_id" text NOT NULL,
	"web_url" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_by_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_report_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar NOT NULL,
	"expense_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"report_number" text NOT NULL,
	"submitter_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"approved_by" varchar,
	"rejected_at" timestamp,
	"rejected_by" varchar,
	"rejection_note" text,
	"contractor_invoice_id" varchar,
	"reimbursement_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_reports_report_number_unique" UNIQUE("report_number")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"person_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"project_resource_id" varchar,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"quantity" numeric(10, 2),
	"unit" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"reimbursable" boolean DEFAULT true NOT NULL,
	"description" text,
	"vendor" text,
	"receipt_url" text,
	"billed_flag" boolean DEFAULT false NOT NULL,
	"departure_airport" text,
	"arrival_airport" text,
	"is_round_trip" boolean DEFAULT false,
	"per_diem_location" text,
	"per_diem_meals_rate" numeric(10, 2),
	"per_diem_lodging_rate" numeric(10, 2),
	"per_diem_breakdown" jsonb,
	"per_diem_days" jsonb,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"approved_by" varchar,
	"rejected_at" timestamp,
	"rejected_by" varchar,
	"rejection_note" text,
	"reimbursed_at" timestamp,
	"reimbursement_batch_id" varchar,
	"client_paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grounding_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"title" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"content" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_tenant_background" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar,
	"team_id" varchar(255) NOT NULL,
	"invited_email" text NOT NULL,
	"invited_display_name" text,
	"invited_user_id" varchar,
	"azure_guest_user_id" varchar(255),
	"invitation_id" varchar(255),
	"redemption_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"send_invitation_message" boolean DEFAULT true NOT NULL,
	"custom_message" text,
	"invited_by" varchar,
	"sent_at" timestamp,
	"accepted_at" timestamp,
	"expires_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" text NOT NULL,
	"scope" text NOT NULL,
	"method" text NOT NULL,
	"target_amount" numeric(12, 2),
	"reason" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"sow_id" varchar,
	"project_id" varchar
);
--> statement-breakpoint
CREATE TABLE "invoice_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"batch_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"month" date,
	"pricing_snapshot_date" date NOT NULL,
	"discount_percent" numeric(5, 2),
	"discount_amount" numeric(10, 2),
	"total_amount" numeric(10, 2),
	"aggregate_adjustment_total" numeric(12, 2),
	"tax_rate" numeric(5, 2) DEFAULT '9.3',
	"tax_amount" numeric(10, 2),
	"tax_amount_override" numeric(10, 2),
	"gl_invoice_number" text,
	"invoicing_mode" text DEFAULT 'client' NOT NULL,
	"batch_type" text DEFAULT 'mixed' NOT NULL,
	"payment_terms" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"finalized_at" timestamp,
	"finalized_by" varchar,
	"created_by" varchar,
	"project_milestone_id" varchar,
	"as_of_date" date,
	"as_of_date_updated_by" varchar,
	"as_of_date_updated_at" timestamp,
	"notes" text,
	"exported_to_qbo" boolean DEFAULT false NOT NULL,
	"exported_at" timestamp,
	"pdf_file_id" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_date" date,
	"payment_amount" numeric(10, 2),
	"payment_notes" text,
	"payment_updated_by" varchar,
	"payment_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" text NOT NULL,
	"project_id" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(10, 2),
	"rate" numeric(10, 2),
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"original_amount" numeric(12, 2),
	"billed_amount" numeric(12, 2),
	"variance_amount" numeric(12, 2),
	"original_rate" numeric(12, 2),
	"original_quantity" numeric(12, 2),
	"adjustment_type" text,
	"adjustment_reason" text,
	"edited_by" varchar,
	"edited_at" timestamp,
	"project_milestone_id" varchar,
	"is_adjustment" boolean DEFAULT false NOT NULL,
	"allocation_group_id" varchar,
	"sow_id" varchar,
	"taxable" boolean DEFAULT true NOT NULL,
	"expense_category" text,
	"original_currency" text,
	"original_currency_amount" numeric(12, 2),
	"exchange_rate" numeric(12, 6),
	"source_expense_id" varchar,
	"source_time_entry_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_write_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb,
	"resource_type" varchar(50),
	"resource_id" varchar(255),
	"correlation_id" varchar(64),
	"dry_run" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"content_type" text NOT NULL,
	"column_definitions" jsonb NOT NULL,
	"is_built_in" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "metadata_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "oconus_per_diem_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"location" text NOT NULL,
	"season_start" varchar(5) NOT NULL,
	"season_end" varchar(5) NOT NULL,
	"lodging" integer NOT NULL,
	"mie" integer NOT NULL,
	"proportional_meals" integer,
	"incidentals" integer,
	"max_per_diem" integer NOT NULL,
	"effective_date" varchar(10),
	"fiscal_year" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_vocabulary" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"epic_term_id" varchar,
	"stage_term_id" varchar,
	"workstream_term_id" varchar,
	"milestone_term_id" varchar,
	"activity_term_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"session_id" text,
	"referrer" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_receipts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"file_path" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"project_id" varchar,
	"uploaded_by" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"receipt_date" date,
	"amount" numeric(10, 2),
	"currency" text DEFAULT 'USD',
	"category" text,
	"vendor" text,
	"description" text,
	"is_reimbursable" boolean DEFAULT true,
	"tags" text,
	"expense_id" varchar,
	"assigned_at" timestamp,
	"assigned_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planner_task_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" varchar NOT NULL,
	"allocation_id" varchar,
	"task_id" varchar(255) NOT NULL,
	"task_title" text,
	"bucket_id" varchar(255),
	"bucket_name" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"sync_error" text,
	"local_version" integer DEFAULT 1 NOT NULL,
	"remote_etag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_id" varchar NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar NOT NULL,
	"project_activity_id" varchar,
	"project_milestone_id" varchar,
	"project_workstream_id" varchar,
	"project_epic_id" varchar,
	"project_stage_id" varchar,
	"week_number" integer NOT NULL,
	"planned_start_date" date,
	"planned_end_date" date,
	"role_id" varchar,
	"person_id" varchar,
	"resource_name" text,
	"task_description" text,
	"hours" numeric(10, 2) NOT NULL,
	"pricing_mode" text NOT NULL,
	"rack_rate" numeric(10, 2) NOT NULL,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"notes" text,
	"estimate_line_item_id" varchar,
	"status" text DEFAULT 'open' NOT NULL,
	"started_date" date,
	"completed_date" date,
	"role_instance_label" text,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"baseline_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "project_budget_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"change_type" text NOT NULL,
	"field_changed" text NOT NULL,
	"previous_value" numeric(12, 2),
	"new_value" numeric(12, 2),
	"delta_value" numeric(12, 2),
	"sow_id" varchar,
	"changed_by" varchar NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_channels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"tenant_id" varchar,
	"channel_id" varchar(255) NOT NULL,
	"channel_name" text,
	"channel_web_url" text,
	"planner_plan_id" varchar(255),
	"planner_plan_web_url" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_project_channels_project" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_deliverables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_user_id" varchar NOT NULL,
	"epic_id" varchar,
	"stage_id" varchar,
	"status" varchar(20) DEFAULT 'not-started' NOT NULL,
	"target_date" date,
	"delivered_date" date,
	"acceptance_notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_engagements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"completed_at" timestamp,
	"completed_by" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_epics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"estimate_epic_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"budget_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2) DEFAULT '0',
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"project_epic_id" varchar,
	"estimate_stage_id" varchar,
	"estimate_milestone_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"is_payment_milestone" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"end_date" date,
	"target_date" date,
	"completed_date" date,
	"amount" numeric(10, 2),
	"invoice_status" text,
	"status" text DEFAULT 'not-started' NOT NULL,
	"budget_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2) DEFAULT '0',
	"sow_id" varchar,
	"retainer_stage_id" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_planner_connections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"integration_id" varchar,
	"plan_id" varchar(255) NOT NULL,
	"plan_title" text,
	"plan_web_url" text,
	"group_id" varchar(255),
	"group_name" text,
	"channel_id" varchar(255),
	"channel_name" text,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_direction" text DEFAULT 'bidirectional' NOT NULL,
	"auto_add_members" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"last_sync_error" text,
	"connected_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_rate_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"effective_start" date DEFAULT CURRENT_DATE NOT NULL,
	"effective_end" date,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"epic_id" varchar NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"retainer_month_index" integer,
	"retainer_month_label" text,
	"retainer_max_hours" numeric(10, 2),
	"retainer_rate_tiers" jsonb,
	"retainer_start_date" date,
	"retainer_end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_status_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"tenant_id" varchar,
	"report_period" text NOT NULL,
	"rag_status" varchar(10) DEFAULT 'green' NOT NULL,
	"accomplishments" text,
	"milestones" text,
	"risks" text,
	"notes" text,
	"sharepoint_page_id" text,
	"sharepoint_page_url" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"published_by" varchar
);
--> statement-breakpoint
CREATE TABLE "project_workstreams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"estimate_workstream_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"budget_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2) DEFAULT '0',
	"order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"client_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"code" text NOT NULL,
	"pm" varchar,
	"start_date" date,
	"end_date" date,
	"commercial_scheme" text NOT NULL,
	"retainer_balance" numeric(10, 2),
	"retainer_total" numeric(10, 2),
	"baseline_budget" numeric(10, 2),
	"sow_value" numeric(10, 2),
	"sow_date" date,
	"has_sow" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"estimated_total" numeric(12, 2),
	"sow_total" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"billed_total" numeric(12, 2),
	"profit_margin" numeric(12, 2),
	"vocabulary_overrides" text,
	"epic_term_id" varchar,
	"stage_term_id" varchar,
	"workstream_term_id" varchar,
	"milestone_term_id" varchar,
	"activity_term_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "raidd_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"type" varchar(20) NOT NULL,
	"ref_number" varchar(20),
	"title" text NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"impact" varchar(20),
	"likelihood" varchar(20),
	"owner_id" varchar,
	"assignee_id" varchar,
	"due_date" date,
	"closed_at" timestamp,
	"category" varchar(100),
	"mitigation_plan" text,
	"resolution_notes" text,
	"parent_entry_id" varchar,
	"converted_from_id" varchar,
	"superseded_by_id" varchar,
	"tags" jsonb,
	"created_by" varchar,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"scope" text NOT NULL,
	"scope_id" varchar NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" varchar NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"rack_rate" numeric(10, 2) NOT NULL,
	"charge_rate" numeric(10, 2),
	"precedence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursement_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"batch_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"description" text,
	"requested_by" varchar,
	"requested_for_user_id" varchar,
	"payment_reference_number" text,
	"approved_at" timestamp,
	"approved_by" varchar,
	"processed_at" timestamp,
	"processed_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reimbursement_batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "reimbursement_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"batch_id" varchar NOT NULL,
	"expense_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tenant_id" varchar,
	"default_rack_rate" numeric(10, 2) NOT NULL,
	"default_cost_rate" numeric(10, 2),
	"is_always_salaried" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_tenant_id_unique" UNIQUE("name","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_job_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"triggered_by" text NOT NULL,
	"triggered_by_user_id" varchar,
	"result_summary" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_name" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"plan_type" varchar(50) NOT NULL,
	"max_users" integer DEFAULT 5,
	"max_projects" integer,
	"max_clients" integer,
	"ai_enabled" boolean DEFAULT true,
	"sharepoint_enabled" boolean DEFAULT false,
	"sso_enabled" boolean DEFAULT false,
	"custom_branding_enabled" boolean DEFAULT false,
	"co_branding_enabled" boolean DEFAULT true,
	"subdomain_enabled" boolean DEFAULT false,
	"planner_enabled" boolean DEFAULT false,
	"trial_duration_days" integer,
	"monthly_price_cents" integer,
	"annual_price_cents" integer,
	"billing_cycle" varchar(20),
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_internal_name_unique" UNIQUE("internal_name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"sso_provider" text,
	"sso_token" text,
	"sso_refresh_token" text,
	"sso_token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_tenant_id" varchar
);
--> statement-breakpoint
CREATE TABLE "sows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"type" text DEFAULT 'initial' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value" numeric(10, 2) NOT NULL,
	"hours" numeric(10, 2),
	"document_url" text,
	"document_name" text,
	"signed_date" date,
	"effective_date" date NOT NULL,
	"expiration_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar,
	"tenant_id" varchar,
	"title" text NOT NULL,
	"report_type" text DEFAULT 'text' NOT NULL,
	"report_style" text DEFAULT 'detailed_update' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"report_content" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"spe_file_id" text,
	"spe_container_id" text,
	"metadata" jsonb,
	"generated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_planner_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"plan_id" varchar(255) NOT NULL,
	"task_id" varchar(255) NOT NULL,
	"task_title" text,
	"bucket_id" varchar(255),
	"bucket_name" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"sync_error" text,
	"remote_etag" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" integer NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" varchar,
	"metadata" jsonb,
	"application_source" text DEFAULT 'Constellation' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" varchar
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setting_key" text NOT NULL,
	"setting_value" text NOT NULL,
	"description" text,
	"setting_type" text DEFAULT 'string' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_setting_key_unique" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "teams_automation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar,
	"team_id" varchar(255),
	"channel_id" varchar(255),
	"action" text NOT NULL,
	"target_user_id" varchar,
	"target_azure_user_id" varchar(255),
	"target_email" text,
	"details" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"triggered_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams_folder_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"folder_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"scope" text DEFAULT 'system' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams_member_sync_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar NOT NULL,
	"team_id" varchar(255) NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"auto_add_members" boolean DEFAULT true NOT NULL,
	"auto_remove_members" boolean DEFAULT false NOT NULL,
	"invite_guests_automatically" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_status" text,
	"last_sync_error" text,
	"members_added" integer DEFAULT 0 NOT NULL,
	"members_removed" integer DEFAULT 0 NOT NULL,
	"guests_invited" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_teams_member_sync_state_project" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "teams_tab_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"tab_type" text NOT NULL,
	"tab_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_microsoft_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(255),
	"azure_tenant_id" varchar(255) NOT NULL,
	"azure_tenant_name" text,
	"integration_type" text DEFAULT 'publisher_app' NOT NULL,
	"client_id" varchar(255),
	"client_secret_ref" text,
	"granted_scopes" text[],
	"consent_granted_at" timestamp,
	"consent_granted_by" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_validated_at" timestamp,
	"validation_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"role" varchar(50) DEFAULT 'employee' NOT NULL,
	"client_id" varchar,
	"stakeholder_title" varchar(100),
	"status" varchar(50) DEFAULT 'active',
	"receive_financial_alerts" boolean DEFAULT false NOT NULL,
	"invited_by" varchar,
	"invited_at" timestamp,
	"joined_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(100) NOT NULL,
	"color" text,
	"logo_url" text,
	"logo_url_dark" text,
	"favicon_url" text,
	"custom_subdomain" text,
	"branding" jsonb,
	"company_address" text,
	"company_phone" text,
	"company_email" text,
	"company_website" text,
	"payment_terms" text,
	"allowed_domains" jsonb,
	"azure_tenant_id" text,
	"enforce_sso" boolean DEFAULT false,
	"allow_local_auth" boolean DEFAULT true,
	"invite_only" boolean DEFAULT false,
	"connector_sharepoint" boolean DEFAULT false,
	"connector_outlook" boolean DEFAULT false,
	"connector_planner" boolean DEFAULT false,
	"admin_consent_granted" boolean DEFAULT false,
	"admin_consent_granted_at" timestamp,
	"admin_consent_granted_by" varchar,
	"fiscal_year_start_month" integer DEFAULT 1,
	"default_timezone" varchar(50) DEFAULT 'America/New_York',
	"vocabulary_overrides" jsonb,
	"service_plan_id" varchar,
	"plan_started_at" timestamp,
	"plan_expires_at" timestamp,
	"plan_status" text DEFAULT 'active',
	"self_service_signup" boolean DEFAULT false,
	"signup_completed_at" timestamp,
	"organization_size" text,
	"industry" text,
	"location" text,
	"show_constellation_footer" boolean DEFAULT true,
	"email_header_url" text,
	"default_billing_rate" numeric(10, 2) DEFAULT '0',
	"default_cost_rate" numeric(10, 2) DEFAULT '0',
	"mileage_rate" numeric(10, 4) DEFAULT '0.70',
	"default_tax_rate" numeric(5, 2) DEFAULT '0',
	"invoice_default_discount_type" text DEFAULT 'percent',
	"invoice_default_discount_value" numeric(10, 2) DEFAULT '0',
	"show_changelog_on_login" boolean DEFAULT true,
	"expense_reminders_enabled" boolean DEFAULT false,
	"expense_reminder_time" varchar(5) DEFAULT '08:00',
	"expense_reminder_day" integer DEFAULT 1,
	"support_planner_enabled" boolean DEFAULT false,
	"support_planner_plan_id" varchar(255),
	"support_planner_plan_title" text,
	"support_planner_plan_web_url" text,
	"support_planner_group_id" varchar(255),
	"support_planner_group_name" text,
	"support_planner_bucket_name" text,
	"support_lists_enabled" boolean DEFAULT false,
	"next_gl_invoice_number" integer DEFAULT 1000,
	"spe_container_id_dev" text,
	"spe_container_id_prod" text,
	"spe_storage_enabled" boolean DEFAULT false,
	"spe_migration_status" text,
	"spe_migration_started_at" timestamp,
	"m365_auto_provision_teams" boolean DEFAULT false,
	"m365_default_team_template" text DEFAULT 'standard',
	"m365_default_channel_folders" jsonb,
	"m365_sharepoint_config" jsonb,
	"m365_default_pursuit_team_id" text,
	"m365_default_pursuit_team_name" text,
	"pptx_title_template_file_id" text,
	"pptx_title_template_file_name" text,
	"pptx_title_template_uploaded_at" timestamp,
	"pptx_section_template_file_id" text,
	"pptx_section_template_file_name" text,
	"pptx_section_template_uploaded_at" timestamp,
	"pptx_closing_template_file_id" text,
	"pptx_closing_template_file_name" text,
	"pptx_closing_template_uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_name_unique" UNIQUE("name"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"person_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"date" date NOT NULL,
	"hours" numeric(10, 2) NOT NULL,
	"phase" text,
	"billable" boolean DEFAULT true NOT NULL,
	"description" text,
	"billed_flag" boolean DEFAULT false NOT NULL,
	"status_reported_flag" boolean DEFAULT false NOT NULL,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"milestone_id" varchar,
	"workstream_id" varchar,
	"project_stage_id" varchar,
	"allocation_id" varchar,
	"invoice_batch_id" text,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_azure_mappings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"integration_id" varchar,
	"azure_user_id" varchar(255) NOT NULL,
	"azure_upn" text,
	"azure_display_name" text,
	"mapping_method" text DEFAULT 'email' NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rate_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"billing_rate" numeric(10, 2),
	"cost_rate" numeric(10, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "user_role_capabilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"proficiency_level" text DEFAULT 'primary' NOT NULL,
	"custom_cost_rate" numeric(10, 2),
	"custom_billing_rate" numeric(10, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"initials" text,
	"title" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"can_login" boolean DEFAULT false NOT NULL,
	"is_assignable" boolean DEFAULT true NOT NULL,
	"role_id" varchar,
	"custom_role" text,
	"default_billing_rate" numeric(10, 2),
	"default_cost_rate" numeric(10, 2),
	"is_salaried" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"receive_time_reminders" boolean DEFAULT true NOT NULL,
	"receive_expense_reminders" boolean DEFAULT true NOT NULL,
	"contractor_business_name" text,
	"contractor_business_address" text,
	"contractor_billing_id" text,
	"contractor_phone" text,
	"contractor_email" text,
	"password_hash" text,
	"primary_tenant_id" varchar,
	"platform_role" varchar(50) DEFAULT 'user',
	"last_dismissed_changelog_version" varchar(50),
	"auth_provider" varchar(50),
	"azure_object_id" varchar(255),
	"weekly_capacity_hours" numeric(5, 2) DEFAULT '40.00',
	"capacity_notes" text,
	"capacity_effective_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_catalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_type" text NOT NULL,
	"term_value" text NOT NULL,
	"description" text,
	"is_system_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_configuration" ADD CONSTRAINT "ai_configuration_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_summaries" ADD CONSTRAINT "ai_usage_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_containers" ADD CONSTRAINT "client_containers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_containers" ADD CONSTRAINT "client_containers_container_type_id_container_types_container_type_id_fk" FOREIGN KEY ("container_type_id") REFERENCES "public"."container_types"("container_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rate_overrides" ADD CONSTRAINT "client_rate_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rate_overrides" ADD CONSTRAINT "client_rate_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_rate_overrides" ADD CONSTRAINT "client_rate_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_teams" ADD CONSTRAINT "client_teams_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_teams" ADD CONSTRAINT "client_teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_teams" ADD CONSTRAINT "client_teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_epic_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("epic_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_stage_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("stage_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workstream_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("workstream_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_milestone_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("milestone_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_activity_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("activity_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_access" ADD CONSTRAINT "consultant_access_consultant_user_id_users_id_fk" FOREIGN KEY ("consultant_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_access" ADD CONSTRAINT "consultant_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultant_access" ADD CONSTRAINT "consultant_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_columns" ADD CONSTRAINT "container_columns_container_id_client_containers_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."client_containers"("container_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_permissions" ADD CONSTRAINT "container_permissions_container_id_client_containers_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."client_containers"("container_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_permissions" ADD CONSTRAINT "container_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_permissions" ADD CONSTRAINT "container_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_invoices" ADD CONSTRAINT "contractor_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_invoices" ADD CONSTRAINT "contractor_invoices_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_invoices" ADD CONSTRAINT "contractor_invoices_contractor_user_id_users_id_fk" FOREIGN KEY ("contractor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_invoices" ADD CONSTRAINT "contractor_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_invoices" ADD CONSTRAINT "contractor_invoices_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_connections" ADD CONSTRAINT "crm_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_object_mappings" ADD CONSTRAINT "crm_object_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_log" ADD CONSTRAINT "crm_sync_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_status_history" ADD CONSTRAINT "deliverable_status_history_deliverable_id_project_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."project_deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_status_history" ADD CONSTRAINT "deliverable_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_container_id_client_containers_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."client_containers"("container_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_project_id_projects_code_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_metadata" ADD CONSTRAINT "document_metadata_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_activities" ADD CONSTRAINT "estimate_activities_stage_id_estimate_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."estimate_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_allocations" ADD CONSTRAINT "estimate_allocations_activity_id_estimate_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."estimate_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_allocations" ADD CONSTRAINT "estimate_allocations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_allocations" ADD CONSTRAINT "estimate_allocations_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_channels" ADD CONSTRAINT "estimate_channels_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_channels" ADD CONSTRAINT "estimate_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_channels" ADD CONSTRAINT "estimate_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_epics" ADD CONSTRAINT "estimate_epics_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_epic_id_estimate_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."estimate_epics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_stage_id_estimate_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."estimate_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_milestones" ADD CONSTRAINT "estimate_milestones_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_rate_overrides" ADD CONSTRAINT "estimate_rate_overrides_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_rate_overrides" ADD CONSTRAINT "estimate_rate_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_shares" ADD CONSTRAINT "estimate_shares_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_shares" ADD CONSTRAINT "estimate_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_shares" ADD CONSTRAINT "estimate_shares_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_stages" ADD CONSTRAINT "estimate_stages_epic_id_estimate_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."estimate_epics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_attachments" ADD CONSTRAINT "expense_attachments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_report_items" ADD CONSTRAINT "expense_report_items_report_id_expense_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."expense_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_report_items" ADD CONSTRAINT "expense_report_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_resource_id_users_id_fk" FOREIGN KEY ("project_resource_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grounding_documents" ADD CONSTRAINT "grounding_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grounding_documents" ADD CONSTRAINT "grounding_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grounding_documents" ADD CONSTRAINT "grounding_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_batch_id_invoice_batches_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."invoice_batches"("batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_project_milestone_id_project_milestones_id_fk" FOREIGN KEY ("project_milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_as_of_date_updated_by_users_id_fk" FOREIGN KEY ("as_of_date_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_batches" ADD CONSTRAINT "invoice_batches_payment_updated_by_users_id_fk" FOREIGN KEY ("payment_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_batch_id_invoice_batches_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."invoice_batches"("batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_project_milestone_id_project_milestones_id_fk" FOREIGN KEY ("project_milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_source_expense_id_expenses_id_fk" FOREIGN KEY ("source_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_source_time_entry_id_time_entries_id_fk" FOREIGN KEY ("source_time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_write_audit" ADD CONSTRAINT "mcp_write_audit_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_write_audit" ADD CONSTRAINT "mcp_write_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_epic_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("epic_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_stage_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("stage_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_workstream_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("workstream_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_milestone_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("milestone_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_vocabulary" ADD CONSTRAINT "organization_vocabulary_activity_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("activity_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_receipts" ADD CONSTRAINT "pending_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_receipts" ADD CONSTRAINT "pending_receipts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_receipts" ADD CONSTRAINT "pending_receipts_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_receipts" ADD CONSTRAINT "pending_receipts_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_task_sync" ADD CONSTRAINT "planner_task_sync_connection_id_project_planner_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."project_planner_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planner_task_sync" ADD CONSTRAINT "planner_task_sync_allocation_id_project_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."project_allocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_stage_id_project_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."project_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_activity_id_project_activities_id_fk" FOREIGN KEY ("project_activity_id") REFERENCES "public"."project_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_milestone_id_project_milestones_id_fk" FOREIGN KEY ("project_milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_workstream_id_project_workstreams_id_fk" FOREIGN KEY ("project_workstream_id") REFERENCES "public"."project_workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_epic_id_project_epics_id_fk" FOREIGN KEY ("project_epic_id") REFERENCES "public"."project_epics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_stage_id_project_stages_id_fk" FOREIGN KEY ("project_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_estimate_line_item_id_estimate_line_items_id_fk" FOREIGN KEY ("estimate_line_item_id") REFERENCES "public"."estimate_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_baselines" ADD CONSTRAINT "project_baselines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_baselines" ADD CONSTRAINT "project_baselines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_baselines" ADD CONSTRAINT "project_baselines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_history" ADD CONSTRAINT "project_budget_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_history" ADD CONSTRAINT "project_budget_history_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_history" ADD CONSTRAINT "project_budget_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_channels" ADD CONSTRAINT "project_channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_channels" ADD CONSTRAINT "project_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_channels" ADD CONSTRAINT "project_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_engagements" ADD CONSTRAINT "project_engagements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_engagements" ADD CONSTRAINT "project_engagements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_engagements" ADD CONSTRAINT "project_engagements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_engagements" ADD CONSTRAINT "project_engagements_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_epics" ADD CONSTRAINT "project_epics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_epics" ADD CONSTRAINT "project_epics_estimate_epic_id_estimate_epics_id_fk" FOREIGN KEY ("estimate_epic_id") REFERENCES "public"."estimate_epics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_epic_id_project_epics_id_fk" FOREIGN KEY ("project_epic_id") REFERENCES "public"."project_epics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_estimate_stage_id_estimate_stages_id_fk" FOREIGN KEY ("estimate_stage_id") REFERENCES "public"."estimate_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_estimate_milestone_id_estimate_milestones_id_fk" FOREIGN KEY ("estimate_milestone_id") REFERENCES "public"."estimate_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_sow_id_sows_id_fk" FOREIGN KEY ("sow_id") REFERENCES "public"."sows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_retainer_stage_id_project_stages_id_fk" FOREIGN KEY ("retainer_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_planner_connections" ADD CONSTRAINT "project_planner_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_planner_connections" ADD CONSTRAINT "project_planner_connections_integration_id_tenant_microsoft_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."tenant_microsoft_integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_planner_connections" ADD CONSTRAINT "project_planner_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rate_overrides" ADD CONSTRAINT "project_rate_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rate_overrides" ADD CONSTRAINT "project_rate_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_epic_id_project_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."project_epics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_reports" ADD CONSTRAINT "project_status_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_reports" ADD CONSTRAINT "project_status_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_reports" ADD CONSTRAINT "project_status_reports_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workstreams" ADD CONSTRAINT "project_workstreams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_users_id_fk" FOREIGN KEY ("pm") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_epic_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("epic_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_stage_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("stage_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workstream_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("workstream_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_milestone_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("milestone_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_activity_term_id_vocabulary_catalog_id_fk" FOREIGN KEY ("activity_term_id") REFERENCES "public"."vocabulary_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raidd_entries" ADD CONSTRAINT "raidd_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_requested_for_user_id_users_id_fk" FOREIGN KEY ("requested_for_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_batches" ADD CONSTRAINT "reimbursement_batches_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_items" ADD CONSTRAINT "reimbursement_line_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_items" ADD CONSTRAINT "reimbursement_line_items_batch_id_reimbursement_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."reimbursement_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_items" ADD CONSTRAINT "reimbursement_line_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursement_line_items" ADD CONSTRAINT "reimbursement_line_items_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sows" ADD CONSTRAINT "sows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sows" ADD CONSTRAINT "sows_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_planner_sync" ADD CONSTRAINT "support_ticket_planner_sync_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_planner_sync" ADD CONSTRAINT "support_ticket_planner_sync_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_replies" ADD CONSTRAINT "support_ticket_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_automation_logs" ADD CONSTRAINT "teams_automation_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_automation_logs" ADD CONSTRAINT "teams_automation_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_automation_logs" ADD CONSTRAINT "teams_automation_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_automation_logs" ADD CONSTRAINT "teams_automation_logs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_folder_templates" ADD CONSTRAINT "teams_folder_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_member_sync_state" ADD CONSTRAINT "teams_member_sync_state_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_member_sync_state" ADD CONSTRAINT "teams_member_sync_state_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams_tab_templates" ADD CONSTRAINT "teams_tab_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_service_plan_id_service_plans_id_fk" FOREIGN KEY ("service_plan_id") REFERENCES "public"."service_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_person_id_users_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workstream_id_project_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."project_workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_stage_id_project_stages_id_fk" FOREIGN KEY ("project_stage_id") REFERENCES "public"."project_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_allocation_id_project_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."project_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoice_batch_id_invoice_batches_batch_id_fk" FOREIGN KEY ("invoice_batch_id") REFERENCES "public"."invoice_batches"("batch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_azure_mappings" ADD CONSTRAINT "user_azure_mappings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_azure_mappings" ADD CONSTRAINT "user_azure_mappings_integration_id_tenant_microsoft_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."tenant_microsoft_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rate_schedules" ADD CONSTRAINT "user_rate_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rate_schedules" ADD CONSTRAINT "user_rate_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_capabilities" ADD CONSTRAINT "user_role_capabilities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_capabilities" ADD CONSTRAINT "user_role_capabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_capabilities" ADD CONSTRAINT "user_role_capabilities_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_tenant_id_tenants_id_fk" FOREIGN KEY ("primary_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_card_health_checks_checked_at" ON "agent_card_health_checks" USING btree ("checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ai_alert_period_threshold_unique" ON "ai_usage_alerts" USING btree ("period_month","threshold_percent");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_tenant" ON "ai_usage_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_feature" ON "ai_usage_logs" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_created" ON "ai_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_provider" ON "ai_usage_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_tenant" ON "ai_usage_summaries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_period" ON "ai_usage_summaries" USING btree ("period_type","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_airport_iata_code" ON "airport_codes" USING btree ("iata_code");--> statement-breakpoint
CREATE INDEX "idx_airport_country" ON "airport_codes" USING btree ("iso_country");--> statement-breakpoint
CREATE INDEX "idx_airport_name" ON "airport_codes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "client_rate_overrides_client_subject_idx" ON "client_rate_overrides" USING btree ("client_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_client_teams_client" ON "client_teams" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_client_teams_tenant" ON "client_teams" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_clients_tenant" ON "clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_consultant_access_tenant" ON "consultant_access" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_consultant_access_consultant" ON "consultant_access" USING btree ("consultant_user_id");--> statement-breakpoint
CREATE INDEX "contractor_invoices_report_idx" ON "contractor_invoices" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "contractor_invoices_contractor_idx" ON "contractor_invoices" USING btree ("contractor_user_id");--> statement-breakpoint
CREATE INDEX "contractor_invoices_status_idx" ON "contractor_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contractor_invoices_tenant_idx" ON "contractor_invoices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_crm_connections_tenant" ON "crm_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_crm_tenant_provider" ON "crm_connections" USING btree ("tenant_id","crm_provider");--> statement-breakpoint
CREATE INDEX "idx_crm_mappings_tenant" ON "crm_object_mappings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_crm_mappings_crm_object" ON "crm_object_mappings" USING btree ("crm_provider","crm_object_type","crm_object_id");--> statement-breakpoint
CREATE INDEX "idx_crm_mappings_local_object" ON "crm_object_mappings" USING btree ("local_object_type","local_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_crm_object_mapping" ON "crm_object_mappings" USING btree ("tenant_id","crm_provider","crm_object_type","crm_object_id","local_object_type","local_object_id");--> statement-breakpoint
CREATE INDEX "idx_crm_sync_log_tenant" ON "crm_sync_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_crm_sync_log_created" ON "crm_sync_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_deliverable_status_history_deliverable" ON "deliverable_status_history" USING btree ("deliverable_id");--> statement-breakpoint
CREATE INDEX "idx_estimate_channels_estimate" ON "estimate_channels" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "idx_estimate_channels_tenant" ON "estimate_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "estimate_rate_overrides_estimate_subject_idx" ON "estimate_rate_overrides" USING btree ("estimate_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "estimate_shares_unique_idx" ON "estimate_shares" USING btree ("estimate_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_tenant" ON "estimates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "expense_report_items_report_idx" ON "expense_report_items" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "expense_report_items_expense_idx" ON "expense_report_items" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_expense_per_report" ON "expense_report_items" USING btree ("report_id","expense_id");--> statement-breakpoint
CREATE INDEX "expense_reports_submitter_idx" ON "expense_reports" USING btree ("submitter_id");--> statement-breakpoint
CREATE INDEX "expense_reports_status_idx" ON "expense_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_expenses_tenant" ON "expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_grounding_docs_tenant" ON "grounding_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_grounding_docs_category" ON "grounding_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_grounding_docs_active" ON "grounding_documents" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_invoice_batches_tenant" ON "invoice_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mcp_write_audit_tenant_user_key" ON "mcp_write_audit" USING btree ("tenant_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_mcp_write_audit_tenant" ON "mcp_write_audit" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_write_audit_created" ON "mcp_write_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_write_audit_resource" ON "mcp_write_audit" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_oconus_country_location" ON "oconus_per_diem_rates" USING btree ("country","location");--> statement-breakpoint
CREATE INDEX "idx_oconus_country" ON "oconus_per_diem_rates" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_oconus_fiscal_year" ON "oconus_per_diem_rates" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "idx_organization_vocabulary_tenant" ON "organization_vocabulary" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_organization_vocabulary_tenant" ON "organization_vocabulary" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_project_allocations_tenant" ON "project_allocations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_project_channels_project" ON "project_channels" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_channels_tenant" ON "project_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_project_deliverables_tenant" ON "project_deliverables" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_project_deliverables_project" ON "project_deliverables" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_deliverables_status" ON "project_deliverables" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_status_reports_project" ON "project_status_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_status_reports_tenant" ON "project_status_reports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_projects_tenant" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_raidd_entries_tenant" ON "raidd_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_raidd_entries_project" ON "raidd_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_raidd_entries_type" ON "raidd_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_raidd_entries_status" ON "raidd_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_raidd_entries_parent" ON "raidd_entries" USING btree ("parent_entry_id");--> statement-breakpoint
CREATE INDEX "reimbursement_batches_status_idx" ON "reimbursement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reimbursement_line_items_batch_idx" ON "reimbursement_line_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "reimbursement_line_items_expense_idx" ON "reimbursement_line_items" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_tenant_id_idx" ON "scheduled_job_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_job_type_idx" ON "scheduled_job_runs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_started_at_idx" ON "scheduled_job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_initial_sow_per_project" ON "sows" USING btree ("project_id") WHERE "sows"."type" = 'initial' AND "sows"."status" IN ('approved', 'pending');--> statement-breakpoint
CREATE INDEX "idx_status_reports_project" ON "status_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_status_reports_tenant" ON "status_reports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_teams_auto_logs_tenant_created" ON "teams_automation_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_teams_auto_logs_project_created" ON "teams_automation_logs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_teams_auto_logs_team_created" ON "teams_automation_logs" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_teams_auto_logs_action_created" ON "teams_automation_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_folder_templates_tenant_scope" ON "teams_folder_templates" USING btree ("tenant_id","scope");--> statement-breakpoint
CREATE INDEX "idx_tab_templates_tenant" ON "teams_tab_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_tenant_client" ON "tenant_users" USING btree ("user_id","tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_users_tenant" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_users_user" ON "tenant_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tenant_users_client" ON "tenant_users" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_time_entries_tenant" ON "time_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_tenant_role" ON "user_role_capabilities" USING btree ("tenant_id","user_id","role_id");--> statement-breakpoint
CREATE INDEX "idx_user_role_caps_tenant" ON "user_role_capabilities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_user_role_caps_user" ON "user_role_capabilities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_role_caps_role" ON "user_role_capabilities" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_term_type_value" ON "vocabulary_catalog" USING btree ("term_type","term_value");