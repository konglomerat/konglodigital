import { cookies, headers } from "next/headers";
import { createInstance, type TOptionsBase } from "i18next";
import {
  DEFAULT_NAMESPACE,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  SUPPORTED_NAMESPACES,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  normalizeLocale,
  type Locale,
  type Namespace,
} from "./config";
import { getI18nResources } from "./dictionaries";
import { buildTranslationKey } from "./key";

type TranslateOptions = TOptionsBase & Record<string, unknown>;

export const getRequestLocale = async (): Promise<Locale> => {
  const requestHeaders = await headers();
  const localeFromHeader = requestHeaders.get(LOCALE_HEADER_NAME);

  if (isSupportedLocale(localeFromHeader)) {
    return localeFromHeader;
  }

  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
};

const createServerInstance = async (locale: Locale) => {
  const instance = createInstance();

  await instance.init({
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

export const getServerI18n = async (
  defaultNamespace: Namespace = DEFAULT_NAMESPACE,
) => {
  const locale = await getRequestLocale();
  const i18n = await createServerInstance(locale);

  const tx = (
    sourceText: string,
    sourceLocaleOrOptions?: Locale | TranslateOptions,
    options?: TranslateOptions,
  ): string => {
    const resolvedOptions =
      typeof sourceLocaleOrOptions === "string"
        ? options
        : sourceLocaleOrOptions;

    return i18n.t(buildTranslationKey(sourceText), {
      ns: defaultNamespace,
      defaultValue: sourceText,
      ...(resolvedOptions ?? {}),
    });
  };

  return {
    locale,
    t: i18n.t.bind(i18n),
    tx,
  };
};
