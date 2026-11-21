import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_werkbereich" AS ENUM('darkroom', 'printshop', 'neuweltbib', 'buchdruck', 'holz', 'metall', 'laser', '3d-druck', 'elektronik', 'siebdruck', 'beton', 'kunststoffschmiede', 'materialvermittlung', 'cnc', 'textil', 'riso');
  CREATE TYPE "public"."enum__pages_v_version_werkbereich" AS ENUM('darkroom', 'printshop', 'neuweltbib', 'buchdruck', 'holz', 'metall', 'laser', '3d-druck', 'elektronik', 'siebdruck', 'beton', 'kunststoffschmiede', 'materialvermittlung', 'cnc', 'textil', 'riso');
  CREATE TABLE "pages_blocks_workshop_info" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Auf einen Blick',
    "location" varchar,
    "access" varchar,
    "hours" varchar,
    "costs" varchar,
    "block_name" varchar
  );

  CREATE TABLE "pages_blocks_equipment_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar,
    "description" varchar,
    "requirement" varchar
  );

  CREATE TABLE "pages_blocks_equipment" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Ausstattung',
    "description" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_pages_v_blocks_workshop_info" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Auf einen Blick',
    "location" varchar,
    "access" varchar,
    "hours" varchar,
    "costs" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_pages_v_blocks_equipment_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "description" varchar,
    "requirement" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_pages_v_blocks_equipment" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Ausstattung',
    "description" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  DROP INDEX "pages_slug_idx";
  ALTER TABLE "pages" ADD COLUMN "werkbereich" "enum_pages_werkbereich";
  ALTER TABLE "_pages_v" ADD COLUMN "version_werkbereich" "enum__pages_v_version_werkbereich";
  ALTER TABLE "pages_blocks_workshop_info" ADD CONSTRAINT "pages_blocks_workshop_info_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_equipment_items" ADD CONSTRAINT "pages_blocks_equipment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_equipment"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_equipment" ADD CONSTRAINT "pages_blocks_equipment_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_workshop_info" ADD CONSTRAINT "_pages_v_blocks_workshop_info_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_equipment_items" ADD CONSTRAINT "_pages_v_blocks_equipment_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_equipment"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_equipment" ADD CONSTRAINT "_pages_v_blocks_equipment_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_workshop_info_order_idx" ON "pages_blocks_workshop_info" USING btree ("_order");
  CREATE INDEX "pages_blocks_workshop_info_parent_id_idx" ON "pages_blocks_workshop_info" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_workshop_info_path_idx" ON "pages_blocks_workshop_info" USING btree ("_path");
  CREATE INDEX "pages_blocks_equipment_items_order_idx" ON "pages_blocks_equipment_items" USING btree ("_order");
  CREATE INDEX "pages_blocks_equipment_items_parent_id_idx" ON "pages_blocks_equipment_items" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_equipment_order_idx" ON "pages_blocks_equipment" USING btree ("_order");
  CREATE INDEX "pages_blocks_equipment_parent_id_idx" ON "pages_blocks_equipment" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_equipment_path_idx" ON "pages_blocks_equipment" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_workshop_info_order_idx" ON "_pages_v_blocks_workshop_info" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_workshop_info_parent_id_idx" ON "_pages_v_blocks_workshop_info" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_workshop_info_path_idx" ON "_pages_v_blocks_workshop_info" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_equipment_items_order_idx" ON "_pages_v_blocks_equipment_items" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_equipment_items_parent_id_idx" ON "_pages_v_blocks_equipment_items" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_equipment_order_idx" ON "_pages_v_blocks_equipment" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_equipment_parent_id_idx" ON "_pages_v_blocks_equipment" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_equipment_path_idx" ON "_pages_v_blocks_equipment" USING btree ("_path");
  UPDATE "pages" SET "slug" = 'werkbereich-' || regexp_replace("slug", '^(werkbereiche?-)+', '')
    WHERE "slug" ~ '^werkbereiche?-' OR "slug" = ANY(enum_range(NULL::enum_pages_werkbereich)::text[]);
  UPDATE "pages" SET "werkbereich" = regexp_replace("slug", '^werkbereich-', '')::enum_pages_werkbereich
    WHERE regexp_replace("slug", '^werkbereich-', '') = ANY(enum_range(NULL::enum_pages_werkbereich)::text[]);
  UPDATE "_pages_v" SET "version_slug" = 'werkbereich-' || regexp_replace("version_slug", '^(werkbereiche?-)+', '')
    WHERE "version_slug" ~ '^werkbereiche?-' OR "version_slug" = ANY(enum_range(NULL::enum_pages_werkbereich)::text[]);
  UPDATE "_pages_v" SET "version_werkbereich" = regexp_replace("version_slug", '^werkbereich-', '')::enum__pages_v_version_werkbereich
    WHERE regexp_replace("version_slug", '^werkbereich-', '') = ANY(enum_range(NULL::enum_pages_werkbereich)::text[]);
  CREATE UNIQUE INDEX "pages_werkbereich_idx" ON "pages" USING btree ("werkbereich");
  CREATE INDEX "_pages_v_version_version_werkbereich_idx" ON "_pages_v" USING btree ("version_werkbereich");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_workshop_info" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_equipment_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_equipment" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_workshop_info" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_equipment_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_equipment" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_workshop_info" CASCADE;
  DROP TABLE "pages_blocks_equipment_items" CASCADE;
  DROP TABLE "pages_blocks_equipment" CASCADE;
  DROP TABLE "_pages_v_blocks_workshop_info" CASCADE;
  DROP TABLE "_pages_v_blocks_equipment_items" CASCADE;
  DROP TABLE "_pages_v_blocks_equipment" CASCADE;
  DROP INDEX "pages_werkbereich_idx";
  DROP INDEX "_pages_v_version_version_werkbereich_idx";
  DROP INDEX "pages_slug_idx";
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  ALTER TABLE "pages" DROP COLUMN "werkbereich";
  ALTER TABLE "_pages_v" DROP COLUMN "version_werkbereich";
  DROP TYPE "public"."enum_pages_werkbereich";
  DROP TYPE "public"."enum__pages_v_version_werkbereich";`)
}
