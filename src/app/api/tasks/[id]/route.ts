import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { deleteTask, getTaskBoard, setTaskDone } from "@/lib/tasks/store";

import { authorizeBoard, errorResponse } from "../auth";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const authorizeTask = async (request: NextRequest, id: string) =>
  authorizeBoard(request, await getTaskBoard(id));

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const auth = await authorizeTask(request, id);
    if ("response" in auth) return auth.response;
    const body = (await request.json().catch(() => ({}))) as { done?: unknown };
    if (typeof body.done !== "boolean") {
      return NextResponse.json({ error: "done fehlt." }, { status: 400 });
    }
    return NextResponse.json({ task: await setTaskDone(id, body.done, auth.userId) });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht gespeichert werden.");
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const auth = await authorizeTask(request, id);
    if ("response" in auth) return auth.response;
    await deleteTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht entfernt werden.");
  }
}
