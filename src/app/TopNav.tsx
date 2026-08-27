import Image from "next/image";
import Link from "next/link";

import TopNavLink from "./TopNavLink";
import Button from "./[lang]/components/Button";
import LanguageSwitcher from "./[lang]/components/LanguageSwitcher";

type TopNavProps = {
  isAuthenticated: boolean;
  currentUserDisplayName: string | null;
  adminAreaHref: string;
};

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};

export default function TopNav({
  isAuthenticated,
  currentUserDisplayName,
  adminAreaHref,
}: TopNavProps) {
  // Login-pflichtige Bereiche erscheinen ausgeloggt gar nicht.
  const sections = [
    { href: "/verein", label: "Verein" },
    { href: "/werkbereiche", label: "Werkbereiche" },
    { href: "/showcase", label: "Hier entstanden" },
    ...(isAuthenticated ? [{ href: "/resources", label: "Inventar" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 hidden border-b border-foreground bg-card md:block">
      <div className="mx-auto flex h-[62px] w-full max-w-[1240px] items-stretch justify-between px-7">
        <div className="flex min-w-0 items-stretch">
          <Link
            href="/"
            className="flex flex-none items-center border-r border-foreground pr-[22px]"
          >
            <Image
              src="/konglodigital-logo.svg"
              alt="Konglo Digital — Startseite"
              width={91}
              height={30}
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

        <div className="flex flex-none items-stretch">
          {/* DE/EN steht links des Trenners, die Auth-Zone rechts davon. */}
          <div className="flex items-center pr-6">
            <LanguageSwitcher variant="topnav" />
          </div>

          <div className="flex items-center border-l border-foreground pl-6">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                {/* Kein Hover-Menü mehr: das Profil ist eine Seite mit eigener
                Bereichsnavigation (/account), nicht ein Dropdown. */}
                <Link
                  href="/account"
                  className="flex items-center gap-2.5 py-1 transition hover:text-primary"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center border border-foreground bg-primary-soft text-xs font-bold text-foreground"
                  >
                    {getInitials(currentUserDisplayName)}
                  </span>
                  <span className="max-w-[9rem] truncate text-[length:var(--ui-size-body)] font-bold">
                    {currentUserDisplayName ?? "Profil"}
                  </span>
                </Link>
                <Button
                  href={adminAreaHref}
                  kind="secondary"
                  className="!bg-foreground !text-background hover:!bg-[var(--knglmrt-brown-100)] hover:!text-white"
                >
                  Verwaltung
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button href="/login" kind="secondary">
                  Anmelden
                </Button>
                <Button href="/register" kind="primary">
                  Mitglied werden
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
