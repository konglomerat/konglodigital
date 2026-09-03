"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_LOCALE,
  ENGLISH_LOCALE,
  localizePathname,
  normalizeLocale,
  stripLocalePrefix,
} from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import Button, { type ButtonKind } from "@/components/knglmrt/Button";

type LanguageSwitcherProps = {
  className?: string;
  variant?: "default" | "topnav" | "footer";
};

// DE/EN als eckiges Segment: 11px Fira Sans (wide), .08em getrackt, aktive
// Sprache invertiert. Die Taste selbst kommt aus dem DS; hier steht nur, was
// die Sprachwahl daran ändert — der Satz und, im Fuß, die weiße Kontur auf
// dunklem Grund.
const localeTypeClassName =
  "font-wide text-[11px] uppercase leading-[14px] tracking-[.08em]";
const footerLocaleClassName = "border-white";

export default function LanguageSwitcher({
  className,
  variant = "default",
}: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const currentLocale = normalizeLocale(locale);

  const normalizedPathname = stripLocalePrefix(pathname).pathname;
  const search = searchParams.toString();

  const buildHref = (targetLocale: "de" | "en") => {
    const localizedPathname = localizePathname(
      normalizedPathname,
      targetLocale,
    );
    return search ? `${localizedPathname}?${search}` : localizedPathname;
  };

  const switchToLocale = (targetLocale: "de" | "en") => {
    const href = buildHref(targetLocale);
    router.push(href);
    router.refresh();
  };

  // Die Variante bestimmt nur, wie die aktive Sprache markiert wird; Größe,
  // Kontur und Hover kommen aus der Taste.
  const localeButtonKind = (targetLocale: "de" | "en"): ButtonKind =>
    currentLocale === targetLocale ? "primary" : "secondary";

  const localeButtonClassName = (targetLocale: "de" | "en") => {
    const isCurrent = currentLocale === targetLocale;

    if (variant === "footer") {
      return `${localeTypeClassName} ${footerLocaleClassName} ${
        isCurrent
          ? "bg-white font-bold text-[var(--knglmrt-dark-100)] hover:bg-white"
          : "bg-transparent font-normal text-white hover:bg-white/10"
      }`;
    }

    return `${localeTypeClassName} ${isCurrent ? "font-bold" : "font-normal"}`;
  };

  return (
    <div
      className={
        className ??
        (variant === "topnav"
          ? "inline-flex items-center"
          : "inline-flex items-center gap-1")
      }
    >
      <Button
        kind={
          variant === "footer" ? "secondary" : localeButtonKind(DEFAULT_LOCALE)
        }
        size="chip"
        onClick={() => switchToLocale(DEFAULT_LOCALE)}
        className={localeButtonClassName(DEFAULT_LOCALE)}
        aria-current={currentLocale === DEFAULT_LOCALE ? "page" : undefined}
      >
        DE
      </Button>
      <Button
        kind={
          variant === "footer" ? "secondary" : localeButtonKind(ENGLISH_LOCALE)
        }
        size="chip"
        onClick={() => switchToLocale(ENGLISH_LOCALE)}
        className={`${localeButtonClassName(ENGLISH_LOCALE)} ${
          variant === "topnav" || variant === "footer" ? "-ml-px" : ""
        }`}
        aria-current={currentLocale === ENGLISH_LOCALE ? "page" : undefined}
      >
        EN
      </Button>
    </div>
  );
}
