"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { stripLocalePrefix } from "@/i18n/config";

type AppShellProps = {
  children: ReactNode;
  desktopNavigation: ReactNode;
  mobileNavigation: ReactNode;
};

const FULLSCREEN_PATHNAMES = new Set(["/resources/batch"]);

export default function AppShell({
  children,
  desktopNavigation,
  mobileNavigation,
}: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const normalizedPathname =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";

  if (FULLSCREEN_PATHNAMES.has(normalizedPathname)) {
    return children;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileNavigation}
      {desktopNavigation}
      <div className="ml-0 md:ml-64">
        <main className="mx-auto w-full px-3 py-4 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
