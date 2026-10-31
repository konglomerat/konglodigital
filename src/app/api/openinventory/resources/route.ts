import type { NextRequest } from "next/server";
import { hasInventoryViewer } from "@/lib/openinventory-viewer";
import { listInventory } from "@/lib/openinventory";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (!await hasInventoryViewer(request)) return Response.json({ error: "Bitte bei Konglodigital anmelden." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? 100);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1500) return Response.json({ error: "Invalid pagination." }, { status: 400 });
  try {
    return Response.json(await listInventory({ offset, limit, query: (params.get("searchTerm") ?? params.get("q") ?? "").slice(0, 500), type: params.get("type") ?? "" }), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Das Inventar ist momentan nicht erreichbar." }, { status: 502 }); }
}
