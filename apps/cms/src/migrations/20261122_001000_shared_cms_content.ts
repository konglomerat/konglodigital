import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
CREATE TYPE "public"."enum_pages_blocks_inventory_content_source" AS ENUM('inventory', 'showcase');
CREATE TYPE "public"."enum_pages_blocks_inventory_column_count" AS ENUM('2', '3', '4');
CREATE TYPE "public"."enum__pages_v_blocks_inventory_content_source" AS ENUM('inventory', 'showcase');
CREATE TYPE "public"."enum__pages_v_blocks_inventory_column_count" AS ENUM('2', '3', '4');
CREATE TYPE "public"."enum_posts_source_type" AS ENUM('showcase', 'legacy-news');
CREATE TYPE "public"."enum__posts_v_version_source_type" AS ENUM('showcase', 'legacy-news');
CREATE TABLE "pages_blocks_inventory" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"_path" text NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"content_source" "enum_pages_blocks_inventory_content_source" DEFAULT 'inventory',
	"heading" varchar DEFAULT 'Inventar',
	"description" varchar,
	"tag" varchar,
	"column_count" "enum_pages_blocks_inventory_column_count" DEFAULT '3',
	"block_name" varchar
);

CREATE TABLE "_pages_v_blocks_inventory" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"_path" text NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"content_source" "enum__pages_v_blocks_inventory_content_source" DEFAULT 'inventory',
	"heading" varchar DEFAULT 'Inventar',
	"description" varchar,
	"tag" varchar,
	"column_count" "enum__pages_v_blocks_inventory_column_count" DEFAULT '3',
	"_uuid" varchar,
	"block_name" varchar
);

CREATE TABLE "posts_gallery" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"media_id" integer,
	"url" varchar,
	"preview_url" varchar,
	"poster_url" varchar
);

CREATE TABLE "posts_tags" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"tag" varchar
);

CREATE TABLE "posts_resources" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"resource_id" varchar,
	"name" varchar,
	"slug" varchar,
	"image_url" varchar
);

CREATE TABLE "posts_project_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" varchar PRIMARY KEY NOT NULL,
	"label" varchar,
	"url" varchar
);

CREATE TABLE "_posts_v_version_gallery" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"media_id" integer,
	"url" varchar,
	"preview_url" varchar,
	"poster_url" varchar,
	"_uuid" varchar
);

CREATE TABLE "_posts_v_version_tags" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"tag" varchar,
	"_uuid" varchar
);

CREATE TABLE "_posts_v_version_resources" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"resource_id" varchar,
	"name" varchar,
	"slug" varchar,
	"image_url" varchar,
	"_uuid" varchar
);

CREATE TABLE "_posts_v_version_project_links" (
	"_order" integer NOT NULL,
	"_parent_id" integer NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"label" varchar,
	"url" varchar,
	"_uuid" varchar
);

DROP INDEX "posts_slug_idx";
ALTER TABLE "_pages_v_blocks_archive" ALTER COLUMN "limit" SET DEFAULT 10;
ALTER TABLE "pages_blocks_archive" ALTER COLUMN "limit" SET DEFAULT 10;
ALTER TABLE "payload_jobs" ALTER COLUMN "total_tried" SET DEFAULT 0;
ALTER TABLE "users" ALTER COLUMN "login_attempts" SET DEFAULT 0;
ALTER TABLE "_posts_v" ADD COLUMN "version_source_type" "enum__posts_v_version_source_type" DEFAULT 'showcase';
ALTER TABLE "_posts_v" ADD COLUMN "version_original_url" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_imported_at" timestamp(3) with time zone;
ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_date_label" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_excerpt" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_author_name" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_author_bio" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_author_avatar_url" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_workshop_resource_id" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_workshop_name" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_workshop_slug" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_workshop_image_url" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_social_media_consent" boolean DEFAULT false;
ALTER TABLE "_posts_v" ADD COLUMN "version_map_features" jsonb;
ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_resource_id" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_slug" varchar;
ALTER TABLE "_posts_v" ADD COLUMN "version_source_created_at" timestamp(3) with time zone;
ALTER TABLE "_posts_v" ADD COLUMN "version_source_updated_at" timestamp(3) with time zone;
ALTER TABLE "posts" ADD COLUMN "source_type" "enum_posts_source_type" DEFAULT 'showcase';
ALTER TABLE "posts" ADD COLUMN "original_url" varchar;
ALTER TABLE "posts" ADD COLUMN "legacy_imported_at" timestamp(3) with time zone;
ALTER TABLE "posts" ADD COLUMN "legacy_date_label" varchar;
ALTER TABLE "posts" ADD COLUMN "excerpt" varchar;
ALTER TABLE "posts" ADD COLUMN "author_name" varchar;
ALTER TABLE "posts" ADD COLUMN "author_bio" varchar;
ALTER TABLE "posts" ADD COLUMN "author_avatar_url" varchar;
ALTER TABLE "posts" ADD COLUMN "workshop_resource_id" varchar;
ALTER TABLE "posts" ADD COLUMN "workshop_name" varchar;
ALTER TABLE "posts" ADD COLUMN "workshop_slug" varchar;
ALTER TABLE "posts" ADD COLUMN "workshop_image_url" varchar;
ALTER TABLE "posts" ADD COLUMN "social_media_consent" boolean DEFAULT false;
ALTER TABLE "posts" ADD COLUMN "map_features" jsonb;
ALTER TABLE "posts" ADD COLUMN "legacy_resource_id" varchar;
ALTER TABLE "posts" ADD COLUMN "legacy_slug" varchar;
ALTER TABLE "posts" ADD COLUMN "source_created_at" timestamp(3) with time zone;
ALTER TABLE "posts" ADD COLUMN "source_updated_at" timestamp(3) with time zone;
ALTER TABLE "pages_blocks_inventory" ADD CONSTRAINT "pages_blocks_inventory_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "_pages_v_blocks_inventory" ADD CONSTRAINT "_pages_v_blocks_inventory_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posts_gallery" ADD CONSTRAINT "posts_gallery_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "posts_gallery" ADD CONSTRAINT "posts_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posts_tags" ADD CONSTRAINT "posts_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posts_resources" ADD CONSTRAINT "posts_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "posts_project_links" ADD CONSTRAINT "posts_project_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "_posts_v_version_gallery" ADD CONSTRAINT "_posts_v_version_gallery_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "_posts_v_version_gallery" ADD CONSTRAINT "_posts_v_version_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "_posts_v_version_tags" ADD CONSTRAINT "_posts_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "_posts_v_version_resources" ADD CONSTRAINT "_posts_v_version_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "_posts_v_version_project_links" ADD CONSTRAINT "_posts_v_version_project_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "pages_blocks_inventory_order_idx" ON "pages_blocks_inventory" USING btree ("_order");
CREATE INDEX "pages_blocks_inventory_parent_id_idx" ON "pages_blocks_inventory" USING btree ("_parent_id");
CREATE INDEX "pages_blocks_inventory_path_idx" ON "pages_blocks_inventory" USING btree ("_path");
CREATE INDEX "_pages_v_blocks_inventory_order_idx" ON "_pages_v_blocks_inventory" USING btree ("_order");
CREATE INDEX "_pages_v_blocks_inventory_parent_id_idx" ON "_pages_v_blocks_inventory" USING btree ("_parent_id");
CREATE INDEX "_pages_v_blocks_inventory_path_idx" ON "_pages_v_blocks_inventory" USING btree ("_path");
CREATE INDEX "posts_gallery_order_idx" ON "posts_gallery" USING btree ("_order");
CREATE INDEX "posts_gallery_parent_id_idx" ON "posts_gallery" USING btree ("_parent_id");
CREATE INDEX "posts_gallery_media_idx" ON "posts_gallery" USING btree ("media_id");
CREATE INDEX "posts_tags_order_idx" ON "posts_tags" USING btree ("_order");
CREATE INDEX "posts_tags_parent_id_idx" ON "posts_tags" USING btree ("_parent_id");
CREATE INDEX "posts_resources_order_idx" ON "posts_resources" USING btree ("_order");
CREATE INDEX "posts_resources_parent_id_idx" ON "posts_resources" USING btree ("_parent_id");
CREATE INDEX "posts_project_links_order_idx" ON "posts_project_links" USING btree ("_order");
CREATE INDEX "posts_project_links_parent_id_idx" ON "posts_project_links" USING btree ("_parent_id");
CREATE INDEX "_posts_v_version_gallery_order_idx" ON "_posts_v_version_gallery" USING btree ("_order");
CREATE INDEX "_posts_v_version_gallery_parent_id_idx" ON "_posts_v_version_gallery" USING btree ("_parent_id");
CREATE INDEX "_posts_v_version_gallery_media_idx" ON "_posts_v_version_gallery" USING btree ("media_id");
CREATE INDEX "_posts_v_version_tags_order_idx" ON "_posts_v_version_tags" USING btree ("_order");
CREATE INDEX "_posts_v_version_tags_parent_id_idx" ON "_posts_v_version_tags" USING btree ("_parent_id");
CREATE INDEX "_posts_v_version_resources_order_idx" ON "_posts_v_version_resources" USING btree ("_order");
CREATE INDEX "_posts_v_version_resources_parent_id_idx" ON "_posts_v_version_resources" USING btree ("_parent_id");
CREATE INDEX "_posts_v_version_project_links_order_idx" ON "_posts_v_version_project_links" USING btree ("_order");
CREATE INDEX "_posts_v_version_project_links_parent_id_idx" ON "_posts_v_version_project_links" USING btree ("_parent_id");
CREATE INDEX "_posts_v_version_version_source_type_idx" ON "_posts_v" USING btree ("version_source_type");
CREATE INDEX "_posts_v_version_version_original_url_idx" ON "_posts_v" USING btree ("version_original_url");
CREATE INDEX "_posts_v_version_version_legacy_resource_id_idx" ON "_posts_v" USING btree ("version_legacy_resource_id");
CREATE INDEX "_posts_v_version_version_legacy_slug_idx" ON "_posts_v" USING btree ("version_legacy_slug");
CREATE INDEX "posts_source_type_idx" ON "posts" USING btree ("source_type");
CREATE UNIQUE INDEX "posts_original_url_idx" ON "posts" USING btree ("original_url");
CREATE UNIQUE INDEX "posts_legacy_resource_id_idx" ON "posts" USING btree ("legacy_resource_id");
CREATE INDEX "posts_legacy_slug_idx" ON "posts" USING btree ("legacy_slug");
CREATE UNIQUE INDEX "posts_slug_idx" ON "posts" USING btree ("slug");
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('Content migration is additive. Restore the verified pre-merge backup for rollback; do not drop migrated content.')
}
