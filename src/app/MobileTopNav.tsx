"use client";
// Topnav unter 1024px: dieselben Hauptpunkte und dieselbe Profil- bzw.
// Login-Ecke wie auf dem Desktop, nur hinter einem Menü-Knopf gestapelt.
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faXmark } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import { localizePathname, stripLocalePrefix } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import type { SiteNavItem } from "@/lib/payload-navigation";

import {
  getInitials,
  getTopNavSections,
  isInternalHref,
  isTopNavSectionActive,
} from "./topNavSections";

type MobileTopNavProps = {
  isAuthenticated: boolean;
  currentUserDisplayName: string | null;
  /** null, wenn der Nutzer kein Ressort der Verwaltung öffnen darf. */
  adminAreaHref: string | null;
  links: SiteNavItem[];
  inventoryHref: string;
};

export default function MobileTopNav({
  isAuthenticated,
  currentUserDisplayName,
  adminAreaHref,
  links,
  inventoryHref,
}: MobileTopNavProps) {
  const { locale, tx } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const current =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";
  const sections = getTopNavSections(links, isAuthenticated, inventoryHref);
  const close = () => setIsOpen(false);

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

  return (
    <header className="sticky top-0 z-40 knglmrt-border-b bg-card lg:hidden">
      <div className="flex h-[60px] w-full items-stretch justify-between px-4">
        <Link href={localizePathname("/", locale)} onClick={close} className="flex flex-none items-center">
          <Image
            src="/branding/logo/konglodigital-logo.svg"
            alt="Konglo Digital — Startseite"
            width={113}
            height={37}
            className="invert-in-dark"
            priority
            unoptimized
          />
        </Link>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="hauptnavigation-mobil"
          aria-label={isOpen ? tx("Menü schließen") : tx("Menü öffnen")}
          onClick={() => setIsOpen((open) => !open)}
          className="flex items-center gap-2.5 knglmrt-border-l pl-4 text-[length:var(--ui-size-body)] font-bold text-foreground transition hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          {tx("Menü")}
          <FontAwesomeIcon
            icon={isOpen ? faXmark : faBars}
            aria-hidden="true"
            className="h-5 w-5"
          />
        </button>
      </div>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label={tx("Menü schließen")}
            tabIndex={-1}
            onClick={close}
            className="fixed inset-x-0 bottom-0 top-[61px] bg-black/40"
          />
          <div
            id="hauptnavigation-mobil"
            className="absolute inset-x-0 top-full mt-px max-h-[calc(100dvh-61px)] overflow-y-auto knglmrt-border-b bg-card"
          >
            <nav aria-label={tx("Hauptnavigation")} className="flex flex-col py-2">
              {sections.map((section, index) => {
                const isActive = isTopNavSectionActive(current, section.href);
                const Element = isInternalHref(section.href) ? Link : "a";
                return (
                  <Element
                    key={`${section.href}-${index}`}
                    href={section.href}
                    target={section.newTab ? "_blank" : undefined}
                    rel={section.newTab ? "noopener noreferrer" : undefined}
                    onClick={close}
                    aria-current={isActive ? "page" : undefined}
                    className="px-4 py-3 font-display text-[21px] text-foreground transition hover:text-primary"
                  >
                    <span className="relative inline-block w-max">
                      <span
                        className={
                          isActive ? "font-bold text-primary" : undefined
                        }
                      >
                        {tx(section.label)}
                      </span>
                      {isActive ? (
                        <span className="absolute inset-x-0 top-full mt-1 block">
                          <Divider
                            number={4}
                            height={8}
                            color="var(--primary)"
                          />
                        </span>
                      ) : null}
                    </span>
                  </Element>
                );
              })}
            </nav>

            <div className="knglmrt-border-t px-4 py-4">
              {isAuthenticated ? (
                <div className="flex flex-col gap-4">
                  <Link
                    href={localizePathname("/account", locale)}
                    onClick={close}
                    className="flex items-center gap-2.5 py-1 transition hover:text-primary"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 flex-none items-center justify-center knglmrt-border bg-primary-soft text-xs font-bold text-foreground"
                    >
                      {getInitials(currentUserDisplayName)}
                    </span>
                    <span className="min-w-0 truncate text-[length:var(--ui-size-body)] font-bold">
                      {currentUserDisplayName ?? tx("Profil")}
                    </span>
                  </Link>
                  {adminAreaHref ? (
                    <Button
                      href={localizePathname(adminAreaHref, locale)}
                      kind="admin"
                      fullWidth
                      icon={<Face number={6} size={24} />}
                      onClick={close}
                    >
                      {tx("Verwaltung")}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    href={localizePathname("/login", locale)}
                    kind="secondary"
                    fullWidth
                    onClick={close}
                  >
                    {tx("Anmelden")}
                  </Button>
                  <Button
                    href={localizePathname("/registration", locale)}
                    kind="primary"
                    fullWidth
                    onClick={close}
                  >
                    {tx("Mitglied werden")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}
