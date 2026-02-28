import type { Metadata } from "next";
import ActiveNavLink from "./ActiveNavLink";
import { Geist, Geist_Mono } from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCube,
  faBoxOpen,
  faFolderOpen,
  faCalendarCheck,
  faPrint,
  faCartShopping,
  faUser,
  faRightFromBracket,
  faRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import { signOut } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Button from "./components/Button";
import ThemeToggle from "./components/ThemeToggle";

config.autoAddCss = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Konglomerat Digitale Werkstätten",
  description: "Dashboard, products, and checkout",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const isAuthenticated = Boolean(userData.user);
  const navItemClassName =
    "group flex w-full items-center gap-3 border-b border-zinc-200/15 bg-transparent px-6 py-3.5 text-sm font-medium transition last:border-b-0";
  const navLinkClassName =
    "group flex items-center gap-3 border-b border-zinc-200/15 bg-transparent px-2 py-2.5 text-sm font-medium text-zinc-700 transition hover:text-zinc-900";
  const navSectionTitleClassName =
    "px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 first:pt-0";
  const navButtonClassName =
    "flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700";

  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem("theme");var theme=stored?stored:"light";var root=document.documentElement;root.classList.toggle("dark", theme==="dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
          <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white shadow-sm md:hidden">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
              <div className="text-xl font-black uppercase tracking-widest leading-none text-zinc-900">
                Konglo
                <br />
                digital
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50">
                    Menu
                    <span className="text-lg transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white shadow-lg">
                    <nav className="flex flex-col px-2 py-2">
                      <p className={navSectionTitleClassName}>
                        Digital Fabrication
                      </p>
                      <ActiveNavLink href="/" className={navLinkClassName}>
                        <FontAwesomeIcon icon={faCube} className="h-4 w-4" />
                        3D Printing
                      </ActiveNavLink>
                      <ActiveNavLink
                        href="/printers/emptying"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon icon={faPrint} className="h-4 w-4" />
                        Printer Emptying
                      </ActiveNavLink>
                      <ActiveNavLink
                        href="/checkout"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faCartShopping}
                          className="h-4 w-4"
                        />
                        Checkout
                      </ActiveNavLink>

                      <p className={navSectionTitleClassName}>Administration</p>
                      <ActiveNavLink
                        href="/monatsbeitrag"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faCalendarCheck}
                          className="h-4 w-4"
                        />
                        Monatsbeitrag
                      </ActiveNavLink>
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
                      <ActiveNavLink
                        href="/products"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon icon={faBoxOpen} className="h-4 w-4" />
                        Bezahlung (Einkaufen)
                      </ActiveNavLink>
                      {isAuthenticated ? (
                        <ActiveNavLink
                          href="/account"
                          className={navLinkClassName}
                        >
                          <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
                          Account
                        </ActiveNavLink>
                      ) : null}

                      <p className={navSectionTitleClassName}>buchhaltung</p>
                      <ActiveNavLink
                        href="/invoices/new"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faFolderOpen}
                          className="h-4 w-4"
                        />
                        Rechnung erstellen
                      </ActiveNavLink>
                      <ActiveNavLink
                        href="/reimbursement"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faFolderOpen}
                          className="h-4 w-4"
                        />
                        Auslage rückerstatten
                      </ActiveNavLink>
                      <ActiveNavLink
                        href="/eigenbeleg"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faFolderOpen}
                          className="h-4 w-4"
                        />
                        Eigenbeleg erstellen
                      </ActiveNavLink>
                      <ActiveNavLink
                        href="/buchungen"
                        className={navLinkClassName}
                      >
                        <FontAwesomeIcon
                          icon={faFolderOpen}
                          className="h-4 w-4"
                        />
                        Beleg einbuchen
                      </ActiveNavLink>
                    </nav>
                    <div className="border-t border-zinc-200 px-4 py-4">
                      {isAuthenticated ? (
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
                            Sign out
                          </Button>
                        </form>
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
                          Sign in
                        </Button>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </header>
          <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-zinc-200 bg-white px-6 py-8 shadow-sm md:flex">
            <div className="space-y-3">
              <div>
                <div className="text-3xl font-black uppercase tracking-widest leading-none text-zinc-900">
                  Konglo
                  <br />
                  digital
                </div>
              </div>
              <ThemeToggle />
            </div>
            <nav className="-mx-6 mt-6 flex flex-1 flex-col">
              <p className="px-6 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Digital Fabrication
              </p>
              <ActiveNavLink href="/" className={navItemClassName}>
                <FontAwesomeIcon icon={faCube} className="h-4 w-4" />
                3D Printing
              </ActiveNavLink>
              <ActiveNavLink
                href="/printers/emptying"
                className={navItemClassName}
              >
                <FontAwesomeIcon icon={faPrint} className="h-4 w-4" />
                Printer Emptying
              </ActiveNavLink>
              <ActiveNavLink href="/checkout" className={navItemClassName}>
                <FontAwesomeIcon icon={faCartShopping} className="h-4 w-4" />
                Checkout
              </ActiveNavLink>

              <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Administration
              </p>
              <ActiveNavLink href="/monatsbeitrag" className={navItemClassName}>
                <FontAwesomeIcon icon={faCalendarCheck} className="h-4 w-4" />
                Monatsbeitrag
              </ActiveNavLink>
              <ActiveNavLink href="/resources" className={navItemClassName}>
                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                Inventar
              </ActiveNavLink>
              <ActiveNavLink href="/products" className={navItemClassName}>
                <FontAwesomeIcon icon={faBoxOpen} className="h-4 w-4" />
                Bezahlung (Einkaufen)
              </ActiveNavLink>
              {isAuthenticated ? (
                <ActiveNavLink href="/account" className={navItemClassName}>
                  <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
                  Account
                </ActiveNavLink>
              ) : null}

              <p className="px-6 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                buchhaltung
              </p>
              <ActiveNavLink href="/invoices/new" className={navItemClassName}>
                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                Rechnung erstellen
              </ActiveNavLink>
              <ActiveNavLink
                href="/reimbursement"
                className={navItemClassName}
              >
                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                Auslage rückerstatten
              </ActiveNavLink>
              <ActiveNavLink href="/eigenbeleg" className={navItemClassName}>
                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                Eigenbeleg erstellen
              </ActiveNavLink>
              <ActiveNavLink href="/buchungen" className={navItemClassName}>
                <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                Beleg einbuchen
              </ActiveNavLink>
            </nav>
            {isAuthenticated ? (
              <div className="mt-auto">
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
                    Sign out
                  </Button>
                </form>
              </div>
            ) : (
              <Button
                href="/login"
                kind="primary"
                className={navButtonClassName}
              >
                <FontAwesomeIcon icon={faRightToBracket} className="h-4 w-4" />
                Sign in
              </Button>
            )}
          </aside>
          <div className="ml-0 md:ml-64">
            <main className="mx-auto w-full md:px-10 md:py-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
