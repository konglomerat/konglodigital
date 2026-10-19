// Aufgabenlisten — Lesen und Schreiben von task_projects und tasks. Nur mit dem
// Service-Role-Client; das Board prüft die API vorher (src/lib/tasks/boards.ts).
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { Task, TaskBoardData, TaskPriority, TaskProject } from "./types";

const mapProject = (row: Record<string, unknown>): TaskProject => ({
  id: String(row.id),
  board: String(row.board),
  name: String(row.name),
  position: Number(row.position ?? 0),
});

const mapTask = (row: Record<string, unknown>): Task => ({
  id: String(row.id),
  projectId: String(row.project_id),
  title: String(row.title),
  dueDate: (row.due_date as string | null) ?? null,
  priority: (row.priority as TaskPriority | null) ?? null,
  doneAt: (row.done_at as string | null) ?? null,
  createdAt: String(row.created_at),
});

const TASK_COLUMNS = "id, project_id, title, due_date, priority, done_at, created_at";

export const listBoard = async (board: string): Promise<TaskBoardData> => {
  // Projekte samt Aufgaben in einer Abfrage.
  const { data, error } = await createSupabaseAdminClient()
    .from("task_projects")
    .select(`id, board, name, position, tasks(${TASK_COLUMNS})`)
    .eq("board", board)
    .order("position")
    .order("created_at")
    .order("created_at", { referencedTable: "tasks", ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (Record<string, unknown> & { tasks: Record<string, unknown>[] })[];
  return {
    projects: rows.map(mapProject),
    tasks: rows.flatMap((row) => row.tasks.map(mapTask)),
  };
};

export const getProject = async (id: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("task_projects")
    .select("id, board, name, position")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProject(data) : null;
};

/** Das Board einer Aufgabe — für die Rechteprüfung vor Änderungen. */
export const getTaskBoard = async (taskId: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("tasks")
    .select("task_projects(board)")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  const project = (data as { task_projects?: { board?: string } | null } | null)
    ?.task_projects;
  return project?.board ?? null;
};

// Neue Projekte haben position 0 und stehen per created_at hinter den alten.
export const createProject = async (board: string, name: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("task_projects")
    .insert({ board, name })
    .select("id, board, name, position")
    .single();
  if (error) throw error;
  return mapProject(data);
};

export const createTask = async (input: {
  projectId: string;
  title: string;
  dueDate: string | null;
  priority: TaskPriority | null;
  createdBy: string;
}) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title: input.title,
      due_date: input.dueDate,
      priority: input.priority,
      created_by: input.createdBy,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return mapTask(data);
};

export const setTaskDone = async (id: string, done: boolean, actor: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from("tasks")
    .update({
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? actor : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return mapTask(data);
};

export const deleteTask = async (id: string) => {
  const { error } = await createSupabaseAdminClient().from("tasks").delete().eq("id", id);
  if (error) throw error;
};

/** Löscht das Projekt samt seiner Aufgaben (on delete cascade). */
export const deleteProject = async (id: string) => {
  const { error } = await createSupabaseAdminClient().from("task_projects").delete().eq("id", id);
  if (error) throw error;
};
