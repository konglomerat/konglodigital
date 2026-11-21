import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteProject, getProject } from "@/lib/tasks/store";

import { authorizeBoard, errorResponse } from "../../auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const project = await getProject(id);
    const auth = await authorizeBoard(request, project?.board);
    if ("response" in auth) return auth.response;
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Projekt konnte nicht gelöscht werden.");
  }
}
