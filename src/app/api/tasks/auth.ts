import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRouteAccess } from "@/lib/access/server";
import { canAccessBoard } from "@/lib/tasks/boards";

export { errorResponse } from "@/app/api/admin/applications/auth";

/**
 * Darf der angemeldete Nutzer dieses Board bearbeiten? Liefert seine ID —
 * oder die Fehlerantwort. Ein unbekanntes Board ist wie fehlender Zugriff.
 */
export const authorizeBoard = async (
  request: NextRequest,
  board: string | null | undefined,
): Promise<{ userId: string } | { response: NextResponse }> => {
  const { user, access } = await getRouteAccess(request);
  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!board || !canAccessBoard(access, board)) {
    return { response: NextResponse.json({ error: "Kein Zugriff" }, { status: 403 }) };
  }
  return { userId: user.id };
};
