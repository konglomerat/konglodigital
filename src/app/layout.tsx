import type { Metadata } from "next";
import Link from "next/link";
import ActiveNavLink from "./ActiveNavLink";
import heroHelloImage from "./hero-hello.jpg";
import {
  Fira_Sans,
  Fira_Sans_Condensed,
  Fira_Sans_Extra_Condensed,
  Fira_Mono,
} from "next/font/google";
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
  faCircleInfo,
  faEuroSign,
  faFolderOpen,
  faLayerGroup,
  faPrint,
  faKey,
  faCartShopping,
  faUser,
  faLock,
  faRightFromBracket,
  faRightToBracket,
  faHouse,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mdxeditor/editor/style.css";
import "./globals.css";
import "./knglmrt-theme.css";
import { signOut } from "./actions";
import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { rolesCanAccessModule } from "@/lib/roles";
import { getVerwaltungEntryHref } from "./[lang]/admin/ressorts";
import {
  getServerSession,
  getServerSessionRoles,
} from "@/lib/server-session";
import Button from "./[lang]/components/Button";
import ThemeToggle from "./[lang]/components/ThemeToggle";
import AutoCloseMenuDetails from "./[lang]/components/AutoCloseMenuDetails";
import { I18nProvider } from "@/i18n/client";
import { getRequestLocale } from "@/i18n/server";
import { storyOpenSans } from "@/lib/story-fonts";
import AppShell from "./AppShell";
import SiteFooter from "./SiteFooter";
import TopNav from "./TopNav";

config.autoAddCss = false;

const geistSans = Fira_Sans_Condensed({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Fira_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// Die beiden übrigen Rollen des DS: "wide" trägt die getrackten Versalien
// (Badges, DE/EN, Augenbraue), "narrow" die Lead-Zeile unter jedem Seitentitel.
const knglmrtWide = Fira_Sans({
  variable: "--font-knglmrt-wide",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const knglmrtNarrow = Fira_Sans_Extra_Condensed({
  variable: "--font-knglmrt-narrow",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
      title="Soon"
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      <span>{children}</span>
      <span className="ml-auto whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Soon
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
  const { user } = await getServerSession();
  const isAuthenticated = Boolean(user);
  const currentUserDisplayName = user
    ? getCampaiBookingDisplayName(user)
    : null;
  const userRoles = await getServerSessionRoles();
  const canAccessAdmin =
    isAuthenticated && rolesCanAccessModule(userRoles, "admin");
  const canAccessVolkshaus =
    isAuthenticated && rolesCanAccessModule(userRoles, "volkshaus");
  const canAccessBackOffice = canAccessAdmin || canAccessVolkshaus;
  // Belege und Guthaben stehen nur im Back-Office, nicht im Profil.
  const canAccessFinanzen =
    isAuthenticated && rolesCanAccessModule(userRoles, "invoices");
  const adminAreaHref = getVerwaltungEntryHref(userRoles);
  const navLinkClassName =
    "group flex items-center gap-3 border-b border-border bg-transparent px-2 py-2.5 text-sm font-medium text-foreground transition hover:text-primary";
  const navSectionTitleClassName =
    "px-2 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground first:pt-0";
  // Die Optik kommt aus der Button-Komponente; hier nur die Breite.
  const navButtonClassName = "w-full";

  return (
    // Die next/font-Variablen gehören auf <html>: knglmrt-theme.css definiert
    // --font-core/-display/-wide/-narrow auf :root. Lagen die Variablen auf
    // <body>, war var(--font-geist-sans) dort unauflösbar — die Rollen-Tokens
    // wurden ungültig und Body wie Überschriften fielen auf system-ui zurück.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${knglmrtWide.variable} ${knglmrtNarrow.variable} ${storyOpenSans.variable}`}
    >
      <head>
        {/* Fengardo trägt Topnav und Seitentitel — früh laden, damit der
            swap-Fallback nicht sichtbar umbricht. */}
        <link
          rel="preload"
          href="/fonts/FengardoNeue_Black.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem("theme");var theme=stored?stored:"light";var root=document.documentElement;root.classList.toggle("dark", theme==="dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <I18nProvider locale={locale}>
          <AppShell
            mobileNavigation={
              <header className="sticky top-0 z-40 knglmrt-border-b bg-card md:hidden">
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
                    <AutoCloseMenuDetails
                      className="group"
                      summary={
                        <summary className="flex cursor-pointer list-none items-center gap-2 knglmrt-border bg-card px-4 py-2 text-sm font-bold text-foreground transition hover:bg-primary-soft">
                          Menü
                          <span className="text-lg transition group-open:rotate-45">
                            +
                          </span>
                        </summary>
                      }
                    >
                      <div className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto knglmrt-border bg-popover text-popover-foreground">
                        <nav className="flex flex-col px-2 py-2">
                          <p className={navSectionTitleClassName}>Verein</p>
                          <ActiveNavLink
                            href="/verein"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faCircleInfo}
                              className="h-4 w-4"
                            />
                            Über uns
                          </ActiveNavLink>
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
                          <ActiveNavLink
                            href="/volkshaus/buchen"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faHouse}
                              className="h-4 w-4"
                            />
                            Volkshaus buchen
                          </ActiveNavLink>
                          <ActiveNavLink
                            href="/monatsbeitrag"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faEuroSign}
                              className="h-4 w-4"
                            />
                            Mitgliedschaft & Beitrag
                          </ActiveNavLink>

                          <p className={navSectionTitleClassName}>
                            Werkbereiche
                          </p>
                          <ActiveNavLink
                            href="/werkbereiche"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faLayerGroup}
                              className="h-4 w-4"
                            />
                            Alle Werkbereiche
                          </ActiveNavLink>
                          {isAuthenticated ? (
                            <>
                              <ActiveNavLink
                                href="/printers"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faCube}
                                  className="h-4 w-4"
                                />
                                3D-Druck
                              </ActiveNavLink>
                              <ActiveNavLink
                                href="/printers/emptying"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faPrint}
                                  className="h-4 w-4"
                                />
                                Drucker entleeren
                              </ActiveNavLink>
                              <ActiveNavLink
                                href="/printers/access-codes"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faKey}
                                  className="h-4 w-4"
                                />
                                Drucker Zugang
                              </ActiveNavLink>
                              <ActiveNavLink
                                href="/split-invoice"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faLayerGroup}
                                  className="h-4 w-4"
                                />
                                Materialbestellung
                              </ActiveNavLink>
                            </>
                          ) : null}
                          <ComingSoonNavItem
                            className={navLinkClassName}
                            icon={faChartPie}
                          >
                            Laser
                          </ComingSoonNavItem>
                          <ComingSoonNavItem
                            className={navLinkClassName}
                            icon={faLayerGroup}
                          >
                            Lagerplatz
                          </ComingSoonNavItem>

                          <p className={navSectionTitleClassName}>Hier entstanden</p>
                          <ActiveNavLink
                            href="/showcase"
                            className={navLinkClassName}
                          >
                            <FontAwesomeIcon
                              icon={faFolderOpen}
                              className="h-4 w-4"
                            />
                            Hier entstanden
                          </ActiveNavLink>

                          {isAuthenticated ? (
                            <>
                              <p className={navSectionTitleClassName}>
                                Inventar
                              </p>
                              <ActiveNavLink
                                href="/resources"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faFolderOpen}
                                  className="h-4 w-4"
                                />
                                Inventar
                              </ActiveNavLink>

                              <p className={navSectionTitleClassName}>Profil</p>
                              <ActiveNavLink
                                href="/account"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faUser}
                                  className="h-4 w-4"
                                />
                                {currentUserDisplayName
                                  ? `Profil (${currentUserDisplayName})`
                                  : "Profil"}
                              </ActiveNavLink>
                              <ActiveNavLink
                                href="/checkout"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faCartShopping}
                                  className="h-4 w-4"
                                />
                                Warenkorb
                              </ActiveNavLink>
                              {canAccessFinanzen ? (
                                <>
                                  <ActiveNavLink
                                    href="/receipts"
                                    className={navLinkClassName}
                                  >
                                    <FontAwesomeIcon
                                      icon={faFolderOpen}
                                      className="h-4 w-4"
                                    />
                                    Belege
                                  </ActiveNavLink>
                                  <ActiveNavLink
                                    href="/balance"
                                    className={navLinkClassName}
                                  >
                                    <FontAwesomeIcon
                                      icon={faWallet}
                                      className="h-4 w-4"
                                    />
                                    Guthaben
                                  </ActiveNavLink>
                                </>
                              ) : null}
                              <ActiveNavLink
                                href="/products"
                                className={navLinkClassName}
                              >
                                <FontAwesomeIcon
                                  icon={faBoxOpen}
                                  className="h-4 w-4"
                                />
                                Produkte
                              </ActiveNavLink>
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
                            </>
                          ) : null}
                        </nav>
                        <div className="knglmrt-border-t px-4 py-4">
                          {isAuthenticated ? (
                            <div className="space-y-3">
                              <ThemeToggle />
                              {canAccessBackOffice ? (
                                <Button
                                  href={adminAreaHref}
                                  kind="secondary"
                                  className="w-full"
                                >
                                  <FontAwesomeIcon
                                    icon={faLock}
                                    className="h-4 w-4"
                                  />
                                  Back-Office
                                </Button>
                              ) : null}
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
                            <div className="space-y-3">
                              <ThemeToggle />
                              <Button
                                href="/login"
                                kind="secondary"
                                className="w-full"
                              >
                                <FontAwesomeIcon
                                  icon={faRightToBracket}
                                  className="h-4 w-4"
                                />
                                Anmelden
                              </Button>
                              <Button
                                href="/register"
                                kind="primary"
                                className={navButtonClassName}
                              >
                                Mitglied werden
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </AutoCloseMenuDetails>
                  </div>
                </div>
              </header>
            }
            desktopNavigation={
              <TopNav
                isAuthenticated={isAuthenticated}
                currentUserDisplayName={currentUserDisplayName}
                adminAreaHref={adminAreaHref}
              />
            }
            footer={<SiteFooter />}
          >
            {children}
          </AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
