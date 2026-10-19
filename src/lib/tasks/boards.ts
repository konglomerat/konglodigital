// Welche Aufgabenlisten es gibt und wer sie sehen darf. Eine neue Liste für
// einen Bereich ist ein Eintrag hier — Tabelle, API und Leiste bleiben gleich.
// Bereiche mit Geltungsbereich bekämen z. B. `scope:<id>` mit
// can(access, "tasks.manage", { scope: id }).
import { type UserAccess, can } from "@/lib/access/access";

type AccessCheck = (access: UserAccess | null | undefined) => boolean;

export const TASK_BOARDS: Record<string, AccessCheck> = {
  vorstand: (access) => can(access, "tasks.manage"),
  // Eine Liste für die ganze Buchhaltung — daher nur mit globalem Recht, nicht
  // für Personen, die nur einzelne Werkbereiche buchen.
  buchhaltung: (access) => can(access, "receipts.edit"),
};

export const canAccessBoard = (
  access: UserAccess | null | undefined,
  board: string,
) => TASK_BOARDS[board]?.(access) ?? false;

/** Die Boards, die der Nutzer sehen darf — für die Verwaltungsleiste. */
export const accessibleBoards = (access: UserAccess | null | undefined) =>
  Object.keys(TASK_BOARDS).filter((board) => canAccessBoard(access, board));
