import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRouteAccess, unauthorizedResponse } from "@/lib/access/server";
import {
  SYSTEM_RECEIPT_TAGS,
  listCampaiReceiptTags,
} from "@/lib/campai-receipts/tags";

// Die Beleg-Tags aus Campai als Vorschläge für die Formulare. Jedes
// angemeldete Mitglied darf sie sehen — auch die Rückerstattung bietet sie an.
export const GET = async (request: NextRequest) => {
  const { user } = await getRouteAccess(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const tags = (await listCampaiReceiptTags()).filter(
      (entry) => !SYSTEM_RECEIPT_TAGS.has(entry.tag),
    );
    return NextResponse.json(
      { tags },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tags konnten nicht geladen werden.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
};
