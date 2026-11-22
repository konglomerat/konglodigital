import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN "supabase_id" varchar;
    CREATE UNIQUE INDEX "users_supabase_id_idx" ON "users" USING btree ("supabase_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "users_supabase_id_idx";
    ALTER TABLE "users" DROP COLUMN "supabase_id";
  `)
}
