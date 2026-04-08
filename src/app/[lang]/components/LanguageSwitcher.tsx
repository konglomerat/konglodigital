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
};

const buttonClassName =
  "rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition";

export default function LanguageSwitcher({
  className,
}: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const currentLocale = normalizeLocale(locale);

  const normalizedPathname = stripLocalePrefix(pathname).pathname;
  const search = searchParams.toString();

  const buildHref = (targetLocale: "de" | "en") => {
    const localizedPathname = localizePathname(normalizedPathname, targetLocale);
    return search ? `${localizedPathname}?${search}` : localizedPathname;
  };

  const switchToLocale = (targetLocale: "de" | "en") => {
    const href = buildHref(targetLocale);
    router.push(href);
    router.refresh();
  };

  return (
    <div className={className ?? "inline-flex items-center gap-1"}>
      <button
        type="button"
        onClick={() => switchToLocale(DEFAULT_LOCALE)}
        className={`${buttonClassName} ${
          currentLocale === DEFAULT_LOCALE
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
        }`}
        aria-current={currentLocale === DEFAULT_LOCALE ? "page" : undefined}
      >
        DE
      </button>
      <button
        type="button"
        onClick={() => switchToLocale(ENGLISH_LOCALE)}
        className={`${buttonClassName} ${
          currentLocale === ENGLISH_LOCALE
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-zinc-300 text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
        }`}
        aria-current={currentLocale === ENGLISH_LOCALE ? "page" : undefined}
      >
        EN
      </button>
    </div>
  );
}
