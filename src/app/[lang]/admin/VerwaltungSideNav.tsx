"use client";
// Dunkle Ressort-Leiste: nur Hauptpunkte, die Unterfunktionen stehen als
// Kacheln auf der jeweiligen Ressort-Seite. Unter 768px klappt sie auf und zu.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import Button from "@/components/knglmrt/Button";
import { stripLocalePrefix } from "@/i18n/config";

export type RessortNavItem = {
  href: string;
  label: string;
  /** Unlokalisierte Routen, bei denen dieses Ressort aktiv ist. */
  match: string[];
};

type VerwaltungSideNavProps = {
  items: RessortNavItem[];
  /** Hauptseite des ersten zugaenglichen Ressorts. */
  homeHref: string;
};

export default function VerwaltungSideNav({
  items,
  homeHref,
}: VerwaltungSideNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const current =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";

  // Längster Treffer gewinnt, sonst würde "/admin" auch "/admin/volkshaus" für
  // sich beanspruchen.
  const matchLength = (item: RessortNavItem) =>
    item.match.reduce(
      (longest, route) =>
        current === route || current.startsWith(`${route}/`)
          ? Math.max(longest, route.length)
          : longest,
      0,
    );
  const activeHref = items.reduce<{ href: string | null; length: number }>(
    (best, item) => {
      const length = matchLength(item);
      return length > best.length ? { href: item.href, length } : best;
    },
    { href: null, length: 0 },
  ).href;

  const navigation = (
    <nav aria-label="Ressorts" className="flex flex-col pb-4">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setIsOpen(false)}
            className={
              active
                ? "bg-primary px-5 py-2.5 text-[length:var(--ui-size-nav)] font-bold leading-[18px] text-primary-foreground"
                : "px-5 py-2.5 text-[length:var(--ui-size-nav)] leading-[18px] text-[var(--knglmrt-dark-30)] transition hover:bg-white/10 hover:text-white"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="md:hidden">
        <Button
          kind="quiet"
          fullWidth
          aria-expanded={isOpen}
          aria-controls="verwaltung-ressorts"
          onClick={() => setIsOpen((open) => !open)}
          className="justify-between bg-[var(--knglmrt-dark-100)] px-5 py-3 text-[length:var(--ui-size-nav)] text-white hover:bg-[var(--knglmrt-dark-100)]/90"
        >
          Verwaltung
          <span aria-hidden="true">{isOpen ? "–" : "+"}</span>
        </Button>
        {isOpen ? (
          <div
            id="verwaltung-ressorts"
            className="bg-[var(--knglmrt-dark-100)] pt-1"
          >
            {navigation}
          </div>
        ) : null}
      </div>

      <aside className="hidden bg-[var(--knglmrt-dark-100)] md:block md:h-full md:overflow-y-auto">
        <div>
          <div className="px-5 pb-4 pt-5">
            <Link
              href={homeHref}
              className="font-[family-name:var(--font-display)] text-[20px] leading-tight text-white transition hover:text-[var(--knglmrt-dark-30)]"
            >
              Verwaltung
            </Link>
          </div>
          {navigation}
        </div>
      </aside>
    </>
  );
}
