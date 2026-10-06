import Image from "next/image";
import Link from "next/link";

import Face from "@/components/knglmrt/Face";

import TopNavLink from "./TopNavLink";
import Button from "@/components/knglmrt/Button";
import { getInitials, getTopNavSections } from "./topNavSections";

type TopNavProps = {
  isAuthenticated: boolean;
  currentUserDisplayName: string | null;
  adminAreaHref: string;
};

export default function TopNav({
  isAuthenticated,
  currentUserDisplayName,
  adminAreaHref,
}: TopNavProps) {
  const sections = getTopNavSections(isAuthenticated);

  // Unter 1024px übernimmt MobileTopNav; zwischen 1024 und 1280px fehlt der
  // Platz für den Namen, dann bleiben nur die Initialen.
  return (
    <header className="sticky top-0 z-40 hidden knglmrt-border-b bg-card lg:block">
      <div className="flex h-[70px] w-full items-stretch justify-between px-7">
        <div className="flex min-w-0 items-stretch">
          <Link
            href="/"
            className="flex flex-none items-center knglmrt-border-r pr-[22px]"
          >
            <Image
              src="/branding/logo/konglodigital-logo.svg"
              alt="Konglo Digital — Startseite"
              width={137}
              height={45}
              priority
              unoptimized
            />
          </Link>
          <nav aria-label="Hauptnavigation" className="flex items-stretch">
            {sections.map((section) => (
              <TopNavLink
                key={section.href}
                href={section.href}
                label={section.label}
              />
            ))}
          </nav>
        </div>

        <div className="flex flex-none items-center knglmrt-border-l pl-6">
          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              {/* Kein Hover-Menü mehr: das Profil ist eine Seite mit eigener
              Bereichsnavigation (/account), nicht ein Dropdown. */}
              <Link
                href="/account"
                title={currentUserDisplayName ?? "Profil"}
                className="flex items-center gap-2.5 py-1 transition hover:text-primary"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-none items-center justify-center knglmrt-border bg-primary-soft text-xs font-bold text-foreground"
                >
                  {getInitials(currentUserDisplayName)}
                </span>
                <span className="sr-only xl:not-sr-only xl:max-w-[9rem] xl:truncate xl:text-[length:var(--ui-size-body)] xl:font-bold">
                  {currentUserDisplayName ?? "Profil"}
                </span>
              </Link>
              <Button
                href={adminAreaHref}
                kind="admin"
                icon={<Face number={6} size={24} />}
              >
                Verwaltung
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button href="/login" kind="secondary">
                Anmelden
              </Button>
              <Button
                href="/registration"
                kind="primary"
              >
                Mitglied werden
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
