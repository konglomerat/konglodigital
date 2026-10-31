import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// A gallery can request dozens of protected files concurrently. Coalesce auth
// checks per session instead of sending every image request to GoTrue. Only
// successful checks live for 15 seconds; cookies are hashed, never stored/logged.
const checks = new Map<string, { expiresAt: number; result: Promise<boolean> }>();
const MAX_SESSIONS = 256;
export async function hasInventoryViewer(request: NextRequest) {
  const cookies = request.cookies.getAll();
  if (!cookies.some(cookie => cookie.name.startsWith("sb-"))) return false;
  const key = createHash("sha256").update(JSON.stringify(cookies.sort((a, b) => a.name.localeCompare(b.name)))).digest("hex");
  const cached = checks.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  if (checks.size >= MAX_SESSIONS) checks.delete(checks.keys().next().value!);
  const { supabase } = createSupabaseRouteClient(request);
  const entry = {
    expiresAt: Infinity,
    result: supabase.auth.getUser().then(({ data, error }) => !error && Boolean(data.user)),
  };
  checks.set(key, entry);
  try {
    const valid = await entry.result;
    if (valid) entry.expiresAt = Date.now() + 15000;
    else if (checks.get(key) === entry) checks.delete(key);
    return valid;
  } catch (error) {
    if (checks.get(key) === entry) checks.delete(key);
    throw error;
  }
}
