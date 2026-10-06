import type { Metadata } from "next";
import heroHelloImage from "./hero-hello.jpg";
import {
  Fira_Sans,
  Fira_Sans_Condensed,
  Fira_Sans_Extra_Condensed,
  Fira_Mono,
  Permanent_Marker,
} from "next/font/google";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mdxeditor/editor/style.css";
import "./globals.css";
import "./knglmrt-theme.css";
import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { getVerwaltungEntryHref } from "./[lang]/admin/ressorts";
import { getServerSession, getServerSessionRoles } from "@/lib/server-session";
import { I18nProvider } from "@/i18n/client";
import { getRequestLocale } from "@/i18n/server";
import { storyOpenSans } from "@/lib/story-fonts";
import AppShell from "./AppShell";
import MobileTopNav from "./MobileTopNav";
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

// Die Handschrift des DS. Trägt genau eine Rolle: das handschriftliche
// Formularfeld (Field kind="hand"), sonst nichts.
const knglmrtHand = Permanent_Marker({
  variable: "--font-knglmrt-hand",
  subsets: ["latin"],
  weight: ["400"],
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
  const adminAreaHref = getVerwaltungEntryHref(userRoles);

  return (
    // Die next/font-Variablen gehören auf <html>: knglmrt-theme.css definiert
    // --font-core/-display/-wide/-narrow auf :root. Lagen die Variablen auf
    // <body>, war var(--font-geist-sans) dort unauflösbar — die Rollen-Tokens
    // wurden ungültig und Body wie Überschriften fielen auf system-ui zurück.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${knglmrtWide.variable} ${knglmrtNarrow.variable} ${knglmrtHand.variable} ${storyOpenSans.variable}`}
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
              <MobileTopNav
                isAuthenticated={isAuthenticated}
                currentUserDisplayName={currentUserDisplayName}
                adminAreaHref={adminAreaHref}
              />
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
