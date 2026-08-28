import Image from "next/image";
import Link from "next/link";

import Face from "@/components/knglmrt/Face";

import TopNavLink from "./TopNavLink";
import Button from "./[lang]/components/Button";

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
    <header className="sticky top-0 z-40 hidden knglmrt-border-b bg-card md:block">
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
                className="flex items-center gap-2.5 py-1 transition hover:text-primary"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-none items-center justify-center knglmrt-border bg-primary-soft text-xs font-bold text-foreground"
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
                className="h-9 !bg-[var(--knglmrt-brown-100)] !text-white hover:!bg-foreground hover:!text-background"
              >
                <span aria-hidden="true" className="flex-none">
                  <Face number={6} size={40} />
                </span>
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
    </header>
  );
}
