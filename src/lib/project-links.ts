export type ProjectLink = {
  label: string;
  url: string;
};

const MAX_PROJECT_LINKS = 8;

const readText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:" &&
      parsed.protocol !== "mailto:"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const defaultLabelForUrl = (url: string) => {
  if (url.startsWith("/") || url.startsWith("#")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mailto:") {
      return parsed.pathname || url;
    }

    return parsed.hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
};

export const normalizeProjectLinks = (value: unknown): ProjectLink[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const links = value
    .map((entry): ProjectLink | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const normalizedUrl = normalizeUrl(
        readText(record.url ?? record.href ?? record.link),
      );

      if (!normalizedUrl) {
        return null;
      }

      const label =
        readText(record.label ?? record.title ?? record.name) ||
        defaultLabelForUrl(normalizedUrl);

      return {
        label,
        url: normalizedUrl,
      };
    })
    .filter((entry): entry is ProjectLink => entry !== null)
    .slice(0, MAX_PROJECT_LINKS);

  return Array.from(
    new Map(links.map((link) => [`${link.label}|${link.url}`, link])).values(),
  );
};

export const parseProjectLinksJson = (value: string | null | undefined) => {
  if (!value?.trim()) {
    return [] as ProjectLink[];
  }

  try {
    return normalizeProjectLinks(JSON.parse(value) as unknown);
  } catch {
    return [] as ProjectLink[];
  }
};
