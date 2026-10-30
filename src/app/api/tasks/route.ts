import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { withOnboardingTasks } from "@/lib/tasks/onboarding";
import { createTask, getProject, listBoard } from "@/lib/tasks/store";

import { authorizeBoard, errorResponse } from "./auth";

export const runtime = "nodejs";

const readDueDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const readPriority = (value: unknown) => (value === 1 || value === 2 || value === 3 ? value : null);

export async function GET(request: NextRequest) {
  const board = request.nextUrl.searchParams.get("board");
  const auth = await authorizeBoard(request, board);
  if ("response" in auth) return auth.response;
  try {
    // Offene Onboarding-Schritte stehen unter „Mitgliederverwaltung“ mit dabei;
    // fallen die Anträge aus, bleibt die Liste ohne sie.
    const data = await listBoard(board!);
    return NextResponse.json(
      await withOnboardingTasks(board!, data, auth.access).catch(() => data),
    );
  } catch (error) {
    return errorResponse(error, "Aufgaben konnten nicht geladen werden.");
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!title || !projectId) {
    return NextResponse.json({ error: "Titel und Projekt fehlen." }, { status: 400 });
  }
  try {
    const project = await getProject(projectId);
    const auth = await authorizeBoard(request, project?.board);
    if ("response" in auth) return auth.response;
    const task = await createTask({
      projectId,
      title,
      dueDate: readDueDate(body?.dueDate),
      priority: readPriority(body?.priority),
      createdBy: auth.userId,
    });
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error, "Aufgabe konnte nicht angelegt werden.");
  }
}
