import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_pages_blocks_gallery_items_width" AS ENUM('auto', 'full', 'half', 'third');
    ALTER TABLE "pages_blocks_gallery_items" ADD COLUMN "width" "enum_pages_blocks_gallery_items_width" DEFAULT 'auto';
    ALTER TABLE "pages_blocks_gallery_items" ADD COLUMN "poster_id" integer;
    ALTER TABLE "pages_blocks_gallery_items" ADD CONSTRAINT "pages_blocks_gallery_items_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "pages_blocks_gallery_items_poster_idx" ON "pages_blocks_gallery_items" USING btree ("poster_id");
    CREATE TYPE "public"."enum__pages_v_blocks_gallery_items_width" AS ENUM('auto', 'full', 'half', 'third');
    ALTER TABLE "_pages_v_blocks_gallery_items" ADD COLUMN "width" "enum__pages_v_blocks_gallery_items_width" DEFAULT 'auto';
    ALTER TABLE "_pages_v_blocks_gallery_items" ADD COLUMN "poster_id" integer;
    ALTER TABLE "_pages_v_blocks_gallery_items" ADD CONSTRAINT "_pages_v_blocks_gallery_items_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "_pages_v_blocks_gallery_items_poster_idx" ON "_pages_v_blocks_gallery_items" USING btree ("poster_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "pages_blocks_gallery_items" DROP COLUMN "poster_id";
    ALTER TABLE "pages_blocks_gallery_items" DROP COLUMN "width";
    DROP TYPE "public"."enum_pages_blocks_gallery_items_width";
    ALTER TABLE "_pages_v_blocks_gallery_items" DROP COLUMN "poster_id";
    ALTER TABLE "_pages_v_blocks_gallery_items" DROP COLUMN "width";
    DROP TYPE "public"."enum__pages_v_blocks_gallery_items_width";
  `)
}
