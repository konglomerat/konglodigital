import {
  DEFAULT_NAMESPACE,
  SUPPORTED_NAMESPACES,
  type Locale,
  type Namespace,
} from "./config";
import baseDe from "./locales/de.json";
import baseEn from "./locales/en.json";
import generatedDe from "./generated/de.json";
import generatedEn from "./generated/en.json";

type Dictionary = Record<string, string>;
type NamespacedDictionary = Record<Namespace, Dictionary>;

const normalizeNamespacedDictionary = (value: unknown): NamespacedDictionary => {
  const result = {
    konglodigital: {},
    resources: {},
  } satisfies NamespacedDictionary;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  const input = value as Record<string, unknown>;

  SUPPORTED_NAMESPACES.forEach((namespace) => {
    const namespaceValue = input[namespace];
    if (!namespaceValue || typeof namespaceValue !== "object") {
      return;
    }

    const entries = Object.entries(namespaceValue as Record<string, unknown>)
      .filter(([, entryValue]) => typeof entryValue === "string")
      .map(([key, entryValue]) => [key, entryValue as string]);

    result[namespace] = Object.fromEntries(entries);
  });

  const hasExplicitNamespaces = SUPPORTED_NAMESPACES.some((namespace) =>
    Boolean(input[namespace] && typeof input[namespace] === "object"),
  );

  if (!hasExplicitNamespaces) {
    const flatEntries = Object.entries(input)
      .filter(([, entryValue]) => typeof entryValue === "string")
      .map(([key, entryValue]) => [key, entryValue as string]);
    result[DEFAULT_NAMESPACE] = Object.fromEntries(flatEntries);
  }

  return result;
};

const dictionaries = {
  de: (() => {
    const base = normalizeNamespacedDictionary(baseDe);
    const generated = normalizeNamespacedDictionary(generatedDe);
    return {
      konglodigital: {
        ...base.konglodigital,
        ...generated.konglodigital,
      },
      resources: {
        ...base.resources,
        ...generated.resources,
      },
    } satisfies NamespacedDictionary;
  })(),
  en: (() => {
    const base = normalizeNamespacedDictionary(baseEn);
    const generated = normalizeNamespacedDictionary(generatedEn);
    return {
      konglodigital: {
        ...base.konglodigital,
        ...generated.konglodigital,
      },
      resources: {
        ...base.resources,
        ...generated.resources,
      },
    } satisfies NamespacedDictionary;
  })(),
} satisfies Record<Locale, NamespacedDictionary>;

export const getI18nResources = () => {
  return {
    de: {
      konglodigital: dictionaries.de.konglodigital,
      resources: dictionaries.de.resources,
    },
    en: {
      konglodigital: dictionaries.en.konglodigital,
      resources: dictionaries.en.resources,
    },
  };
};

export const getDictionary = (
  locale: Locale,
  namespace: Namespace = DEFAULT_NAMESPACE,
): Dictionary => {
  return dictionaries[locale][namespace];
};
