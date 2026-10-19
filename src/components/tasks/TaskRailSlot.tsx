"use client";

// Entscheidet in der Verwaltung, ob und welche Aufgabenleiste neben dem Inhalt
// steht. Ein weiterer Bereich bekommt seine Leiste mit einem Eintrag hier
// (und einem Board in src/lib/tasks/boards.ts).
import { usePathname } from "next/navigation";

import { stripLocalePrefix } from "@/i18n/config";

import TaskRail from "./TaskRail";

const TASK_RAIL_ROUTES: Record<string, string> = {
  "/admin/vorstand": "vorstand",
  "/receipts": "buchhaltung",
};

export default function TaskRailSlot({ boards }: { boards: string[] }) {
  const pathname = usePathname() ?? "/";
  const current = stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";
  const board = TASK_RAIL_ROUTES[current];
  if (!board || !boards.includes(board)) return null;
  return <TaskRail key={board} board={board} />;
}
