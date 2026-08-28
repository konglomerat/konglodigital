"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { stripLocalePrefix } from "@/i18n/config";

type AppShellProps = {
  children: ReactNode;
  desktopNavigation: ReactNode;
  mobileNavigation: ReactNode;
  footer: ReactNode;
};

const FULLSCREEN_PATHNAMES = new Set(["/resources/batch"]);

// Der Verwaltungsbereich bringt seine eigene Randbreite mit, damit die dunkle
// Ressort-Leiste bis an den Bildschirmrand reicht.
const FULL_BLEED_PREFIXES = ["/admin", "/receipts", "/kofi"];

export default function AppShell({
  children,
  desktopNavigation,
  mobileNavigation,
  footer,
}: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const normalizedPathname =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";

  if (FULLSCREEN_PATHNAMES.has(normalizedPathname)) {
    return children;
  }

  const isFullBleed = FULL_BLEED_PREFIXES.some(
    (prefix) =>
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`),
  );

  // Verwaltung: kein Footer, und gescrollt wird nur im Inhaltsbereich.
  if (isFullBleed) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {mobileNavigation}
        {desktopNavigation}
        <main className="w-full min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  const isHome = normalizedPathname === "/";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {mobileNavigation}
      {desktopNavigation}
      <main
        className={`mx-auto w-full max-w-[1600px] flex-1 px-3 md:px-7 ${
          isHome
            ? "flex flex-col gap-8 pt-4 md:gap-10 md:pt-10"
            : "py-4 md:py-10"
        }`}
      >
        {children}
      </main>
      {footer}
    </div>
  );
}
