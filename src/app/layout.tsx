import type { Metadata } from "next";
import Link from "next/link";
import ActiveSubnavGroup from "./ActiveSubnavGroup";
import ActiveNavLink from "./ActiveNavLink";
import heroHelloImage from "./hero-hello.jpg";
import { Geist, Geist_Mono } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCube,
  faBoxOpen,
  faCalendarCheck,
  faCalendarDays,
  faChartPie,
  faFolderOpen,
  faTableList,
  faLayerGroup,
  faPrint,
  faKey,
  faCartShopping,
  faUser,
  faLock,
  faRightFromBracket,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mdxeditor/editor/style.css";
import "./globals.css";
import { signOut } from "./actions";
import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { getUserRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Button from "./[lang]/components/Button";
import PageWrapper from "./[lang]/components/PageWrapper";
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
  activeClassName?: string;
  isAccessible: boolean;
  tooltip: string;
};

function ProtectedNavItem({
  href,
  icon,
  children,
  className,
  activeClassName,
  isAccessible,
  tooltip,
}: ProtectedNavItemProps) {
  if (isAccessible) {
    return (
      <ActiveNavLink
        href={href}
        className={className}
        activeClassName={activeClassName}
      >
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

type ComingSoonNavItemProps = {
  icon: IconProp;
  children: React.ReactNode;
  className: string;
};

function ComingSoonNavItem({
  icon,
  children,
  className,
}: ComingSoonNavItemProps) {
  return (
    <div
      className={`${className} cursor-not-allowed select-none text-muted-foreground/80 hover:text-muted-foreground/80`}
      aria-disabled="true"
      title="Coming soon"
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      <span>{children}</span>
      <span className="ml-auto whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Coming soon
      </span>
    </div>
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
  const navLinkClassName =
    "group flex items-center gap-3 border-b border-border/60 bg-transparent px-2 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground";
  const navSectionTitleClassName =
    "px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:pt-0";
  const navButtonClassName =
    "flex w-full items-center justify-center gap-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90";
  const desktopMainNavClassName =
    "inline-flex h-10 items-center rounded-md px-4 text-base font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950";
  const desktopMainNavActiveClassName =
    "bg-primary !text-primary-foreground hover:bg-primary/90 hover:!text-primary-foreground";
  const desktopSubNavClassName =
    "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground";
  const desktopSubNavActiveClassName =
    "border-primary bg-primary text-primary-foreground hover:text-primary-foreground";
  const startNavPrefixes = ["/", "/projects", "/resources", "/products", "/calendar"];
  const memberNavPrefixes = [
    "/mitglieder",
    "/account",
    "/printers",
    "/checkout",
    "/materialbestellung",
    "/meine-buchungen",
    "/budget",
    "/balance",
    "/admin",
  ];
  const membersOnlyTooltip = "Nur für angemeldete Mitglieder verfügbar";

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
            <header className="border-b border-zinc-200 bg-white text-zinc-950 md:hidden">
              <div className="relative flex w-full items-center justify-between px-4 py-4">
                <Link
                  href="/"
                  className="text-xl font-black leading-none uppercase tracking-widest text-zinc-950 transition hover:text-primary"
                >
                  KONGLODIGITAL
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
                        <p className={navSectionTitleClassName}>Start</p>
                        <ActiveNavLink href="/" exact className={navLinkClassName}>
                          Überblick
                        </ActiveNavLink>
                        <ActiveNavLink
                          href="/projects"
                          className={navLinkClassName}
                        >
                          Projekte
                        </ActiveNavLink>
                        <ProtectedNavItem
                          href="/resources"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Inventar
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/products"
                          className={navLinkClassName}
                          icon={faBoxOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Produkte
                        </ProtectedNavItem>
                        <ActiveNavLink
                          href="/calendar"
                          className={navLinkClassName}
                        >
                          <FontAwesomeIcon
                            icon={faCalendarDays}
                            className="h-4 w-4"
                          />
                          Kalender
                        </ActiveNavLink>

                        <p className={navSectionTitleClassName}>Mitglieder</p>
                        <ProtectedNavItem
                          href="/mitglieder"
                          className={navLinkClassName}
                          icon={faUser}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Überblick
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/account"
                          className={navLinkClassName}
                          icon={faUser}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          {currentUserDisplayName
                            ? `Profil (${currentUserDisplayName})`
                            : "Profil"}
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/printers"
                          className={navLinkClassName}
                          icon={faCube}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          3D-Druck
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/printers/emptying"
                          className={navLinkClassName}
                          icon={faPrint}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Drucker entleeren
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/printers/access-codes"
                          className={navLinkClassName}
                          icon={faKey}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Drucker Zugangscodes
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/checkout"
                          className={navLinkClassName}
                          icon={faCartShopping}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Warenkorb
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/materialbestellung"
                          className={navLinkClassName}
                          icon={faLayerGroup}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Materialbestellung
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/meine-buchungen"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Meine Buchungen
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/budget"
                          className={navLinkClassName}
                          icon={faChartPie}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Budget Werkbereiche
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/balance"
                          className={navLinkClassName}
                          icon={faTableList}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Balance
                        </ProtectedNavItem>
                        <ComingSoonNavItem
                          className={navLinkClassName}
                          icon={faChartPie}
                        >
                          Laser
                        </ComingSoonNavItem>
                        <ComingSoonNavItem
                          className={navLinkClassName}
                          icon={faCalendarCheck}
                        >
                          Zugangskarte
                        </ComingSoonNavItem>
                        <ComingSoonNavItem
                          className={navLinkClassName}
                          icon={faUser}
                        >
                          Ehrenamtsbonus
                        </ComingSoonNavItem>
                        <ComingSoonNavItem
                          className={navLinkClassName}
                          icon={faLayerGroup}
                        >
                          Lagerplatz
                        </ComingSoonNavItem>
                        {canAccessAdmin ? (
                          <ActiveNavLink
                            href="/admin/users"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faLock}
                              className="h-4 w-4"
                            />
                            Admin
                          </ActiveNavLink>
                        ) : null}
                      </nav>
                      <div className="border-t border-border px-4 py-4">
                        {isAuthenticated ? (
                          <div className="space-y-3">
                            <form action={signOut}>
                              <Button
                                type="submit"
                                kind="primary"
                                className={navButtonClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faRightFromBracket}
                                  className="h-4 w-4"
                                />
                                Abmelden
                              </Button>
                            </form>
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
                      </div>
                    </div>
                  </AutoCloseMenuDetails>
                </div>
              </div>
            </header>
            <header className="hidden border-b border-zinc-200 bg-white text-zinc-950 md:block">
              <div className="flex w-full items-center gap-6 px-10 py-4">
                <Link
                  href="/"
                  className="text-2xl font-black leading-none uppercase tracking-widest text-zinc-950 transition hover:text-primary"
                >
                  KONGLODIGITAL
                </Link>
                <nav className="ml-auto flex items-center justify-end gap-2">
                  <ActiveNavLink
                    href="/"
                    exact
                    activePrefixes={["/projects", "/resources", "/products", "/calendar"]}
                    className={desktopMainNavClassName}
                    activeClassName={desktopMainNavActiveClassName}
                  >
                    Start
                  </ActiveNavLink>
                  <ActiveNavLink
                    href="/mitglieder"
                    activePrefixes={memberNavPrefixes}
                    className={desktopMainNavClassName}
                    activeClassName={desktopMainNavActiveClassName}
                  >
                    Mitglieder
                  </ActiveNavLink>
                </nav>
                <div className="flex items-center gap-2">
                  <LanguageSwitcher />
                  <ThemeToggle />
                  {isAuthenticated ? (
                    <>
                      <form action={signOut}>
                        <Button
                          type="submit"
                          kind="primary"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold"
                        >
                          <FontAwesomeIcon
                            icon={faRightFromBracket}
                            className="h-4 w-4"
                          />
                          Abmelden
                        </Button>
                      </form>
                    </>
                  ) : (
                    <Button
                      href="/login"
                      kind="primary"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold"
                    >
                      <FontAwesomeIcon
                        icon={faRightToBracket}
                        className="h-4 w-4"
                      />
                      Anmelden
                    </Button>
                  )}
                </div>
              </div>
            </header>
            <ActiveSubnavGroup
              activePrefixes={startNavPrefixes}
              className="hidden md:block md:px-10"
            >
              <PageWrapper
                spacing="none"
                className="flex flex-wrap items-start gap-x-8 gap-y-3 py-4"
              >
                <nav
                  aria-label="Start Subnavigation"
                  className="flex flex-wrap items-center gap-2"
                >
                  <ActiveNavLink
                    href="/"
                    exact
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                  >
                    Überblick
                  </ActiveNavLink>
                  <ActiveNavLink
                    href="/projects"
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                  >
                    Projekte
                  </ActiveNavLink>
                  <ProtectedNavItem
                    href="/resources"
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                    icon={faFolderOpen}
                    isAccessible={isAuthenticated}
                    tooltip={membersOnlyTooltip}
                  >
                    Inventar
                  </ProtectedNavItem>
                  <ProtectedNavItem
                    href="/products"
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                    icon={faBoxOpen}
                    isAccessible={isAuthenticated}
                    tooltip={membersOnlyTooltip}
                  >
                    Produkte
                  </ProtectedNavItem>
                  <ActiveNavLink
                    href="/calendar"
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                  >
                    <FontAwesomeIcon icon={faCalendarDays} className="h-4 w-4" />
                    Kalender
                  </ActiveNavLink>
                </nav>
              </PageWrapper>
            </ActiveSubnavGroup>
            <ActiveSubnavGroup
              activePrefixes={memberNavPrefixes}
              className="hidden md:block md:px-10"
            >
              <PageWrapper
                spacing="none"
                className="flex flex-wrap items-start gap-x-8 gap-y-3 py-4"
              >
                <nav
                  aria-label="Mitglieder Subnavigation"
                  className="flex flex-wrap items-center gap-2"
                >
                <ProtectedNavItem
                  href="/mitglieder"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faUser}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Überblick
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/printers"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faCube}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  3D-Druck
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/printers/emptying"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faPrint}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Drucker entleeren
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/printers/access-codes"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faKey}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Drucker Zugangscodes
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/checkout"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faCartShopping}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Warenkorb
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/account"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faUser}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  {currentUserDisplayName
                    ? `Profil (${currentUserDisplayName})`
                    : "Profil"}
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/materialbestellung"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faLayerGroup}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Materialbestellung
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/meine-buchungen"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faFolderOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Meine Buchungen
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/budget"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faChartPie}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Budget Werkbereiche
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/balance"
                  className={desktopSubNavClassName}
                  activeClassName={desktopSubNavActiveClassName}
                  icon={faTableList}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Balance
                </ProtectedNavItem>
                <ComingSoonNavItem
                  className={desktopSubNavClassName}
                  icon={faChartPie}
                >
                  Laser
                </ComingSoonNavItem>
                <ComingSoonNavItem
                  className={desktopSubNavClassName}
                  icon={faCalendarCheck}
                >
                  Zugangskarte
                </ComingSoonNavItem>
                <ComingSoonNavItem className={desktopSubNavClassName} icon={faUser}>
                  Ehrenamtsbonus
                </ComingSoonNavItem>
                <ComingSoonNavItem
                  className={desktopSubNavClassName}
                  icon={faLayerGroup}
                >
                  Lagerplatz
                </ComingSoonNavItem>
                {canAccessAdmin ? (
                  <ActiveNavLink
                    href="/admin/users"
                    className={desktopSubNavClassName}
                    activeClassName={desktopSubNavActiveClassName}
                  >
                    <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
                    Admin
                  </ActiveNavLink>
                ) : null}
              </nav>
              </PageWrapper>
            </ActiveSubnavGroup>
            <div>
              <main className="mx-auto w-full md:px-10 md:pb-10">
                {children}
              </main>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
