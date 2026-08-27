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

type LanguageSwitcherProps = {
  className?: string;
  variant?: "default" | "topnav" | "footer";
};

const buttonClassName =
  "rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition";

// DE/EN als eckiges Segment: 11px Fira Sans (wide), .08em getrackt,
// aktive Sprache schwarz auf weiß invertiert — Muster aus dem Prototyp.
const topNavButtonClassName =
  "border border-foreground px-2 py-1 font-wide text-[11px] uppercase leading-[14px] tracking-[.08em] transition";
const footerButtonClassName =
  "border border-white px-2 py-1 font-wide text-[11px] uppercase leading-[14px] tracking-[.08em] transition";

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

  const localeButtonClassName = (targetLocale: "de" | "en") => {
    const isCurrent = currentLocale === targetLocale;

    if (variant === "topnav" || variant === "footer") {
      const buttonClass =
        variant === "footer" ? footerButtonClassName : topNavButtonClassName;
      return `${buttonClass} ${
        isCurrent
          ? variant === "footer"
            ? "bg-white font-bold text-[var(--knglmrt-dark-100)]"
            : "bg-foreground font-bold text-background"
          : variant === "footer"
            ? "bg-transparent font-normal text-white hover:bg-white/10"
            : "bg-card font-normal text-foreground hover:bg-primary-soft"
      }`;
    }

    return `${buttonClassName} ${
      isCurrent
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-card text-muted-foreground hover:border-primary-border hover:text-foreground"
    }`;
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
      <button
        type="button"
        onClick={() => switchToLocale(DEFAULT_LOCALE)}
        className={localeButtonClassName(DEFAULT_LOCALE)}
        aria-current={currentLocale === DEFAULT_LOCALE ? "page" : undefined}
      >
        DE
      </button>
      <button
        type="button"
        onClick={() => switchToLocale(ENGLISH_LOCALE)}
        className={`${localeButtonClassName(ENGLISH_LOCALE)} ${
          variant === "topnav" || variant === "footer" ? "-ml-px" : ""
        }`}
        aria-current={currentLocale === ENGLISH_LOCALE ? "page" : undefined}
      >
        EN
      </button>
    </div>
  );
}
