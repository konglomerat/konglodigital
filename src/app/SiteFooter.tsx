// src/app/SiteFooter.tsx — die Fußleiste des Prototyps.
// Dunkle Fläche (dark-100), weiße Wortbildmarke, vier Spalten, Radius 0.
// Login-pflichtige Ziele erscheinen ausgeloggt gar nicht — dieselbe Regel
// wie in der TopNav.
import Image from "next/image";
import Link from "next/link";
import LanguageSwitcher from "./[lang]/components/LanguageSwitcher";

type FooterLink = { href: string; label: string; external?: boolean };

type FooterColumn = { title: string; links: FooterLink[] };

const linkClassName =
  "text-[length:var(--ui-size-body)] leading-[18px] text-white transition hover:text-[var(--knglmrt-pink-60)]";

export default function SiteFooter({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const columns: FooterColumn[] = [
    {
      title: "Verein",
      links: [
        { href: "/verein", label: "Über uns" },
        { href: "/calendar", label: "Kalender" },
        { href: "/volkshaus/buchen", label: "Volkshaus buchen" },
        { href: "/monatsbeitrag", label: "Mitgliedschaft & Beitrag" },
      ],
    },
    {
      title: "Werkstatt",
      links: [
        { href: "/werkbereiche", label: "Werkbereiche" },
        ...(isAuthenticated
          ? [{ href: "/resources", label: "Inventar" }]
          : []),
        { href: "/showcase", label: "Hier entstanden" },
      ],
    },
    {
      title: "Rechtliches",
      links: [
        {
          href: "https://konglomerat.org/impressum",
          label: "Impressum",
          external: true,
        },
        {
          href: "https://konglomerat.org/datenschutz",
          label: "Datenschutz",
          external: true,
        },
        {
          href: "https://support.konglomerat.org",
          label: "Support",
          external: true,
        },
      ],
    },
  ];

  return (
    <footer className="mt-auto bg-[var(--knglmrt-dark-100)] text-white">
      <div className="mx-auto grid w-full max-w-[1240px] gap-7 px-3 py-9 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-7">
        <div className="flex flex-col gap-3">
          <Image
            src="/konglodigital-logo-white.svg"
            alt="Konglo Digital"
            width={112}
            height={34}
            unoptimized
            className="h-[34px] w-auto"
          />
          <p className="max-w-[280px] text-[length:var(--ui-size-body)] leading-[18px] text-[var(--knglmrt-dark-30)]">
            Werkstatt, Self-Service und Verwaltung des Konglomerat e.V. —
            betrieben von den vielen Gesichtern des Vereins.
          </p>
          <LanguageSwitcher variant="footer" />
        </div>

        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-1.5">
            <div className="knglmrt-caption text-[var(--knglmrt-dark-60)]">
              {column.title}
            </div>
            {column.links.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className={linkClassName}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClassName}
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
    </footer>
  );
}
