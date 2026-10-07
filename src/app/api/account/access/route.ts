// Die Zuweisungen des angemeldeten Nutzers (mit Rechte-Vorschau), damit
// statisch erzeugte Seiten Knöpfe passend ein- und ausblenden können.
// Durchgesetzt wird das in den jeweiligen Routen.
import { NextResponse, type NextRequest } from "next/server";

import type { UserAccess } from "@/lib/access/access";
import { getRouteAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export type AccountAccessResponse = { access: UserAccess | null };

export const GET = async (request: NextRequest) => {
  const { access } = await getRouteAccess(request);
  return NextResponse.json({ access } satisfies AccountAccessResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
