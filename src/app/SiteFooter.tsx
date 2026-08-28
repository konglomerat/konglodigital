// src/app/SiteFooter.tsx — die Fußleiste des Prototyps.
// Dunkle Fläche (dark-100), Radius 0, eine einzige flache Zeile:
// Sprachumschalter, Beschreibung, rechtliche Links und die Wortmarke.
import Image from "next/image";
import Link from "next/link";
import LanguageSwitcher from "./[lang]/components/LanguageSwitcher";

// `internal` unterscheidet die eigenen Seiten von konglomerat.org: die einen
// laufen über next/link, die anderen öffnen in einem neuen Tab.
type FooterLink = { href: string; label: string; internal?: boolean };

const legalLinks: FooterLink[] = [
  { href: "https://konglomerat.org/impressum", label: "Impressum" },
  { href: "https://konglomerat.org/datenschutz", label: "Datenschutz" },
  { href: "https://support.konglomerat.org", label: "Support" },
  { href: "/design-system", label: "Design System", internal: true },
];

const linkClassName =
  "text-[length:var(--ui-size-body)] leading-[18px] text-white transition hover:text-[var(--knglmrt-pink-60)]";

export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-[var(--knglmrt-dark-100)] text-white">
      <div className="mx-auto flex w-full max-w-[1600px] items-stretch gap-6 px-3 py-4 md:px-7">
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
          <LanguageSwitcher variant="footer" />
          <p className="max-w-[360px] text-[length:var(--ui-size-body)] leading-[18px] text-[var(--knglmrt-dark-30)]">
            Werkstatt, Self-Service und Verwaltung des Konglomerat e.V.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {legalLinks.map((link) =>
              link.internal ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClassName}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className={linkClassName}
                >
                  {link.label}
                </a>
              ),
            )}
          </div>
        </div>

        <Image
          src="/branding/logo/KNGLMRT_Wortmarke.svg"
          alt=""
          aria-hidden
          width={136}
          height={52}
          unoptimized
          className="hidden h-[40px] w-auto self-center object-contain invert md:block"
        />
      </div>
    </footer>
  );
}
