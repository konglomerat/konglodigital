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

  return (
    // Spalte mit mt-auto am Footer: kurze Seiten schieben ihn trotzdem
    // an den unteren Rand.
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {mobileNavigation}
      {desktopNavigation}
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-3 py-4 md:px-7 md:py-10">
        {children}
      </main>
      {footer}
    </div>
  );
}
