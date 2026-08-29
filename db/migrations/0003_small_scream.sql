CREATE TABLE "resource_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid,
	"component_id" uuid,
	"label" varchar(160) NOT NULL,
	"monitor_type" varchar(80) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"affects_project_health" boolean DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_monitors" ADD CONSTRAINT "resource_monitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_monitors" ADD CONSTRAINT "resource_monitors_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_monitors" ADD CONSTRAINT "resource_monitors_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_monitors_project_id_idx" ON "resource_monitors" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "resource_monitors_component_id_idx" ON "resource_monitors" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_monitors_resource_type_unique" ON "resource_monitors" USING btree ("resource_id","monitor_type");