import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload: _payload, req: _req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_gallery_column_count" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum_pages_blocks_embed_kind" AS ENUM('iframe', 'video', 'audio');
  CREATE TYPE "public"."enum_pages_blocks_embed_aspect_ratio" AS ENUM('16/9', '4/3', '1/1');
  CREATE TYPE "public"."enum_pages_blocks_contact_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_pages_blocks_contact_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_pages_blocks_stats_items_tone" AS ENUM('grau', 'rosa', 'gelb', 'gruen');
  CREATE TYPE "public"."enum_pages_blocks_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_pages_blocks_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_pages_blocks_card_grid_column_count" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum_pages_blocks_app_slot_slot" AS ENUM('calendarUpcoming', 'news', 'showcaseOfMonth', 'resourceOfMonth');
  CREATE TYPE "public"."enum__pages_v_blocks_gallery_column_count" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum__pages_v_blocks_embed_kind" AS ENUM('iframe', 'video', 'audio');
  CREATE TYPE "public"."enum__pages_v_blocks_embed_aspect_ratio" AS ENUM('16/9', '4/3', '1/1');
  CREATE TYPE "public"."enum__pages_v_blocks_contact_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__pages_v_blocks_contact_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__pages_v_blocks_stats_items_tone" AS ENUM('grau', 'rosa', 'gelb', 'gruen');
  CREATE TYPE "public"."enum__pages_v_blocks_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__pages_v_blocks_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__pages_v_blocks_card_grid_column_count" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum__pages_v_blocks_app_slot_slot" AS ENUM('calendarUpcoming', 'news', 'showcaseOfMonth', 'resourceOfMonth');
  CREATE TABLE IF NOT EXISTS "pages_blocks_downloads_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar,
    "description" varchar,
    "file_id" integer,
    "url" varchar,
    "new_tab" boolean DEFAULT true
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_downloads" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_gallery_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "media_id" integer,
    "caption" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "column_count" "enum_pages_blocks_gallery_column_count" DEFAULT '3',
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_logo_grid_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar,
    "logo_id" integer,
    "url" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_logo_grid" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_embed" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar,
    "kind" "enum_pages_blocks_embed_kind" DEFAULT 'iframe',
    "url" varchar,
    "aspect_ratio" "enum_pages_blocks_embed_aspect_ratio" DEFAULT '16/9',
    "caption" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_contact_links" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "link_type" "enum_pages_blocks_contact_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_pages_blocks_contact_links_link_appearance" DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_contact" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Kontakt',
    "intro_content" jsonb,
    "address" varchar,
    "email" varchar,
    "phone" varchar,
    "map_url" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_accordion_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar,
    "content" jsonb
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_accordion" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro_content" jsonb,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_stats_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "value" varchar,
    "label" varchar,
    "hint" varchar,
    "tone" "enum_pages_blocks_stats_items_tone" DEFAULT 'grau'
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_stats" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_card_grid_cards" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "eyebrow" varchar,
    "title" varchar,
    "description" jsonb,
    "media_id" integer,
    "enable_link" boolean,
    "link_type" "enum_pages_blocks_card_grid_cards_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_pages_blocks_card_grid_cards_link_appearance" DEFAULT 'default'
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_card_grid" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "column_count" "enum_pages_blocks_card_grid_column_count" DEFAULT '3',
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_app_slot" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "slot" "enum_pages_blocks_app_slot_slot",
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_downloads_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar,
    "description" varchar,
    "file_id" integer,
    "url" varchar,
    "new_tab" boolean DEFAULT true,
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_downloads" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_gallery_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "media_id" integer,
    "caption" varchar,
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "column_count" "enum__pages_v_blocks_gallery_column_count" DEFAULT '3',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_logo_grid_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "logo_id" integer,
    "url" varchar,
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_logo_grid" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_embed" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "kind" "enum__pages_v_blocks_embed_kind" DEFAULT 'iframe',
    "url" varchar,
    "aspect_ratio" "enum__pages_v_blocks_embed_aspect_ratio" DEFAULT '16/9',
    "caption" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_contact_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "link_type" "enum__pages_v_blocks_contact_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__pages_v_blocks_contact_links_link_appearance" DEFAULT 'default',
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_contact" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Kontakt',
    "intro_content" jsonb,
    "address" varchar,
    "email" varchar,
    "phone" varchar,
    "map_url" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_accordion_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "content" jsonb,
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_accordion" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro_content" jsonb,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_stats_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "value" varchar,
    "label" varchar,
    "hint" varchar,
    "tone" "enum__pages_v_blocks_stats_items_tone" DEFAULT 'grau',
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_stats" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_card_grid_cards" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "eyebrow" varchar,
    "title" varchar,
    "description" jsonb,
    "media_id" integer,
    "enable_link" boolean,
    "link_type" "enum__pages_v_blocks_card_grid_cards_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__pages_v_blocks_card_grid_cards_link_appearance" DEFAULT 'default',
    "_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_card_grid" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "intro_content" jsonb,
    "column_count" "enum__pages_v_blocks_card_grid_column_count" DEFAULT '3',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_app_slot" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "slot" "enum__pages_v_blocks_app_slot_slot",
    "_uuid" varchar,
    "block_name" varchar
  );

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_downloads_items" ADD CONSTRAINT "pages_blocks_downloads_items_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_downloads_items" ADD CONSTRAINT "pages_blocks_downloads_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_downloads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_downloads" ADD CONSTRAINT "pages_blocks_downloads_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_gallery" ADD CONSTRAINT "pages_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_logo_grid_items" ADD CONSTRAINT "pages_blocks_logo_grid_items_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_logo_grid_items" ADD CONSTRAINT "pages_blocks_logo_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_logo_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_logo_grid" ADD CONSTRAINT "pages_blocks_logo_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_embed" ADD CONSTRAINT "pages_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_contact_links" ADD CONSTRAINT "pages_blocks_contact_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_contact"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_contact" ADD CONSTRAINT "pages_blocks_contact_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_accordion_items" ADD CONSTRAINT "pages_blocks_accordion_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_accordion"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_accordion" ADD CONSTRAINT "pages_blocks_accordion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_stats_items" ADD CONSTRAINT "pages_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_stats" ADD CONSTRAINT "pages_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_card_grid_cards" ADD CONSTRAINT "pages_blocks_card_grid_cards_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_card_grid_cards" ADD CONSTRAINT "pages_blocks_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_card_grid" ADD CONSTRAINT "pages_blocks_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "pages_blocks_app_slot" ADD CONSTRAINT "pages_blocks_app_slot_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_downloads_items" ADD CONSTRAINT "_pages_v_blocks_downloads_items_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_downloads_items" ADD CONSTRAINT "_pages_v_blocks_downloads_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_downloads"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_downloads" ADD CONSTRAINT "_pages_v_blocks_downloads_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_gallery" ADD CONSTRAINT "_pages_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_logo_grid_items" ADD CONSTRAINT "_pages_v_blocks_logo_grid_items_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_logo_grid_items" ADD CONSTRAINT "_pages_v_blocks_logo_grid_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_logo_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_logo_grid" ADD CONSTRAINT "_pages_v_blocks_logo_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_embed" ADD CONSTRAINT "_pages_v_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_contact_links" ADD CONSTRAINT "_pages_v_blocks_contact_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_contact"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_contact" ADD CONSTRAINT "_pages_v_blocks_contact_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_accordion_items" ADD CONSTRAINT "_pages_v_blocks_accordion_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_accordion"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_accordion" ADD CONSTRAINT "_pages_v_blocks_accordion_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_stats_items" ADD CONSTRAINT "_pages_v_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_stats" ADD CONSTRAINT "_pages_v_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_card_grid_cards" ADD CONSTRAINT "_pages_v_blocks_card_grid_cards_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_card_grid_cards" ADD CONSTRAINT "_pages_v_blocks_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_card_grid" ADD CONSTRAINT "_pages_v_blocks_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "_pages_v_blocks_app_slot" ADD CONSTRAINT "_pages_v_blocks_app_slot_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_items_order_idx" ON "pages_blocks_downloads_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_items_parent_id_idx" ON "pages_blocks_downloads_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_items_file_idx" ON "pages_blocks_downloads_items" USING btree ("file_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_order_idx" ON "pages_blocks_downloads" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_parent_id_idx" ON "pages_blocks_downloads" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_downloads_path_idx" ON "pages_blocks_downloads" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_items_order_idx" ON "pages_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_items_parent_id_idx" ON "pages_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_items_media_idx" ON "pages_blocks_gallery_items" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_order_idx" ON "pages_blocks_gallery" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_parent_id_idx" ON "pages_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_gallery_path_idx" ON "pages_blocks_gallery" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_items_order_idx" ON "pages_blocks_logo_grid_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_items_parent_id_idx" ON "pages_blocks_logo_grid_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_items_logo_idx" ON "pages_blocks_logo_grid_items" USING btree ("logo_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_order_idx" ON "pages_blocks_logo_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_parent_id_idx" ON "pages_blocks_logo_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_grid_path_idx" ON "pages_blocks_logo_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_embed_order_idx" ON "pages_blocks_embed" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_embed_parent_id_idx" ON "pages_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_embed_path_idx" ON "pages_blocks_embed" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_contact_links_order_idx" ON "pages_blocks_contact_links" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_contact_links_parent_id_idx" ON "pages_blocks_contact_links" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_contact_order_idx" ON "pages_blocks_contact" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_contact_parent_id_idx" ON "pages_blocks_contact" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_contact_path_idx" ON "pages_blocks_contact" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_accordion_items_order_idx" ON "pages_blocks_accordion_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_accordion_items_parent_id_idx" ON "pages_blocks_accordion_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_accordion_order_idx" ON "pages_blocks_accordion" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_accordion_parent_id_idx" ON "pages_blocks_accordion" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_accordion_path_idx" ON "pages_blocks_accordion" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_stats_items_order_idx" ON "pages_blocks_stats_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_stats_items_parent_id_idx" ON "pages_blocks_stats_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_stats_order_idx" ON "pages_blocks_stats" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_stats_parent_id_idx" ON "pages_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_stats_path_idx" ON "pages_blocks_stats" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_cards_order_idx" ON "pages_blocks_card_grid_cards" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_cards_parent_id_idx" ON "pages_blocks_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_cards_media_idx" ON "pages_blocks_card_grid_cards" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_order_idx" ON "pages_blocks_card_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_parent_id_idx" ON "pages_blocks_card_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_card_grid_path_idx" ON "pages_blocks_card_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "pages_blocks_app_slot_order_idx" ON "pages_blocks_app_slot" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_app_slot_parent_id_idx" ON "pages_blocks_app_slot" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_app_slot_path_idx" ON "pages_blocks_app_slot" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_items_order_idx" ON "_pages_v_blocks_downloads_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_items_parent_id_idx" ON "_pages_v_blocks_downloads_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_items_file_idx" ON "_pages_v_blocks_downloads_items" USING btree ("file_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_order_idx" ON "_pages_v_blocks_downloads" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_parent_id_idx" ON "_pages_v_blocks_downloads" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_downloads_path_idx" ON "_pages_v_blocks_downloads" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_items_order_idx" ON "_pages_v_blocks_gallery_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_items_parent_id_idx" ON "_pages_v_blocks_gallery_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_items_media_idx" ON "_pages_v_blocks_gallery_items" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_order_idx" ON "_pages_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_parent_id_idx" ON "_pages_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_gallery_path_idx" ON "_pages_v_blocks_gallery" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_items_order_idx" ON "_pages_v_blocks_logo_grid_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_items_parent_id_idx" ON "_pages_v_blocks_logo_grid_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_items_logo_idx" ON "_pages_v_blocks_logo_grid_items" USING btree ("logo_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_order_idx" ON "_pages_v_blocks_logo_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_parent_id_idx" ON "_pages_v_blocks_logo_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_grid_path_idx" ON "_pages_v_blocks_logo_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_embed_order_idx" ON "_pages_v_blocks_embed" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_embed_parent_id_idx" ON "_pages_v_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_embed_path_idx" ON "_pages_v_blocks_embed" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_contact_links_order_idx" ON "_pages_v_blocks_contact_links" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_contact_links_parent_id_idx" ON "_pages_v_blocks_contact_links" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_contact_order_idx" ON "_pages_v_blocks_contact" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_contact_parent_id_idx" ON "_pages_v_blocks_contact" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_contact_path_idx" ON "_pages_v_blocks_contact" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_accordion_items_order_idx" ON "_pages_v_blocks_accordion_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_accordion_items_parent_id_idx" ON "_pages_v_blocks_accordion_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_accordion_order_idx" ON "_pages_v_blocks_accordion" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_accordion_parent_id_idx" ON "_pages_v_blocks_accordion" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_accordion_path_idx" ON "_pages_v_blocks_accordion" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_stats_items_order_idx" ON "_pages_v_blocks_stats_items" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_stats_items_parent_id_idx" ON "_pages_v_blocks_stats_items" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_stats_order_idx" ON "_pages_v_blocks_stats" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_stats_parent_id_idx" ON "_pages_v_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_stats_path_idx" ON "_pages_v_blocks_stats" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_cards_order_idx" ON "_pages_v_blocks_card_grid_cards" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_cards_parent_id_idx" ON "_pages_v_blocks_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_cards_media_idx" ON "_pages_v_blocks_card_grid_cards" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_order_idx" ON "_pages_v_blocks_card_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_parent_id_idx" ON "_pages_v_blocks_card_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_card_grid_path_idx" ON "_pages_v_blocks_card_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_app_slot_order_idx" ON "_pages_v_blocks_app_slot" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_app_slot_parent_id_idx" ON "_pages_v_blocks_app_slot" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_app_slot_path_idx" ON "_pages_v_blocks_app_slot" USING btree ("_path");`)
}

export async function down({ db, payload: _payload, req: _req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_downloads_items" CASCADE;
  DROP TABLE "pages_blocks_downloads" CASCADE;
  DROP TABLE "pages_blocks_gallery_items" CASCADE;
  DROP TABLE "pages_blocks_gallery" CASCADE;
  DROP TABLE "pages_blocks_logo_grid_items" CASCADE;
  DROP TABLE "pages_blocks_logo_grid" CASCADE;
  DROP TABLE "pages_blocks_embed" CASCADE;
  DROP TABLE "pages_blocks_contact_links" CASCADE;
  DROP TABLE "pages_blocks_contact" CASCADE;
  DROP TABLE "pages_blocks_accordion_items" CASCADE;
  DROP TABLE "pages_blocks_accordion" CASCADE;
  DROP TABLE "pages_blocks_stats_items" CASCADE;
  DROP TABLE "pages_blocks_stats" CASCADE;
  DROP TABLE "pages_blocks_card_grid_cards" CASCADE;
  DROP TABLE "pages_blocks_card_grid" CASCADE;
  DROP TABLE "pages_blocks_app_slot" CASCADE;
  DROP TABLE "_pages_v_blocks_downloads_items" CASCADE;
  DROP TABLE "_pages_v_blocks_downloads" CASCADE;
  DROP TABLE "_pages_v_blocks_gallery_items" CASCADE;
  DROP TABLE "_pages_v_blocks_gallery" CASCADE;
  DROP TABLE "_pages_v_blocks_logo_grid_items" CASCADE;
  DROP TABLE "_pages_v_blocks_logo_grid" CASCADE;
  DROP TABLE "_pages_v_blocks_embed" CASCADE;
  DROP TABLE "_pages_v_blocks_contact_links" CASCADE;
  DROP TABLE "_pages_v_blocks_contact" CASCADE;
  DROP TABLE "_pages_v_blocks_accordion_items" CASCADE;
  DROP TABLE "_pages_v_blocks_accordion" CASCADE;
  DROP TABLE "_pages_v_blocks_stats_items" CASCADE;
  DROP TABLE "_pages_v_blocks_stats" CASCADE;
  DROP TABLE "_pages_v_blocks_card_grid_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_card_grid" CASCADE;
  DROP TABLE "_pages_v_blocks_app_slot" CASCADE;
  DROP TYPE "public"."enum_pages_blocks_gallery_column_count";
  DROP TYPE "public"."enum_pages_blocks_embed_kind";
  DROP TYPE "public"."enum_pages_blocks_embed_aspect_ratio";
  DROP TYPE "public"."enum_pages_blocks_contact_links_link_type";
  DROP TYPE "public"."enum_pages_blocks_contact_links_link_appearance";
  DROP TYPE "public"."enum_pages_blocks_stats_items_tone";
  DROP TYPE "public"."enum_pages_blocks_card_grid_cards_link_type";
  DROP TYPE "public"."enum_pages_blocks_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum_pages_blocks_card_grid_column_count";
  DROP TYPE "public"."enum_pages_blocks_app_slot_slot";
  DROP TYPE "public"."enum__pages_v_blocks_gallery_column_count";
  DROP TYPE "public"."enum__pages_v_blocks_embed_kind";
  DROP TYPE "public"."enum__pages_v_blocks_embed_aspect_ratio";
  DROP TYPE "public"."enum__pages_v_blocks_contact_links_link_type";
  DROP TYPE "public"."enum__pages_v_blocks_contact_links_link_appearance";
  DROP TYPE "public"."enum__pages_v_blocks_stats_items_tone";
  DROP TYPE "public"."enum__pages_v_blocks_card_grid_cards_link_type";
  DROP TYPE "public"."enum__pages_v_blocks_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum__pages_v_blocks_card_grid_column_count";
  DROP TYPE "public"."enum__pages_v_blocks_app_slot_slot";`)
}
