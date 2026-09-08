CREATE TABLE "health_alert_states" (
	"alerting_enabled" boolean DEFAULT false NOT NULL,
	"project_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(24) NOT NULL,
	"status_since" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_observed_at" timestamp with time zone NOT NULL,
	"recovered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closure_reason" varchar(40),
	"escalated_at" timestamp with time zone,
	"initial_status" varchar(24) NOT NULL,
	"current_status" varchar(24) NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid,
	"channel" varchar(8) NOT NULL,
	"notification_type" varchar(32) NOT NULL,
	"test_key" uuid,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempted_at" timestamp with time zone,
	"first_attempted_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" varchar(100),
	"failure_classification" varchar(64),
	"payload" jsonb NOT NULL,
	CONSTRAINT "notification_delivery_channel" CHECK ("notification_deliveries"."channel" in ('email', 'sms')),
	CONSTRAINT "notification_delivery_attempts" CHECK ("notification_deliveries"."attempts" between 0 and 3),
	CONSTRAINT "notification_delivery_event" CHECK (("notification_deliveries"."notification_type" = 'test' and "notification_deliveries"."incident_id" is null and "notification_deliveries"."test_key" is not null) or ("notification_deliveries"."notification_type" in ('incident_opened', 'incident_escalated', 'incident_recovered') and "notification_deliveries"."incident_id" is not null and "notification_deliveries"."test_key" is null))
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"alerts_enabled" boolean DEFAULT false NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"email_recipient" varchar(254),
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"phone_number" varchar(16),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_single_owner" CHECK ("notification_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "health_alerts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "health_alert_states" ADD CONSTRAINT "health_alert_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_incidents" ADD CONSTRAINT "health_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_incident_id_health_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."health_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "health_incidents_one_active_project" ON "health_incidents" USING btree ("project_id") WHERE "health_incidents"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "health_incidents_opened_idx" ON "health_incidents" USING btree ("opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_event_channel" ON "notification_deliveries" USING btree ("incident_id","channel","notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_test_key" ON "notification_deliveries" USING btree ("test_key");--> statement-breakpoint
CREATE INDEX "notification_delivery_pending_idx" ON "notification_deliveries" USING btree ("status","next_attempt_at");