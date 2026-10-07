"use client";
// Dunkle Ressort-Leiste: Hauptpunkte mit ausklappbaren Unterpunkten. Das
// aktive Ressort steht offen, die übrigen klappt der Pfeil daneben auf.
// Unter 1024px (Telefon und Tablet) liegt sie als Schublade über dem Inhalt.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faChevronDown,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import { stripLocalePrefix } from "@/i18n/config";

import AccessPreviewSwitch, {
  type AccessPreviewState,
} from "./AccessPreviewSwitch";

export type RessortNavChild = {
  href: string;
  label: string;
  /** Unlokalisierte Route, unter der dieser Unterpunkt aktiv ist. */
  match: string;
};

export type RessortNavItem = {
  href: string;
  label: string;
  /** Unlokalisierte Routen, bei denen dieses Ressort aktiv ist. */
  match: string[];
  children?: RessortNavChild[];
};

type VerwaltungSideNavProps = {
  items: RessortNavItem[];
  /** Hauptseite des ersten zugaenglichen Ressorts. */
  homeHref: string;
  /** Nur für Admins: Rechte einer anderen Person testen. */
  accessPreview?: AccessPreviewState | null;
};

const matchesRoute = (current: string, route: string) =>
  current === route || current.startsWith(`${route}/`);

export default function VerwaltungSideNav({
  items,
  homeHref,
  accessPreview = null,
}: VerwaltungSideNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Nur was von Hand auf- oder zugeklappt wurde; sonst entscheidet „aktiv".
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const pathname = usePathname() ?? "/";
  const current =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";

  // Längster Treffer gewinnt, sonst würde "/admin" auch "/admin/volkshaus" für
  // sich beanspruchen.
  const matchLength = (item: RessortNavItem) =>
    item.match.reduce(
      (longest, route) =>
        matchesRoute(current, route) ? Math.max(longest, route.length) : longest,
      0,
    );
  const activeHref = items.reduce<{ href: string | null; length: number }>(
    (best, item) => {
      const length = matchLength(item);
      return length > best.length ? { href: item.href, length } : best;
    },
    { href: null, length: 0 },
  ).href;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const activeChildHref = (item: RessortNavItem) =>
    (item.children ?? []).reduce<{ href: string | null; length: number }>(
      (best, child) =>
        matchesRoute(current, child.match) && child.match.length > best.length
          ? { href: child.href, length: child.match.length }
          : best,
      { href: null, length: 0 },
    ).href;

  const navigation = (
    <nav aria-label="Ressorts" className="flex flex-col pb-4">
      {items.map((item) => {
        const active = item.href === activeHref;
        const hasChildren = (item.children ?? []).length > 0;
        const expanded = hasChildren && (toggled[item.href] ?? active);
        const activeChild = active ? activeChildHref(item) : null;
        const listId = `ressort-${item.href.replace(/\W+/g, "-")}`;

        return (
          <div key={item.href} className="flex flex-col">
            <div
              className={
                active
                  ? "flex items-stretch bg-primary text-primary-foreground"
                  : "flex items-stretch text-[var(--knglmrt-dark-30)] transition hover:bg-white/10 hover:text-white"
              }
            >
              <Link
                href={item.href}
                aria-current={active && !activeChild ? "page" : undefined}
                onClick={() => setIsOpen(false)}
                className={`min-w-0 flex-1 px-5 py-2.5 text-[length:var(--ui-size-nav)] leading-[18px] ${
                  active ? "font-bold" : ""
                }`}
              >
                {item.label}
              </Link>
              {hasChildren ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  aria-label={`${item.label} ${expanded ? "zuklappen" : "aufklappen"}`}
                  onClick={() =>
                    setToggled((state) => ({ ...state, [item.href]: !expanded }))
                  }
                  className="flex w-10 shrink-0 items-center justify-center opacity-70 transition hover:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
                >
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    aria-hidden="true"
                    className={`h-3 w-3 transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  />
                </button>
              ) : null}
            </div>

            {expanded ? (
              <ul id={listId} className="flex flex-col py-1.5">
                {(item.children ?? []).map((child) => {
                  const childActive = child.href === activeChild;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        onClick={() => setIsOpen(false)}
                        className={
                          childActive
                            ? "block border-l-[3px] border-primary py-1.5 pl-[33px] pr-5 text-[length:var(--ui-size-nav)] font-bold leading-[18px] text-white"
                            : "block border-l-[3px] border-transparent py-1.5 pl-[33px] pr-5 text-[length:var(--ui-size-nav)] leading-[18px] text-[var(--knglmrt-dark-30)] transition hover:bg-white/10 hover:text-white"
                        }
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  const activeItem = items.find((item) => item.href === activeHref) ?? null;
  const activeChildLabel = activeItem
    ? ((activeItem.children ?? []).find(
        (child) => child.href === activeChildHref(activeItem),
      )?.label ?? null)
    : null;

  // Steht unten in der Leiste (mt-auto im Schalter selbst).
  const previewSwitch = accessPreview ? (
    <AccessPreviewSwitch preview={accessPreview} />
  ) : null;

  const homeLink = (
    <Link
      href={homeHref}
      onClick={() => setIsOpen(false)}
      className="font-[family-name:var(--font-display)] text-[20px] leading-tight text-white transition hover:text-[var(--knglmrt-dark-30)]"
    >
      Verwaltung
    </Link>
  );

  return (
    <>
      {/* Unter lg kostet die Leiste keine Breite: eine Zeile oben öffnet sie
          als Schublade über dem Inhalt. */}
      <div className="flex shrink-0 items-center bg-[var(--knglmrt-dark-100)] text-white lg:hidden">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="verwaltung-drawer"
          onClick={() => setIsOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-[length:var(--ui-size-nav)] leading-[18px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        >
          <FontAwesomeIcon icon={faBars} aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="font-bold">Verwaltung</span>
          {activeItem ? (
            <span className="truncate text-[var(--knglmrt-dark-30)]">
              {activeItem.label}
              {activeChildLabel ? ` / ${activeChildLabel}` : ""}
            </span>
          ) : null}
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Navigation schließen"
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside
            id="verwaltung-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Verwaltung"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-[var(--knglmrt-dark-100)]"
          >
            <div className="flex items-center justify-between gap-2 pb-4 pl-5 pr-2 pt-4">
              {homeLink}
              <button
                type="button"
                autoFocus
                aria-label="Navigation schließen"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 items-center justify-center text-white opacity-80 transition hover:opacity-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            {navigation}
            {previewSwitch}
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-[220px] shrink-0 bg-[var(--knglmrt-dark-100)] lg:flex lg:h-full lg:flex-col lg:overflow-y-auto">
        <div className="px-5 pb-4 pt-5">{homeLink}</div>
        {navigation}
        {previewSwitch}
      </aside>
    </>
  );
}
