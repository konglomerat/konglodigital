import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AutomationError } from "./auth";
import { AUTOMATION_BUCKET } from "./types";

export async function savePrintTemplate(bytes: Buffer, template: {
  printer_id: string; name: string; file_name: string; model: string; plate: number;
  sha256: string; use_ams: boolean; ams_mapping: number[]; created_by: string;
}) {
  const id = randomUUID();
  const storagePath = `templates/${id}.gcode.3mf`;
  const db = createSupabaseAdminClient();
  const { data: bucket, error: bucketError } = await db.storage.getBucket(AUTOMATION_BUCKET);
  if (bucketError || !bucket || bucket.public) throw new AutomationError("Der private Speicher für Druckvorlagen ist nicht eingerichtet.", 503);
  const uploaded = await db.storage.from(AUTOMATION_BUCKET).upload(storagePath, bytes, { contentType: "application/octet-stream", upsert: false });
  if (uploaded.error) throw uploaded.error;
  const { error } = await db.from("printer_automation_templates").insert({ id, storage_path: storagePath, ...template });
  if (error) { await db.storage.from(AUTOMATION_BUCKET).remove([storagePath]); throw error; }
  return id;
}
