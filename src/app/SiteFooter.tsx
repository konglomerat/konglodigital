import { getServerI18n } from "@/i18n/server";
// src/app/SiteFooter.tsx — die Fußleiste des Prototyps.
// Dunkle Fläche (dark-100), Radius 0, eine einzige flache Zeile:
// Sprachumschalter, Beschreibung, rechtliche Links und die Wortmarke.
import Image from "next/image";
import Link from "next/link";
import LanguageSwitcher from "./[lang]/components/LanguageSwitcher";
import type { SiteNavItem } from "@/lib/payload-navigation";

const linkClassName =
  "text-[length:var(--ui-size-body)] leading-[18px] text-white transition hover:text-[var(--knglmrt-pink-60)]";

export default async function SiteFooter({ links }: { links: SiteNavItem[] }) {
  const { tx } = await getServerI18n();
  return (
    <footer className="mt-auto bg-[var(--knglmrt-dark-100)] text-white">
      <div className="mx-auto flex w-full max-w-[1600px] items-stretch gap-6 px-3 py-4 md:px-7">
        <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
          <LanguageSwitcher variant="footer" />
          <p className="max-w-[360px] text-[length:var(--ui-size-body)] leading-[18px] text-[var(--knglmrt-dark-30)]">
            {tx("Werkstatt, Self-Service und Verwaltung des Konglomerat e.V.")}
          </p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {links.map((link, index) =>
              link.href.startsWith("/") ? (
                <Link
                  key={`${link.href}-${index}`}
                  href={link.href}
                  target={link.newTab ? "_blank" : undefined}
                  rel={link.newTab ? "noopener noreferrer" : undefined}
                  className={linkClassName}
                >
                  {tx(link.label)}
                </Link>
              ) : (
                <a
                  key={`${link.href}-${index}`}
                  href={link.href}
                  target={link.newTab ? "_blank" : undefined}
                  rel={link.newTab ? "noopener noreferrer" : undefined}
                  className={linkClassName}
                >
                  {tx(link.label)}
                </a>
              ),
            )}
          </nav>
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
