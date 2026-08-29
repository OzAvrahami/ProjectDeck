CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"connection_state" varchar(40) DEFAULT 'connected' NOT NULL,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_workspaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"encrypted_credentials" jsonb,
	"display_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_resource_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_connection_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"component_id" uuid,
	"provider_resource_type" varchar(80) NOT NULL,
	"external_id" varchar(512) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"association_source" varchar(40) DEFAULT 'manual' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"affects_project_health" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_resource_associations" ADD CONSTRAINT "provider_resource_associations_provider_connection_id_provider_connections_id_fk" FOREIGN KEY ("provider_connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_resource_associations" ADD CONSTRAINT "provider_resource_associations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_resource_associations" ADD CONSTRAINT "provider_resource_associations_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_provider_account_unique" ON "provider_connections" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "provider_connections_provider_state_idx" ON "provider_connections" USING btree ("provider","connection_state");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_resource_associations_connection_external_unique" ON "provider_resource_associations" USING btree ("provider_connection_id","external_id");--> statement-breakpoint
CREATE INDEX "provider_resource_associations_project_idx" ON "provider_resource_associations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "provider_resource_associations_component_idx" ON "provider_resource_associations" USING btree ("component_id");