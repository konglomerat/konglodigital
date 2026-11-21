import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getRouteAccess } from "@/lib/access/server";
import { can } from "@/lib/access/access";
import { getPayloadCmsBaseUrl } from "@/lib/payload-cms";
import { withSupabaseCookies } from "@/lib/supabase/route";

async function proxy(request: NextRequest, params: Promise<{ id: string }>) {
  if (
    request.method === "PATCH" &&
    (request.headers.get("origin") !== request.nextUrl.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  ) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 403 });
  }
  const { user, access, supabase, response } = await getRouteAccess(request);
  const reply = (data: unknown, status: number) =>
    withSupabaseCookies(
      NextResponse.json(data, {
        status,
        headers: { "Cache-Control": "no-store" },
      }),
      response,
    );
  if (!user) return reply({ error: "Bitte anmelden." }, 401);
  if (!can(access, "backend.login"))
    return reply({ error: "Du darfst diese Seite nicht bearbeiten." }, 403);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return reply({ error: "Ungültige Seite." }, 400);
  const base = getPayloadCmsBaseUrl();
  if (!base) return reply({ error: "Das CMS ist nicht eingerichtet." }, 503);
  const { data } = await supabase.auth.getSession();
  if (!data.session) return reply({ error: "Bitte erneut anmelden." }, 401);
  try {
    const body = request.method === "PATCH" ? await request.text() : undefined;
    if (body && Buffer.byteLength(body) > 2_000_000)
      return reply({ error: "Die Änderung ist zu groß." }, 413);
    const result = await fetch(new URL(`/api/inline-pages/${id}`, base), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    const value = await result.json();
    if (result.ok && request.method === "PATCH")
      revalidateTag("payload-cms", { expire: 0 });
    return reply(value, result.status);
  } catch {
    return reply(
      {
        error:
          "Das CMS ist gerade nicht erreichbar. Deine Änderungen bleiben im Editor.",
      },
      502,
    );
  }
}

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxy(request, params);
}
export function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxy(request, params);
}
