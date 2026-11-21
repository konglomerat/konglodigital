"use client";

// Wählt das Skelett nach dem Ziel: in der Verwaltung mit Leiste, sonst das
// allgemeine.
import { usePathname } from "next/navigation";

import { stripLocalePrefix } from "@/i18n/config";

import { PageSkeleton } from "./PageSkeleton";
import { VERWALTUNG_ROUTES, VerwaltungSkeleton } from "./VerwaltungSkeleton";

export function RouteSkeleton() {
  const path = stripLocalePrefix(usePathname() ?? "/").pathname;
  const inVerwaltung = VERWALTUNG_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
  return inVerwaltung ? <VerwaltungSkeleton /> : <PageSkeleton />;
}
