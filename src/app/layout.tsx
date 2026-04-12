import type { Metadata } from "next";
import Link from "next/link";
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
  faCalendarDays,
  faChartPie,
  faFolderOpen,
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
import { getUserRole, roleCanAccessModule } from "@/lib/roles";
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
};

function ProtectedNavItem({
  href,
  icon,
  children,
  className,
  isAccessible,
  tooltip,
}: ProtectedNavItemProps) {
  if (isAccessible) {
    return (
      <ActiveNavLink href={href} className={className}>
        <FontAwesomeIcon icon={icon} className="h-4 w-4" />
        {children}
      </ActiveNavLink>
    );
  }

  return (
    <div
      className={`${className} cursor-not-allowed select-none text-zinc-400 hover:text-zinc-400`}
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);
  const userRole = await getUserRole(supabase, userData.user);
  const canAccessAdmin = isAuthenticated && userRole === "admin";
  const canAccessInvoices =
    isAuthenticated && roleCanAccessModule(userRole, "invoices");
  const navItemClassName =
    "group flex w-full items-center gap-3 border-b border-zinc-200/15 bg-transparent px-6 py-2.5 text-sm font-medium transition last:border-b-0";
  const navLinkClassName =
    "group flex items-center gap-3 border-b border-zinc-200/15 bg-transparent px-2 py-2.5 text-sm font-medium text-zinc-700 transition hover:text-zinc-900";
  const navSectionTitleClassName =
    "px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 first:pt-0";
  const navButtonClassName =
    "flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700";
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
          <ChatwootWidget />
          <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white shadow-sm md:hidden">
              <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
                <Link
                  href="/"
                  className="text-xl font-black uppercase tracking-widest leading-none text-zinc-900 transition hover:text-blue-700"
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
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
                        Menü
                        <span className="text-lg transition group-open:rotate-45">
                          +
                        </span>
                      </summary>
                    }
                  >
                    <div className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-lg">
                      <nav className="flex flex-col px-2 py-2">
                        <p className={navSectionTitleClassName}>
                          Digital Fabrication
                        </p>
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

                        <p className={navSectionTitleClassName}>Self Service</p>
                        <ProtectedNavItem
                          href="/account"
                          className={navLinkClassName}
                          icon={faUser}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Profil
                        </ProtectedNavItem>

                        <p className={navSectionTitleClassName}>Verein</p>

                        <ProtectedNavItem
                          href="/resources"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Inventar
                        </ProtectedNavItem>
                        <ActiveNavLink
                          href="/projects"
                          className={navLinkClassName}
                        >
                          <FontAwesomeIcon
                            icon={faFolderOpen}
                            className="h-4 w-4"
                          />
                          Projekte
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
                        <ProtectedNavItem
                          href="/products"
                          className={navLinkClassName}
                          icon={faBoxOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Produkte
                        </ProtectedNavItem>
                        <p className={navSectionTitleClassName}>buchhaltung</p>
                        <ProtectedNavItem
                          href="/invoices"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={canAccessInvoices}
                          tooltip="Nur fuer Rollen Admin und Accounting verfuegbar"
                        >
                          Rechnungen
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/reimbursement"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Rückerstattung von Auslagen
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/eigenbeleg"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Eigenbeleg erstellen
                        </ProtectedNavItem>
                        <ProtectedNavItem
                          href="/buchungen"
                          className={navLinkClassName}
                          icon={faFolderOpen}
                          isAccessible={isAuthenticated}
                          tooltip={membersOnlyTooltip}
                        >
                          Beleg einbuchen
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
                      </nav>
                      <div className="border-t border-zinc-200 px-4 py-4">
                        {isAuthenticated ? (
                          <div className="space-y-3">
                            {canAccessAdmin ? (
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
            <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col overflow-hidden border-r border-zinc-200 bg-white px-6 py-8 shadow-sm md:flex">
              <div className="space-y-3">
                <div>
                  <Link
                    href="/"
                    className="text-3xl font-black uppercase tracking-widest leading-none text-zinc-900 transition hover:text-blue-700"
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
                <p className="px-6 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Digital Fabrication
                </p>
                <ProtectedNavItem
                  href="/printers"
                  className={navItemClassName}
                  icon={faCube}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  3D-Druck
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/printers/emptying"
                  className={navItemClassName}
                  icon={faPrint}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Drucker entleeren
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/printers/access-codes"
                  className={navItemClassName}
                  icon={faKey}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Drucker Zugangscodes
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/checkout"
                  className={navItemClassName}
                  icon={faCartShopping}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Warenkorb
                </ProtectedNavItem>

                <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Self Service
                </p>
                <ProtectedNavItem
                  href="/account"
                  className={navItemClassName}
                  icon={faUser}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Profil
                </ProtectedNavItem>

                <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Verein
                </p>
                <ActiveNavLink href="/calendar" className={navItemClassName}>
                  <FontAwesomeIcon icon={faCalendarDays} className="h-4 w-4" />
                  Kalender
                </ActiveNavLink>
                <ProtectedNavItem
                  href="/resources"
                  className={navItemClassName}
                  icon={faFolderOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Inventar
                </ProtectedNavItem>
                <ActiveNavLink href="/projects" className={navItemClassName}>
                  <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                  Projekte
                </ActiveNavLink>
                <ProtectedNavItem
                  href="/products"
                  className={navItemClassName}
                  icon={faBoxOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Produkte
                </ProtectedNavItem>

                <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  buchhaltung
                </p>
                <ProtectedNavItem
                  href="/invoices"
                  className={navItemClassName}
                  icon={faFolderOpen}
                  isAccessible={canAccessInvoices}
                  tooltip="Nur fuer Rollen Admin und Accounting verfuegbar"
                >
                  Rechnungen
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/reimbursement"
                  className={navItemClassName}
                  icon={faFolderOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Rückerstattung von Auslagen
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/eigenbeleg"
                  className={navItemClassName}
                  icon={faFolderOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Eigenbeleg erstellen
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/buchungen"
                  className={navItemClassName}
                  icon={faFolderOpen}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Beleg einbuchen
                </ProtectedNavItem>
                <ProtectedNavItem
                  href="/budget"
                  className={navItemClassName}
                  icon={faChartPie}
                  isAccessible={isAuthenticated}
                  tooltip={membersOnlyTooltip}
                >
                  Budget Werkbereiche
                </ProtectedNavItem>
              </nav>
              {isAuthenticated ? (
                <div className="mt-auto space-y-3">
                  {canAccessAdmin ? (
                    <Button
                      href="/admin/users"
                      kind="secondary"
                      className="flex w-full items-center justify-center gap-3 rounded-full px-4 py-2 text-sm font-semibold"
                    >
                      <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
                      Admin
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
              <main className="mx-auto w-full md:px-10 md:py-10">
                {children}
              </main>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
