import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseRouteClient, withSupabaseCookies } from "@/lib/supabase/route";

export class AutomationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function adminAutomationRequest(request: NextRequest, action: (userId: string) => Promise<NextResponse>) {
  let cookies: NextResponse | undefined;
  try {
    const { supabase, response } = createSupabaseRouteClient(request);
    cookies = response;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new AutomationError("Bitte anmelden.", 401);
    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      throw new AutomationError("Diese Funktion ist nur für Admins freigegeben.", 403);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        throw new AutomationError("Ungültige Anfrageherkunft.", 403);
      }
    }
    const result = await action(data.user.id);
    result.headers.set("Cache-Control", "private, no-store");
    return withSupabaseCookies(result, response);
  } catch (error) {
    const result = NextResponse.json({ error: error instanceof AutomationError
      ? error.message : "Druckautomatik nicht verfügbar. Einrichtung und Serverprotokoll prüfen." },
    { status: error instanceof AutomationError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
    // Never include upstream responses, stream URLs or credentials in client errors.
    if (!(error instanceof AutomationError)) console.error("Printer automation request failed", error instanceof Error ? error.name : "database error");
    return cookies ? withSupabaseCookies(result, cookies) : result;
  }
}

export function validWorkerSecret(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
