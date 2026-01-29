import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { signOut } from "./actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
          <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r border-zinc-200 bg-white px-6 py-8">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              Navigation
            </div>
            <nav className="mt-6 flex flex-1 flex-col gap-3 text-sm font-semibold text-zinc-700">
              <Link
                href="/"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                3D printing
              </Link>
              <Link
                href="/products"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                Campai Products
              </Link>
              <Link
                href="/resources"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                Campai Resources
              </Link>
              <Link
                href="/monatsbeitrag"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                Monatsbeitrag
              </Link>
              <Link
                href="/printers/emptying"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                Printer Emptying
              </Link>
              <Link
                href="/checkout"
                className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
              >
                Checkout
              </Link>
              {isAuthenticated ? (
                <div className="mt-auto">
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="w-full rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full border border-zinc-200 px-4 py-2 text-center hover:bg-zinc-50"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </aside>
          <div className="ml-60">
            <main className="mx-auto w-full max-w-7xl px-8 py-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
