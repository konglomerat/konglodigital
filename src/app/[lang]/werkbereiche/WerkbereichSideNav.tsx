"use client";
// src/app/[lang]/werkbereiche/WerkbereichSideNav.tsx — alle Bereiche immer sichtbar,
// aktiver Eintrag: 2px-Pink-Kante + paper-pink (SideNav-Muster des DS).
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { stripLocalePrefix } from "@/i18n/config";
import { VEREINSPROJEKTE, WERKBEREICHE } from "@/lib/werkbereiche";

export default function WerkbereichSideNav({
  className,
  children,
}: {
  /** Zusatzklassen für die Spalte, z. B. die Trennkante der Detailseite. */
  className?: string;
  /** Fuß der Spalte — Linie, Hinweistext. */
  children?: ReactNode;
} = {}) {
  const pathname = usePathname() ?? "/";
  const current = stripLocalePrefix(pathname).pathname.replace(/\/+$/, "");
  const asideClassName = ["sticky top-24 hidden flex-col gap-4 md:flex", className]
    .filter(Boolean)
    .join(" ");
  return (
    <aside
      className={asideClassName}
    >
      <div>
        <div className="knglmrt-caption px-3.5 pb-2 text-muted-foreground">
          Werkbereiche
        </div>
        <nav className="flex flex-col">
          {WERKBEREICHE.map((werkbereich) => {
            const href = `/werkbereiche/${werkbereich.slug}`;
            const active = current === href;
            return (
              <Link
                key={werkbereich.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "border-l-2 border-primary bg-primary-soft px-3.5 py-1.5 text-[length:var(--ui-size-nav)] font-bold leading-[18px] text-foreground"
                    : "border-l-2 border-transparent px-3.5 py-1.5 text-[length:var(--ui-size-nav)] leading-[18px] text-foreground transition hover:bg-primary-soft"
                }
              >
                {werkbereich.shortLabel ?? werkbereich.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>
        <div className="knglmrt-caption px-3.5 pb-2 text-muted-foreground">
          Projekte
        </div>
        <nav className="flex flex-col">
          {VEREINSPROJEKTE.map((projekt) => {
            const href = `/werkbereiche/${projekt.slug}`;
            const active = current === href;
            return (
              <Link
                key={projekt.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "border-l-2 border-primary bg-primary-soft px-3.5 py-1.5 text-[length:var(--ui-size-nav)] font-bold leading-[18px] text-foreground"
                    : "border-l-2 border-transparent px-3.5 py-1.5 text-[length:var(--ui-size-nav)] leading-[18px] text-foreground transition hover:bg-primary-soft"
                }
              >
                {projekt.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </aside>
  );
}
