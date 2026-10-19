import { describe, expect, it } from "vitest";

import {
  compareOpenTasks,
  dueText,
  monthCells,
  nextMonday,
  relativeLabel,
} from "./format";
import type { Task } from "./types";

// Montag, 19.10.2026.
const today = new Date(2026, 9, 19);

const task = (overrides: Partial<Task>): Task => ({
  id: "t",
  projectId: "p",
  title: "x",
  dueDate: null,
  priority: null,
  doneAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...overrides,
});

describe("Aufgaben-Datumslogik", () => {
  it("beschriftet relative Tage", () => {
    expect(relativeLabel(today, today)).toBe("Heute");
    expect(relativeLabel(new Date(2026, 9, 20), today)).toBe("Morgen");
    expect(relativeLabel(new Date(2026, 9, 23), today)).toBe("Freitag");
    expect(relativeLabel(new Date(2026, 10, 5), today)).toBe("05.11.");
    expect(relativeLabel(new Date(2027, 0, 5), today)).toBe("05.01.2027");
  });

  it("nächster Montag ist nie heute", () => {
    expect(nextMonday(today)).toEqual(new Date(2026, 9, 26));
    expect(nextMonday(new Date(2026, 9, 25))).toEqual(new Date(2026, 9, 26));
  });

  it("markiert Überfälliges, aber nicht Erledigtes", () => {
    expect(dueText(task({ dueDate: "2026-10-14" }), today)).toBe("überfällig 14.10.");
    expect(dueText(task({ dueDate: "2026-10-19" }), today)).toBe("bis 19.10.");
    expect(dueText(task({ dueDate: "2026-10-14", doneAt: "x" }), today)).toBe("bis 14.10.");
    expect(dueText(task({}), today)).toBe("");
  });

  it("sortiert nach Priorität, dann Fälligkeit", () => {
    const list = [
      task({ id: "ohne" }),
      task({ id: "spät", dueDate: "2026-12-01" }),
      task({ id: "früh", dueDate: "2026-10-20" }),
      task({ id: "hoch", priority: 1 }),
    ].sort(compareOpenTasks);
    expect(list.map((entry) => entry.id)).toEqual(["hoch", "früh", "spät", "ohne"]);
  });

  it("legt den Monat ab Montag aus", () => {
    // 1.10.2026 ist ein Donnerstag: drei Lücken davor.
    const cells = monthCells(2026, 9);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]).toEqual(new Date(2026, 9, 1));
    expect(cells).toHaveLength(34);
  });
});
