"use client";

// Aufgabenleiste rechts in der Verwaltung: Projekte als Karten, darin die
// offenen Aufgaben, Erledigte auf Wunsch. Für jedes Board gleich — welches,
// sagt `board` (src/lib/tasks/boards.ts). Einklappen merkt sich der Browser.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Dialog from "@/components/knglmrt/Dialog";
import Field from "@/components/knglmrt/Field";
import { cn } from "@/components/knglmrt/FieldShell";
import { compareOpenTasks, dueText, isOverdue, startOfDay } from "@/lib/tasks/format";
import type { Task, TaskBoardData, TaskProject } from "@/lib/tasks/types";

import TaskComposer, { PRIORITIES, type TaskDraft, useCloseOnOutsideClick } from "./TaskComposer";

// Eingeklappt ist der Normalfall; wer die Leiste aufklappt, behält sie in
// diesem Browser offen ("0"). Der Schlüssel dient zugleich als
// Ereignisname, damit useSyncExternalStore neu liest.
const COLLAPSED_KEY = "knglmrt-aufgaben-eingeklappt";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
};

const writeCollapsed = (value: boolean) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(COLLAPSED_KEY));
};

const subscribeCollapsed = (onChange: () => void) => {
  window.addEventListener(COLLAPSED_KEY, onChange);
  return () => window.removeEventListener(COLLAPSED_KEY, onChange);
};

const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Das hat nicht geklappt.");
  return body as T;
};

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <span
      className={cn(
        "h-[7px] w-[7px] rotate-45 border-black",
        direction === "right"
          ? "-ml-[3px] border-r-2 border-t-2"
          : "ml-[3px] border-b-2 border-l-2",
      )}
    />
  );
}

function TaskRow({
  task,
  today,
  onToggle,
  onRemove,
}: {
  task: Task;
  today: Date;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const done = !!task.doneAt;
  const due = done ? "" : dueText(task, today);
  return (
    <div
      className={cn(
        "flex gap-3",
        done
          ? "items-center py-1.5 text-[#6b727c]"
          : "items-start border-t-[0.5px] border-[#c1c3c9] py-2.5",
      )}
    >
      <Choice
        checked={done}
        onChange={onToggle}
        label={task.title}
        className={cn(
          "min-w-0 flex-1 text-[15px] leading-5",
          done && "[&_span]:text-[#6b727c] [&_span]:line-through",
        )}
      />
      {!done && task.priority ? (
        <span
          title={`Priorität: ${PRIORITIES[task.priority].label}`}
          className="mt-1 h-[9px] w-[9px] flex-none"
          style={{ background: PRIORITIES[task.priority].mark }}
        />
      ) : null}
      {due ? (
        <span
          className={cn(
            "flex-none font-num text-[12px] leading-[18px]",
            isOverdue(task, today) ? "text-[var(--knglmrt-pink-100)]" : "text-[#2e3846]",
          )}
        >
          {due}
        </span>
      ) : null}
      {onRemove ? (
        <Button kind="quiet" size="chip" onClick={onRemove}>
          Entfernen
        </Button>
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  tasks,
  today,
  adding,
  onStartAdding,
  onStopAdding,
  onAdd,
  onToggle,
  onRemove,
  onDelete,
}: {
  project: TaskProject;
  tasks: Task[];
  today: Date;
  adding: boolean;
  onStartAdding: () => void;
  onStopAdding: () => void;
  onAdd: (draft: TaskDraft) => Promise<boolean>;
  onToggle: (task: Task) => void;
  onRemove: (task: Task) => void;
  /** Liefert erst nach dem Löschen zurück; false bei Fehler. */
  onDelete: () => Promise<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((task) => !task.doneAt).sort(compareOpenTasks);
  const done = tasks.filter((task) => task.doneAt);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useCloseOnOutsideClick(menuOpen, "[data-task-menu]", closeMenu);

  return (
    <section className="flex flex-col bg-white">
      <div className="flex items-center justify-between gap-2.5 px-[18px] pb-3 pt-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h3 className="m-0 text-[20px] font-bold leading-6 text-[var(--knglmrt-pink-100)]">
            {project.name}
          </h3>
          <span className="font-num text-[12px] text-[#6b727c]">{open.length} offen</span>
        </div>
        <div data-task-menu className="relative flex-none">
          <button
            type="button"
            aria-label="Mehr"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center gap-[3px] hover:bg-[#e4e4e4]",
              menuOpen && "bg-[#e4e4e4]",
            )}
          >
            <span className="h-[3px] w-[3px] bg-[#2e3846]" />
            <span className="h-[3px] w-[3px] bg-[#2e3846]" />
            <span className="h-[3px] w-[3px] bg-[#2e3846]" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-8 z-[5] flex min-w-[200px] flex-col border border-black bg-white py-1">
              <button
                type="button"
                disabled={done.length === 0}
                onClick={() => {
                  setShowDone((value) => !value);
                  setMenuOpen(false);
                }}
                className={cn(
                  "flex justify-between gap-3 px-3 py-2 text-left text-[13px] leading-[18px] enabled:hover:bg-[#f3f3f3]",
                  done.length ? "text-black" : "cursor-default text-[#828891]",
                )}
              >
                {showDone ? "Erledigte ausblenden" : "Erledigte zeigen"}
                <span className="font-num text-[12px] text-[#6b727c]">{done.length}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setMenuOpen(false);
                }}
                className="border-t-[0.5px] border-[#c1c3c9] px-3 py-2 text-left text-[13px] leading-[18px] text-[var(--knglmrt-pink-100)] hover:bg-[#f3f3f3]"
              >
                Projekt löschen
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col px-[18px]">
        {open.map((task) => (
          <TaskRow key={task.id} task={task} today={today} onToggle={() => onToggle(task)} />
        ))}
        {open.length === 0 ? (
          <p className="m-0 border-t-[0.5px] border-[#c1c3c9] py-2.5 text-[13px] leading-[18px] text-[#6b727c]">
            Keine offenen Aufgaben
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-[18px] pb-3.5 pt-2">
        {adding ? (
          <TaskComposer onSubmit={onAdd} onClose={onStopAdding} />
        ) : (
          <button
            type="button"
            onClick={onStartAdding}
            className="-mx-2 flex h-[30px] items-center gap-2 px-2 text-left text-[13px] text-[#828891] hover:bg-[#f3f3f3] hover:text-[var(--knglmrt-pink-100)]"
          >
            <span className="relative h-[15px] w-[15px] flex-none">
              <span className="absolute left-[7px] top-0.5 h-[11px] w-px bg-current" />
              <span className="absolute left-0.5 top-[7px] h-px w-[11px] bg-current" />
            </span>
            Aufgabe hinzufügen
          </button>
        )}
        {showDone && done.length > 0 ? (
          <div className="flex flex-col">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={today}
                onToggle={() => onToggle(task)}
                onRemove={() => onRemove(task)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <Dialog
        open={confirmDelete}
        title={`„${project.name}“ löschen?`}
        text={
          tasks.length
            ? `Damit verschwinden auch ${tasks.length === 1 ? "die Aufgabe" : `alle ${tasks.length} Aufgaben`} darin, offene wie erledigte.`
            : "Das Projekt hat keine Aufgaben."
        }
        tone="danger"
        width={420}
        onCancel={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        actions={
          <>
            <Button kind="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button
              kind="danger-primary"
              loading={deleting}
              onClick={async () => {
                setDeleting(true);
                const ok = await onDelete();
                setDeleting(false);
                if (ok) setConfirmDelete(false);
              }}
            >
              Löschen
            </Button>
          </>
        }
      />
    </section>
  );
}

export default function TaskRail({ board }: { board: string }) {
  const [data, setData] = useState<TaskBoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Auf dem Server null: bis localStorage gelesen ist, steht keine Leiste da.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [projectDraft, setProjectDraft] = useState("");
  const today = startOfDay(new Date());

  const load = useCallback(
    () =>
      request<TaskBoardData>(`/api/tasks?board=${encodeURIComponent(board)}`).then(
        (next) => {
          setData(next);
          setError(null);
        },
        (loadError: Error) => setError(loadError.message),
      ),
    [board],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCollapsed = () => writeCollapsed(!collapsed);

  const replaceTask = (task: Task) =>
    setData((current) =>
      current
        ? { ...current, tasks: current.tasks.map((entry) => (entry.id === task.id ? task : entry)) }
        : current,
    );

  // Abhaken sofort zeigen, bei Fehler neu laden.
  const toggleTask = async (task: Task) => {
    const done = !task.doneAt;
    replaceTask({ ...task, doneAt: done ? new Date().toISOString() : null });
    try {
      const { task: saved } = await request<{ task: Task }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done }),
      });
      replaceTask(saved);
    } catch (saveError) {
      setError((saveError as Error).message);
      void load();
    }
  };

  const removeTask = async (task: Task) => {
    setData((current) =>
      current ? { ...current, tasks: current.tasks.filter((entry) => entry.id !== task.id) } : current,
    );
    try {
      await request(`/api/tasks/${task.id}`, { method: "DELETE" });
    } catch (removeError) {
      setError((removeError as Error).message);
      void load();
    }
  };

  const addTask = async (projectId: string, draft: TaskDraft) => {
    try {
      const { task } = await request<{ task: Task }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ projectId, ...draft }),
      });
      setData((current) => (current ? { ...current, tasks: [task, ...current.tasks] } : current));
      setError(null);
      return true;
    } catch (addError) {
      setError((addError as Error).message);
      return false;
    }
  };

  const addProject = async () => {
    const name = projectDraft.trim();
    if (!name) return;
    try {
      const { project } = await request<{ project: TaskProject }>("/api/tasks/projects", {
        method: "POST",
        body: JSON.stringify({ board, name }),
      });
      setData((current) =>
        current ? { ...current, projects: [...current.projects, project] } : current,
      );
      setAddingProject(false);
      setProjectDraft("");
      setError(null);
    } catch (addError) {
      setError((addError as Error).message);
    }
  };

  const deleteProject = async (project: TaskProject) => {
    try {
      await request(`/api/tasks/projects/${project.id}`, { method: "DELETE" });
      setData((current) =>
        current
          ? {
              projects: current.projects.filter((entry) => entry.id !== project.id),
              tasks: current.tasks.filter((task) => task.projectId !== project.id),
            }
          : current,
      );
      if (addingIn === project.id) setAddingIn(null);
      setError(null);
      return true;
    } catch (deleteError) {
      setError((deleteError as Error).message);
      return false;
    }
  };

  const openCount = data?.tasks.filter((task) => !task.doneAt).length ?? 0;

  if (collapsed === null) return null;

  if (collapsed) {
    return (
      <aside className="flex-none border-t border-black bg-[var(--knglmrt-paper-pink)] lg:w-[60px] lg:border-l lg:border-t-0">
        <div className="flex items-center gap-3.5 px-4 py-3 lg:sticky lg:top-0 lg:flex-col lg:px-0 lg:py-4">
          <button
            type="button"
            aria-label="Aufgaben ausklappen"
            onClick={toggleCollapsed}
            className="flex h-[30px] w-[30px] items-center justify-center border border-black bg-white hover:bg-[#f3f3f3]"
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="text-[13px] font-bold uppercase tracking-[.13em] text-[#2e3846] lg:rotate-180 lg:[writing-mode:vertical-rl]"
          >
            Aufgaben
          </button>
          <span className="flex h-[22px] min-w-[26px] items-center justify-center bg-[var(--knglmrt-pink-100)] px-[5px] font-num text-[12px] font-bold text-white">
            {openCount}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex-none border-t border-black bg-[var(--knglmrt-paper-pink)] lg:w-[380px] lg:border-l lg:border-t-0 md:min-h-0 md:overflow-y-auto">
      <div className="flex flex-col gap-4 px-5 pb-10 pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="m-0 font-display text-[23px] font-black leading-7 text-[#2e3846]">
              Aufgaben
            </h2>
            <span className="font-num text-[12px] text-[#6b727c]">{openCount} offen</span>
          </div>
          <button
            type="button"
            aria-label="Aufgaben einklappen"
            onClick={toggleCollapsed}
            className="flex h-[30px] w-[30px] items-center justify-center border border-black bg-white hover:bg-[#f3f3f3]"
          >
            <Chevron direction="right" />
          </button>
        </div>

        {error ? (
          <p className="m-0 border border-[var(--knglmrt-pink-100)] bg-white px-3 py-2 text-[13px] text-[var(--knglmrt-pink-100)]">
            {error}
          </p>
        ) : null}

        {addingProject ? (
          <div
            onKeyDown={(event) => {
              if (event.key === "Enter") void addProject();
              if (event.key === "Escape") setAddingProject(false);
            }}
            className="flex flex-wrap items-end gap-2.5 border border-black p-3.5"
          >
            <Field
              autoFocus
              label="Neues Projekt"
              value={projectDraft}
              onChange={(event) => setProjectDraft(event.target.value)}
              className="min-w-[200px] flex-1"
            />
            <Button kind="primary" size="chip" onClick={() => void addProject()}>
              Anlegen
            </Button>
            <Button
              kind="quiet"
              size="chip"
              onClick={() => {
                setAddingProject(false);
                setProjectDraft("");
              }}
            >
              Abbrechen
            </Button>
          </div>
        ) : null}

        {data ? (
          <div className="flex flex-col gap-3.5">
            {data.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                tasks={data.tasks.filter((task) => task.projectId === project.id)}
                today={today}
                adding={addingIn === project.id}
                onStartAdding={() => {
                  setAddingIn(project.id);
                  setAddingProject(false);
                }}
                onStopAdding={() => setAddingIn(null)}
                onAdd={(draft) => addTask(project.id, draft)}
                onToggle={(task) => void toggleTask(task)}
                onRemove={(task) => void removeTask(task)}
                onDelete={() => deleteProject(project)}
              />
            ))}
          </div>
        ) : !error ? (
          <p className="m-0 text-[13px] text-[#6b727c]">Lädt …</p>
        ) : null}

        {data && !addingProject ? (
          <div className="flex">
            <Button
              kind="tertiary"
              size="chip"
              onClick={() => {
                setAddingProject(true);
                setAddingIn(null);
              }}
            >
              + Projekt anlegen
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
