import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listCampaiRentalStates,
  type ResourceRentalState,
} from "@/lib/campai-resource-rentals";

const MAX_IDS = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ausleihstatus für die Inventar-Tabelle. Öffentlich wie die Detailseite:
// nur frei/vergeben und bis wann, keine Namen.
export const POST = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const ids = Array.from(
    new Set(
      (Array.isArray(body?.ids) ? body.ids : []).filter(
        (id): id is string => typeof id === "string" && UUID_PATTERN.test(id),
      ),
    ),
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ states: {} });
  }

  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("resources")
    .select("id, campai_resource_id")
    .in("id", ids);
  if (error) {
    return NextResponse.json(
      { error: error.message || "Unable to load resources." },
      { status: 500 },
    );
  }

  const campaiIdByLocalId = new Map(
    (rows ?? []).map((row) => [
      row.id as string,
      (row.campai_resource_id as string | null) ?? null,
    ]),
  );

  try {
    const campaiStates = await listCampaiRentalStates(
      Array.from(campaiIdByLocalId.values()).filter(
        (id): id is string => Boolean(id),
      ),
    );
    const states: Record<string, ResourceRentalState> = {};
    for (const id of ids) {
      const campaiId = campaiIdByLocalId.get(id);
      states[id] = (campaiId && campaiStates.get(campaiId)) || {
        state: "none",
      };
    }
    return NextResponse.json({ states });
  } catch (campaiError) {
    return NextResponse.json(
      {
        error:
          campaiError instanceof Error
            ? campaiError.message
            : "Unable to load rental status.",
      },
      { status: 502 },
    );
  }
};
