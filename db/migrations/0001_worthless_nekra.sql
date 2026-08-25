ALTER TABLE "projects" ALTER COLUMN "next_action" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "external_id" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "resources_provider_external_id_unique" ON "resources" USING btree ("provider","external_id");