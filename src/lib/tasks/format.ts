// Datumslogik der Aufgabenleiste — rein, damit Tests sie ohne DOM prüfen.
// Fälligkeiten sind Kalendertage (YYYY-MM-DD) ohne Uhrzeit, gerechnet in
// lokaler Zeit.
import type { Task } from "./types";

export const WEEKDAYS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const pad = (value: number) => String(value).padStart(2, "0");

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseIsoDate = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
};

/** „31.10.“ — das Jahr nur, wenn es nicht das laufende ist. */
export const shortDate = (date: Date, today: Date) =>
  `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${
    date.getFullYear() !== today.getFullYear() ? date.getFullYear() : ""
  }`;

/** Nächster Montag, nie heute. */
export const nextMonday = (today: Date) => addDays(today, (8 - today.getDay()) % 7 || 7);

/** Beschriftung des Datums-Chips: Heute, Morgen, Wochentag, sonst Datum. */
export const relativeLabel = (date: Date, today: Date) => {
  const diff = Math.round((startOfDay(date).getTime() - today.getTime()) / 864e5);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff > 1 && diff < 7) return WEEKDAYS[date.getDay()];
  return shortDate(date, today);
};

export const isOverdue = (task: Pick<Task, "dueDate" | "doneAt">, today: Date) => {
  const due = parseIsoDate(task.dueDate);
  return !task.doneAt && !!due && due < today;
};

/** „bis 31.10.“ bzw. „überfällig 14.10.“ — leer ohne Datum. */
export const dueText = (task: Pick<Task, "dueDate" | "doneAt">, today: Date) => {
  const due = parseIsoDate(task.dueDate);
  if (!due) return "";
  return `${isOverdue(task, today) ? "überfällig" : "bis"} ${shortDate(due, today)}`;
};

/** Offene Aufgaben: erst nach Priorität (ohne zuletzt), dann nach Fälligkeit. */
export const compareOpenTasks = (a: Task, b: Task) =>
  (a.priority ?? 9) - (b.priority ?? 9) ||
  (parseIsoDate(a.dueDate)?.getTime() ?? Infinity) -
    (parseIsoDate(b.dueDate)?.getTime() ?? Infinity) ||
  a.createdAt.localeCompare(b.createdAt);

/** Tage eines Monats für ein Raster ab Montag; null füllt die Lücke davor. */
export const monthCells = (year: number, month: number) => {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(year, month, index + 1)),
  ];
};
