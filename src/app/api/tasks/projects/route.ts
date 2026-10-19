import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createProject } from "@/lib/tasks/store";

import { authorizeBoard, errorResponse } from "../auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const board = typeof body?.board === "string" ? body.board : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const auth = await authorizeBoard(request, board);
  if ("response" in auth) return auth.response;
  if (!name) {
    return NextResponse.json({ error: "Name fehlt." }, { status: 400 });
  }
  try {
    return NextResponse.json({ project: await createProject(board!, name) });
  } catch (error) {
    // 23505: Projekt mit dem Namen gibt es in diesem Board schon.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Das Projekt gibt es schon." }, { status: 409 });
    }
    return errorResponse(error, "Projekt konnte nicht angelegt werden.");
  }
}
