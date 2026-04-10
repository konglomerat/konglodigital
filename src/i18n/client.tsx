"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createInstance, type TOptionsBase, type i18n } from "i18next";
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from "react-i18next";
import {
  DEFAULT_NAMESPACE,
  DEFAULT_LOCALE,
  SUPPORTED_NAMESPACES,
  SUPPORTED_LOCALES,
  normalizeLocale,
  stripLocalePrefix,
  type Locale,
  type Namespace,
} from "./config";
import { getI18nResources } from "./dictionaries";
import { buildTranslationKey } from "./key";

type TranslateOptions = TOptionsBase & Record<string, unknown>;

const createClientInstance = (locale: Locale): i18n => {
  const instance = createInstance();
  instance.use(initReactI18next);

  void instance.init({
    resources: getI18nResources(),
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [...SUPPORTED_NAMESPACES],
    supportedLngs: [...SUPPORTED_LOCALES],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

  return instance;
};

type I18nProviderProps = {
  locale: Locale;
  children: React.ReactNode;
};

export function I18nProvider({ locale, children }: I18nProviderProps) {
  const normalizedLocale = normalizeLocale(locale);
  const pathname = usePathname() ?? "/";
  const localeFromPath = stripLocalePrefix(pathname).localeFromPath;
  const activeLocale = normalizeLocale(localeFromPath ?? normalizedLocale);
  const [i18nInstance] = useState<i18n>(() =>
    createClientInstance(normalizedLocale),
  );

  useEffect(() => {
    if (i18nInstance.resolvedLanguage !== activeLocale) {
      void i18nInstance.changeLanguage(activeLocale);
    }

    if (document.documentElement.lang !== activeLocale) {
      document.documentElement.lang = activeLocale;
    }
  }, [activeLocale, i18nInstance]);

  return <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>;
}

export const useI18n = (defaultNamespace: Namespace = DEFAULT_NAMESPACE) => {
  const { t, i18n } = useTranslation();

  const tx = useCallback(
    (
      sourceText: string,
      sourceLocaleOrOptions?: Locale | TranslateOptions,
      options?: TranslateOptions,
    ): string => {
      const resolvedOptions =
        typeof sourceLocaleOrOptions === "string"
          ? options
          : sourceLocaleOrOptions;

      return t(buildTranslationKey(sourceText), {
        ns: defaultNamespace,
        defaultValue: sourceText,
        ...(resolvedOptions ?? {}),
      });
    },
    [defaultNamespace, t],
  );

  return {
    t,
    tx,
    locale: normalizeLocale(i18n.resolvedLanguage),
  };
};
