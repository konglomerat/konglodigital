import { getPayloadPagePath } from "./payload-page-path";
import { localizePathname, stripLocalePrefix } from "../i18n/config";

type CmsRedirect = {
  from?: string;
  to?: {
    type?: string;
    url?: string;
    reference?: {
      relationTo?: string;
      value?: { slug?: string } | number | null;
    };
  };
};

export type RedirectMap = Map<string, string>;
const CACHE_MS = 60_000;

function safePath(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !/[\\\s?#]/.test(value)
  );
}

export function buildCmsRedirectMap(docs: CmsRedirect[]): RedirectMap {
  const result: RedirectMap = new Map();
  for (const doc of docs) {
    if (typeof doc.from !== "string" || !safePath(doc.from)) continue;
    let target = doc.to?.type === "custom" ? doc.to.url : undefined;
    if (doc.to?.type === "reference") {
      const reference = doc.to.reference;
      const slug =
        typeof reference?.value === "object" ? reference.value?.slug : null;
      if (slug && /^[a-z0-9_-]+$/.test(slug)) {
        const path =
          reference?.relationTo === "pages"
            ? getPayloadPagePath(slug)
            : reference?.relationTo === "posts"
              ? `/showcase/${slug}`
              : null;
        if (path)
          target = localizePathname(
            path,
            stripLocalePrefix(doc.from).localeFromPath ?? "de",
          );
      }
    }
    if (typeof target !== "string" || /[\\\s\u0000-\u001f]/.test(target))
      continue;
    if (
      !(target.startsWith("/") && !target.startsWith("//")) &&
      !/^https?:\/\//.test(target)
    )
      continue;
    try {
      const parsed = new URL(target, "https://redirect.invalid");
      if (parsed.username || parsed.password) continue;
      result.set(doc.from, target);
    } catch {
      /* Ignore malformed editor input. */
    }
  }
  return result;
}

/** Resolve exact paths, collapse chains, preserve query parameters, reject loops. */
export function resolveCmsRedirect(
  requestUrl: URL,
  redirects: RedirectMap,
): URL | null {
  let current = new URL(requestUrl);
  const seen = new Set<string>();
  for (let hop = 0; hop < 10; hop++) {
    if (seen.has(current.pathname)) return null;
    seen.add(current.pathname);
    const target = redirects.get(current.pathname);
    if (!target) return hop ? current : null;
    const destination = new URL(target, current.origin);
    for (const key of new Set(current.searchParams.keys())) {
      if (!destination.searchParams.has(key)) {
        for (const value of current.searchParams.getAll(key))
          destination.searchParams.append(key, value);
      }
    }
    if (destination.origin !== requestUrl.origin) return destination;
    current = destination;
  }
  return null;
}

/** Middleware has no Next Data Cache. A bounded process cache avoids a CMS call per page. */
export function createCmsRedirectLoader(
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  let cached: RedirectMap = new Map();
  let expiresAt = 0;
  let cachedBase = "";
  let pending: Promise<RedirectMap> | null = null;
  return async (base: string): Promise<RedirectMap> => {
    if (!base.trim()) return new Map();
    if (cachedBase !== base) {
      cachedBase = base;
      expiresAt = 0;
      cached = new Map();
    }
    if (now() < expiresAt) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const docs: CmsRedirect[] = [];
        const signal = AbortSignal.timeout(2500);
        for (let page = 1; page <= 10; page++) {
          const url = new URL("/api/redirects", base);
          url.search = new URLSearchParams({
            limit: "1000",
            depth: "1",
            page: String(page),
          }).toString();
          const response = await fetcher(url, {
            cache: "no-store",
            signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error("CMS redirects unavailable");
          const data = await response.json();
          if (!Array.isArray(data.docs))
            throw new Error("Invalid CMS redirects response");
          docs.push(...data.docs);
          if (!data.hasNextPage) {
            cached = buildCmsRedirectMap(docs);
            expiresAt = now() + CACHE_MS;
            return cached;
          }
        }
        throw new Error("CMS redirect limit exceeded");
      } catch {
        // CMS outages must not block the website or keep removed redirects alive.
        cached = new Map();
        expiresAt = now() + 10_000;
        return cached;
      }
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

export const loadCmsRedirects = createCmsRedirectLoader();
