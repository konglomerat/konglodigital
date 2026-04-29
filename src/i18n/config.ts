export const SUPPORTED_LOCALES = ["de", "en"] as const;
export const SUPPORTED_NAMESPACES = ["konglodigital", "resources"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type Namespace = (typeof SUPPORTED_NAMESPACES)[number];

export const DEFAULT_LOCALE: Locale = "de";
export const ENGLISH_LOCALE: Locale = "en";
export const DEFAULT_NAMESPACE: Namespace = "konglodigital";
export const RESOURCES_NAMESPACE: Namespace = "resources";
export const LOCALE_COOKIE_NAME = "locale";
export const LOCALE_HEADER_NAME = "x-locale";

export const isSupportedLocale = (
  value: string | null | undefined,
): value is Locale => {
  return Boolean(value && SUPPORTED_LOCALES.includes(value as Locale));
};

export const normalizeLocale = (value: string | null | undefined): Locale => {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
};

export const isSupportedNamespace = (
  value: string | null | undefined,
): value is Namespace => {
  return Boolean(value && SUPPORTED_NAMESPACES.includes(value as Namespace));
};

export const normalizeNamespace = (
  value: string | null | undefined,
): Namespace => {
  return isSupportedNamespace(value) ? value : DEFAULT_NAMESPACE;
};

export const resolveNamespaceForFilePath = (filePath: string): Namespace => {
  return (
    filePath.includes("/src/app/resources/") ||
    filePath.includes("/src/app/[lang]/resources/")
  )
    ? RESOURCES_NAMESPACE
    : DEFAULT_NAMESPACE;
};

type StripLocalePrefixResult = {
  pathname: string;
  localeFromPath: Locale | null;
  hadPrefix: boolean;
};

export const stripLocalePrefix = (pathname: string): StripLocalePrefixResult => {
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (!isSupportedLocale(firstSegment)) {
    return {
      pathname,
      localeFromPath: null,
      hadPrefix: false,
    };
  }

  const nextPathname = `/${segments.slice(1).join("/")}`;

  return {
    pathname: nextPathname === "/" ? "/" : nextPathname,
    localeFromPath: firstSegment,
    hadPrefix: true,
  };
};

export const localizePathname = (pathname: string, locale: Locale): string => {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (locale === DEFAULT_LOCALE) {
    return normalizedPathname;
  }

  if (normalizedPathname === "/") {
    return `/${locale}`;
  }

  return `/${locale}${normalizedPathname}`;
};
