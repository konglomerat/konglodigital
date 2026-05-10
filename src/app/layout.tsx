import type { Metadata } from "next";
import Link from "next/link";
import ActiveNavLink from "./ActiveNavLink";
import SidebarTile from "./SidebarTile";
import heroHelloImage from "./hero-hello.jpg";
import { Geist, Geist_Mono } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faBuilding,
  faCalendarDays,
  faChartPie,
  faFolderOpen,
  faUser,
  faLock,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mdxeditor/editor/style.css";
import "./globals.css";
import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { getUserRole, type UserRole } from "@/lib/roles";
import { WERKBEREICHE, PROJEKTE } from "@/lib/werkbereiche";

const ROLE_LABELS_DE: Record<UserRole, string> = {
  admin: "Admin",
  accounting: "Buchhaltung",
  member: "Mitglied",
};
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Button from "./[lang]/components/Button";
import ThemeToggle from "./[lang]/components/ThemeToggle";
import AutoCloseMenuDetails from "./[lang]/components/AutoCloseMenuDetails";
import ChatwootWidget from "./[lang]/components/ChatwootWidget";
import LanguageSwitcher from "./[lang]/components/LanguageSwitcher";
import { I18nProvider } from "@/i18n/client";
import { getRequestLocale } from "@/i18n/server";
import { storyOpenSans } from "@/lib/story-fonts";

config.autoAddCss = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteTitle = "Konglomerat Digitale Werkstätten";
const siteDescription =
  "Zwischen Werkbank, Warenkorb und Vereinschaos: alles an einem Ort.";
const publicBaseUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(publicBaseUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: siteTitle,
    description: siteDescription,
    siteName: siteTitle,
    locale: "de_DE",
    images: [
      {
        url: heroHelloImage.src,
        width: heroHelloImage.width,
        height: heroHelloImage.height,
        alt: "Konglo Digital Startseite",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [heroHelloImage.src],
  },
};

type ProtectedNavItemProps = {
  href: string;
  icon: IconProp;
  children: React.ReactNode;
  className: string;
  isAccessible: boolean;
  tooltip: string;
  external?: boolean;
};

function ProtectedNavItem({
  href,
  icon,
  children,
  className,
  isAccessible,
  tooltip,
  external,
}: ProtectedNavItemProps) {
  if (isAccessible) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          <FontAwesomeIcon icon={icon} className="h-4 w-4" />
          {children}
        </a>
      );
    }
    return (
      <ActiveNavLink href={href} className={className}>
        <FontAwesomeIcon icon={icon} className="h-4 w-4" />
        {children}
      </ActiveNavLink>
    );
  }

  return (
    <div
      className={`${className} cursor-not-allowed select-none text-muted-foreground/80 hover:text-muted-foreground/80`}
      aria-disabled="true"
      title={tooltip}
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      <span>{children}</span>
      <span className="ml-auto inline-flex items-center" title={tooltip}>
        <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
      </span>
    </div>
  );
}

type SidebarSectionLabelProps = {
  children: React.ReactNode;
};

function SidebarSectionLabel({ children }: SidebarSectionLabelProps) {
  return (
    <p className="px-6 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground first:pt-0">
      {children}
    </p>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);
  const currentUserDisplayName = userData.user
    ? getCampaiBookingDisplayName(userData.user)
    : null;
  const userRole = await getUserRole(supabase, userData.user);
  const canAccessAdmin = isAuthenticated && userRole === "admin";

  const navItemClassName =
    "group flex w-full items-center gap-3 bg-transparent px-6 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground";
  const navLinkClassName =
    "group flex items-center gap-3 border-b border-border/60 bg-transparent px-2 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground";
  const navButtonClassName =
    "flex w-full items-center justify-center gap-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90";
  const membersOnlyTooltip = "Nur für angemeldete Mitglieder verfügbar";

  const renderKonglomerat = (className: string) => (
    <>
      <ProtectedNavItem
        href="https://konglomerat.org"
        className={className}
        icon={faBuilding}
        isAccessible
        tooltip=""
        external
      >
        Der Verein
      </ProtectedNavItem>
      <ActiveNavLink href="/projects" className={className}>
        <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
        Projekte
      </ActiveNavLink>
      <ActiveNavLink href="/calendar" className={className}>
        <FontAwesomeIcon icon={faCalendarDays} className="h-4 w-4" />
        Kalender
      </ActiveNavLink>
      <ProtectedNavItem
        href="/resources"
        className={className}
        icon={faBoxOpen}
        isAccessible={isAuthenticated}
        tooltip={membersOnlyTooltip}
      >
        Inventar
      </ProtectedNavItem>
      <ProtectedNavItem
        href="/receipts"
        className={className}
        icon={faChartPie}
        isAccessible={isAuthenticated}
        tooltip={membersOnlyTooltip}
      >
        Buchhaltung
      </ProtectedNavItem>
    </>
  );

  const renderWerkbereicheTiles = () => (
    <div className="grid grid-cols-2 gap-[0.3em] px-[0.3em]">
      {WERKBEREICHE.map((w) => (
        <SidebarTile
          key={w.slug}
          href={`/werkbereiche/${w.slug}`}
          label={w.shortLabel ?? w.name}
          activeMatch={`/werkbereiche/${w.slug}`}
        />
      ))}
    </div>
  );

  const renderProjekteTiles = () => (
    <div className="grid grid-cols-2 gap-[0.3em] px-[0.3em]">
      {PROJEKTE.map((p) => (
        <SidebarTile
          key={p.slug}
          href={`/projekte/${p.slug}`}
          label={p.name}
          activeMatch={`/projekte/${p.slug}`}
        />
      ))}
    </div>
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem("theme");var theme=stored?stored:"light";var root=document.documentElement;root.classList.toggle("dark", theme==="dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${storyOpenSans.variable} antialiased`}
      >
        <I18nProvider locale={locale}>
          <ChatwootWidget locale={locale} />
          <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-40 border-b border-border bg-card shadow-sm md:hidden">
              <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
                <Link
                  href="/"
                  className="text-xl font-black leading-none uppercase tracking-widest text-foreground transition hover:text-primary"
                >
                  Konglo
                  <br />
                  digital
                </Link>
                <div className="flex items-center gap-3">
                  <LanguageSwitcher />
                  <ThemeToggle />
                  <AutoCloseMenuDetails
                    className="group"
                    summary={
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
                        Menü
                        <span className="text-lg transition group-open:rotate-45">
                          +
                        </span>
                      </summary>
                    }
                  >
                    <div className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg">
                      <nav className="flex flex-col px-2 py-2">
                        <SidebarSectionLabel>Konglomerat</SidebarSectionLabel>
                        {renderKonglomerat(navLinkClassName)}

                        <SidebarSectionLabel>Werkbereiche</SidebarSectionLabel>
                        <div className="px-2 py-1">
                          {renderWerkbereicheTiles()}
                        </div>

                        <SidebarSectionLabel>Projekte</SidebarSectionLabel>
                        <div className="px-2 py-1">
                          {renderProjekteTiles()}
                        </div>
                      </nav>
                      {isAuthenticated ? (
                        <div className="border-t border-border">
                          {canAccessAdmin ? (
                            <div className="px-4 pb-3 pt-4">
                              <Button
                                href="/admin/users"
                                kind="secondary"
                                className="flex w-full items-center justify-center gap-3 rounded-full px-4 py-2 text-sm font-semibold"
                              >
                                <FontAwesomeIcon
                                  icon={faLock}
                                  className="h-4 w-4"
                                />
                                Admin
                              </Button>
                            </div>
                          ) : null}
                          <Link
                            href="/account"
                            className={`flex items-center gap-3 px-4 py-3 transition hover:bg-muted ${canAccessAdmin ? "border-t border-border" : ""}`}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                              <FontAwesomeIcon
                                icon={faUser}
                                className="h-3.5 w-3.5"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-foreground">
                                {currentUserDisplayName ?? "Konto"}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {ROLE_LABELS_DE[userRole]}
                              </span>
                            </span>
                            <span
                              aria-hidden
                              className="text-base text-muted-foreground"
                            >
                              ›
                            </span>
                          </Link>
                        </div>
                      ) : (
                        <div className="border-t border-border px-4 py-4">
                          <Button
                            href="/login"
                            kind="primary"
                            className={navButtonClassName}
                          >
                            <FontAwesomeIcon
                              icon={faRightToBracket}
                              className="h-4 w-4"
                            />
                            Anmelden
                          </Button>
                        </div>
                      )}
                    </div>
                  </AutoCloseMenuDetails>
                </div>
              </div>
            </header>
            <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-6 pt-8 text-sidebar-foreground shadow-sm md:flex">
              <div className="space-y-3">
                <div>
                  <Link
                    href="/"
                    className="text-3xl font-black leading-none uppercase tracking-widest text-foreground transition hover:text-primary"
                  >
                    Konglo
                    <br />
                    digital
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
              </div>
              <nav className="-mx-6 mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto">
                <SidebarSectionLabel>Konglomerat</SidebarSectionLabel>
                {renderKonglomerat(navItemClassName)}

                <SidebarSectionLabel>Werkbereiche</SidebarSectionLabel>
                <div className="pb-2">{renderWerkbereicheTiles()}</div>

                <SidebarSectionLabel>Projekte</SidebarSectionLabel>
                <div className="pb-2">{renderProjekteTiles()}</div>
              </nav>
              {isAuthenticated ? (
                <div className="-mx-6 mt-auto flex flex-col">
                  {canAccessAdmin ? (
                    <div className="px-6 pb-3">
                      <Button
                        href="/admin/users"
                        kind="secondary"
                        className="flex w-full items-center justify-center gap-3 rounded-full px-4 py-2 text-sm font-semibold"
                      >
                        <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
                        Admin
                      </Button>
                    </div>
                  ) : null}
                  <Link
                    href="/account"
                    className="flex items-center gap-3 border-t border-sidebar-border bg-sidebar px-6 py-3 transition hover:bg-muted"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                      <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {currentUserDisplayName ?? "Konto"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_LABELS_DE[userRole]}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="text-base text-muted-foreground"
                    >
                      ›
                    </span>
                  </Link>
                </div>
              ) : (
                <Button
                  href="/login"
                  kind="primary"
                  className={navButtonClassName}
                >
                  <FontAwesomeIcon
                    icon={faRightToBracket}
                    className="h-4 w-4"
                  />
                  Anmelden
                </Button>
              )}
            </aside>
            <div className="ml-0 md:ml-64">
              <main className="mx-auto w-full px-3 py-4 md:px-10 md:py-10">
                {children}
              </main>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
