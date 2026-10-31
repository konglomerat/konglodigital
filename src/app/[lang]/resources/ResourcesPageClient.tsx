"use client";
/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faFilePdf,
  faGrip,
  faList,
  faMap,
  faPlus,
  faSliders,
  faWrench,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import {
  localizePathname,
  RESOURCES_NAMESPACE,
  type Locale,
} from "@/i18n/config";
import Button from "@/components/knglmrt/Button";
import Notice from "@/components/knglmrt/Notice";
import SearchField from "@/components/knglmrt/SearchField";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import ResourcesMapView from "./ResourcesMapView";
import ResourcesTable, { ResourcesTableSkeleton } from "./ResourcesTable";
import { RESOURCE_TYPES } from "./resource-types";
import {
  getResourcePosterUrl,
  getResourceMediaKindFromUrl,
  getResourcePreviewUrl,
} from "@/lib/resource-media";
import { SHOWCASE_RESOURCE_TYPE } from "@/lib/showcase-resource-type";
import { INVENTORY_HOME, INVENTORY_URL } from "@/lib/openinventory-contract";
import Choice from "@/components/knglmrt/Choice";

type Resource = ResourcePayload;

type ViewMode = "grid" | "list" | "map";

// Raster, Zeile neben der Karte. Die Liste ist eine Tabelle (ResourcesTable).
type ResourceItemLayout = "grid" | "compact";

type ResourceItemProps = {
  resource: Resource;
  layout: ResourceItemLayout;
  normalizedSearchTerm: string;
  locale: Locale;
  tx: (key: string, sourceLocale?: Locale) => string;
  onHover: (resourceId: string | null) => void;
  onNavigate?: () => void;
};

type ResourcesDataPayload = {
  resources: Resource[];
  count: number | null;
  errorMessage: string | null;
};

type ResourcesPageClientProps = {
  resourcesPromise: Promise<ResourcesDataPayload>;
  mapBasemapResourcesPromise: Promise<{ resources: Resource[] }>;
  initialQueryText: string;
  initialResourceType: string;
};

type ResourcesListResponse = {
  resources?: Resource[];
  count?: number;
  error?: string;
};

const RESOURCES_PAGE_SIZE = 100;

const highlightText = (text: string, term: string): ReactNode => {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return text;
  }
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedTerm})`, "ig");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-highlight px-0.5 text-highlight-foreground"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
};

const truncateText = (text: string, maxLength: number) => {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const getSupabaseThumbnailUrl = (url: string, width = 700) => {
  try {
    if (url.startsWith("/api/openinventory/media/")) return `${url}?w=640`;
    const marker = "/storage/v1/object/public/";
    if (!url.includes(marker)) {
      return url;
    }
    if (url.includes("/storage/v1/render/image/")) {
      return url;
    }
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) {
      return url;
    }
    const objectPath = parsed.pathname.slice(markerIndex + marker.length);
    const renderUrl = new URL(
      `${parsed.origin}/storage/v1/render/image/public/${objectPath}`,
    );
    renderUrl.searchParams.set("width", String(width));
    renderUrl.searchParams.set("resize", "contain");
    return renderUrl.toString();
  } catch {
    return url;
  }
};

const getResourceSlides = (resource: Resource) => {
  const media = resource.images?.length
    ? resource.images
    : resource.image
      ? [resource.image]
      : [];
  return media.map((url) => {
    const kind = getResourceMediaKindFromUrl(url);
    if (kind === "document") {
      return { kind, url };
    }
    if (kind === "image") {
      return { kind, url: getSupabaseThumbnailUrl(url, 700) };
    }
    if (kind === "video") {
      return {
        kind,
        url:
          getResourcePosterUrl(url, resource.mediaPosters) ??
          getResourcePreviewUrl(url, resource.mediaPreviews) ??
          url,
      };
    }
    return {
      kind,
      url: getResourcePreviewUrl(url, resource.mediaPreviews) ?? url,
    };
  });
};

const THUMB_CLASSNAME: Record<ResourceItemLayout, string> = {
  grid: "w-full",
  compact: "w-24 shrink-0",
};

// Blätterpfeile bleiben leise: erst beim Hover, klein, halbtransparent.
const slideButtonClassName =
  "relative z-10 flex h-7 w-7 cursor-pointer items-center justify-center bg-card/80 text-foreground opacity-0 transition-opacity duration-200 hover:bg-card focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)] group-hover:opacity-100";

// Kompakte Karte nach dem Inventar-Entwurf: quadratisches Foto (die Quellen
// sind quadratisch), darunter Titel und eine Zeile Beschreibung; Hover legt eine pinke Kontur innen an. Der Link liegt
// über der ganzen Karte, die Blätterpfeile darüber.
const ResourceItem = ({
  resource,
  layout,
  normalizedSearchTerm,
  locale,
  tx,
  onHover,
  onNavigate,
}: ResourceItemProps) => {
  const slides = getResourceSlides(resource);
  const [activeIndex, setActiveIndex] = useState(0);
  const canBrowse = slides.length > 1 && layout !== "compact";
  const resourcePath = localizePathname(buildResourcePath(resource), locale);

  const step = (direction: 1 | -1) => {
    setActiveIndex(
      (previous) => (previous + direction + slides.length) % slides.length,
    );
  };

  return (
    <article
      onMouseEnter={() => onHover(resource.id)}
      onMouseLeave={() => onHover(null)}
      className={`group relative bg-card transition-shadow duration-200 ease-[cubic-bezier(.2,0,0,1)] hover:shadow-[inset_0_0_0_3px_var(--primary)] has-[a:focus-visible]:shadow-[inset_0_0_0_3px_var(--primary)] ${
        layout === "grid"
          ? "flex flex-col gap-2.5 p-2.5"
          : "flex items-center gap-3 p-2"
      }`}
    >
      <div
        className={`${THUMB_CLASSNAME[layout]} relative aspect-square overflow-hidden`}
      >
        {slides.length > 0 ? (
          <div
            className="flex h-full transition-transform duration-200 ease-[cubic-bezier(.2,0,0,1)]"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {slides.map((slide, index) => (
              <div
                key={`${resource.id}-slide-${index}`}
                className="h-full w-full shrink-0"
              >
                {slide.kind === "document" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-destructive-soft text-destructive">
                    <FontAwesomeIcon icon={faFilePdf} className="h-8 w-8" />
                    <span className="knglmrt-tag mt-2">PDF</span>
                  </div>
                ) : getResourceMediaKindFromUrl(slide.url) === "video" ? (
                  <video src={slide.url} muted loop playsInline autoPlay preload="metadata" className="block h-full w-full object-contain" />
                ) : (
                  <img
                    src={slide.url}
                    alt=""
                    loading="lazy"
                    className="block h-full w-full object-contain"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center knglmrt-border border-border">
            <span className="knglmrt-tag text-muted-foreground">
              {tx("No image")}
            </span>
          </div>
        )}

        {canBrowse ? (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-1.5">
              <button
                type="button"
                aria-label={tx("Previous image")}
                onClick={() => step(-1)}
                className={`${slideButtonClassName} pointer-events-auto`}
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={tx("Next image")}
                onClick={() => step(1)}
                className={`${slideButtonClassName} pointer-events-auto`}
              >
                <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
              </button>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-1.5 left-0 right-0 flex justify-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              {slides.map((_, index) => (
                <span
                  key={`${resource.id}-dot-${index}`}
                  className={`h-1.5 w-1.5 ${
                    index === activeIndex ? "bg-foreground" : "bg-foreground/25"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div
        className={`flex min-w-0 flex-col gap-0.5 ${
          layout === "grid" ? "px-0.5" : ""
        }`}
      >
        <h3
          className={`text-pretty text-foreground ${
            layout === "compact"
              ? "text-[length:var(--ui-size-body)] font-semibold leading-[var(--ui-line-body)]"
              : "knglmrt-card-title"
          }`}
        >
          <Link
            href={resourcePath}
            onClick={onNavigate}
            onFocus={() => onHover(resource.id)}
            onBlur={() => onHover(null)}
            className="focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
          >
            {highlightText(resource.name, normalizedSearchTerm)}
          </Link>
        </h3>
        {resource.description ? (
          <p className="line-clamp-1 text-muted-foreground">
            {highlightText(
              truncateText(resource.description, 80),
              normalizedSearchTerm,
            )}
          </p>
        ) : null}
      </div>
    </article>
  );
};

type ToolsMenuItem = { label: string; hint: string } & (
  | { href: string }
  | { onClick: () => void; disabled?: boolean }
);

// Werkzeuge hinter dem Schraubenschlüssel: alles, was nur Pflegende brauchen.
const ToolsMenu = ({
  label,
  items,
}: {
  label: string;
  items: ToolsMenuItem[];
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const itemClassName =
    "flex w-full cursor-pointer flex-col gap-0.5 border-b-[length:var(--hairline-width)] border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-primary-soft focus-visible:bg-primary-soft focus-visible:outline-none disabled:cursor-default disabled:opacity-45";
  const itemBody = (item: ToolsMenuItem) => (
    <>
      <span className="font-semibold text-foreground">{item.label}</span>
      <span className="text-[15px] leading-5 text-muted-foreground">
        {item.hint}
      </span>
    </>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className={`flex h-11 w-11 cursor-pointer items-center justify-center knglmrt-border text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
          open ? "bg-primary-soft" : "bg-card"
        }`}
      >
        <FontAwesomeIcon icon={faWrench} className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 flex min-w-[280px] flex-col knglmrt-border bg-card"
        >
          {items.map((item) =>
            "href" in item ? (
              <Link
                key={item.label}
                role="menuitem"
                href={item.href}
                onClick={() => setOpen(false)}
                className={itemClassName}
              >
                {itemBody(item)}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={itemClassName}
              >
                {itemBody(item)}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
};

const RESOURCE_SKELETON_COUNT = 8;

const ResourceItemSkeleton = () => (
  <div className="flex animate-pulse flex-col gap-2.5 p-2.5">
    <div className="aspect-square w-full bg-muted" />
    <div className="h-5 w-2/3 bg-muted" />
    <div className="h-4 w-full bg-muted" />
  </div>
);

// Ab 1100px steht die Karte im Raster gleich daneben.
const WIDE_QUERY = "(min-width: 1100px)";

function subscribeToWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function ResourcesPageClient({
  resourcesPromise,
  mapBasemapResourcesPromise,
  initialQueryText,
  initialResourceType,
}: ResourcesPageClientProps) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const overviewStorageKey = "resourcesOverviewState";
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hasInitializedRef = useRef(false);
  const resultsScrollRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<string>("");
  const lastTypeRef = useRef<string>("");
  const lastMapRef = useRef<string>("");
  const lastWithinRef = useRef<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResourceType, setSelectedResourceType] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterOpen, setFilterOpen] = useState(false);
  const [hoveredResourceId, setHoveredResourceId] = useState<string | null>(
    null,
  );
  const [pendingScrollY, setPendingScrollY] = useState<number | null>(null);
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const [hasAppliedScroll, setHasAppliedScroll] = useState(false);
  const [filterByMapView, setFilterByMapView] = useState(false);
  const [includeWithinPolygons, setIncludeWithinPolygons] = useState(false);
  const [visibleMapResourceIds, setVisibleMapResourceIds] = useState<string[]>(
    [],
  );
  const [hasMapVisibilitySnapshot, setHasMapVisibilitySnapshot] =
    useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mapBasemapResources, setMapBasemapResources] = useState<Resource[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const normalizedSearchTerm = searchTerm.trim();
  const resourceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .map((resource) => resource.type?.trim())
            .filter(
              (resourceType): resourceType is string =>
                typeof resourceType === "string" &&
                resourceType.toLowerCase() !== SHOWCASE_RESOURCE_TYPE,
            ),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [resources],
  );
  const resourceTypeOptions = useMemo(() => {
    const optionsByValue = new Map<string, string>();

    Object.entries(RESOURCE_TYPES).forEach(([value, config]) => {
      if (value === SHOWCASE_RESOURCE_TYPE) {
        return;
      }
      optionsByValue.set(value, config.label);
    });

    resourceTypes.forEach((value) => {
      if (!optionsByValue.has(value)) {
        optionsByValue.set(value, value);
      }
    });

    if (selectedResourceType && !optionsByValue.has(selectedResourceType)) {
      optionsByValue.set(selectedResourceType, selectedResourceType);
    }

    return Array.from(optionsByValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [resourceTypes, selectedResourceType]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setResources([]);
    setCount(null);
    setErrorMessage(null);
    setVisibleMapResourceIds([]);
    setHasMapVisibilitySnapshot(false);
    setLoadingMore(false);

    // Promises handed over from a server component are React thenables whose
    // `then` returns undefined, so they cannot be chained - await them instead.
    void (async () => {
      try {
        const payload = await resourcesPromise;
        if (cancelled) {
          return;
        }
        setResources(payload.resources);
        setCount(payload.count);
        setErrorMessage(payload.errorMessage);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : "Unable to load resources.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resourcesPromise]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await mapBasemapResourcesPromise;
        if (!cancelled) {
          setMapBasemapResources(payload.resources);
        }
      } catch {
        if (!cancelled) {
          setMapBasemapResources([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapBasemapResourcesPromise]);

  const parseBooleanUrlParam = useCallback((value: string | null) => {
    if (value === null) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
      return false;
    }
    return null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    const stored = sessionStorage.getItem(overviewStorageKey);
    const urlQuery = searchParams.get("q");
    const urlType = searchParams.get("type");
    const urlMap = searchParams.get("map");
    const urlWithin = searchParams.get("within");
    const hasUrlQuery = urlQuery !== null;
    const hasUrlType = urlType !== null;
    const parsedUrlMap = parseBooleanUrlParam(urlMap);
    const parsedUrlWithin = parseBooleanUrlParam(urlWithin);
    const hasUrlMap = parsedUrlMap !== null;
    const hasUrlWithin = parsedUrlWithin !== null;
    lastQueryRef.current = urlQuery ?? "";
    lastTypeRef.current = urlType ?? "";
    lastMapRef.current = urlMap ?? "";
    lastWithinRef.current = urlWithin ?? "";
    if (!stored) {
      if (hasUrlQuery) {
        setSearchTerm(urlQuery ?? "");
      }
      if (hasUrlType) {
        setSelectedResourceType(urlType ?? "");
      }
      if (hasUrlMap) {
        setFilterByMapView(Boolean(parsedUrlMap));
      }
      if (hasUrlWithin) {
        setIncludeWithinPolygons(Boolean(parsedUrlWithin));
      }
      setHasRestoredState(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        searchTerm?: string;
        selectedResourceType?: string;
        viewMode?: ViewMode;
        includeWithinPolygons?: boolean;
        filterByMapView?: boolean;
        scrollY?: number;
      };
      if (hasUrlQuery) {
        setSearchTerm(urlQuery ?? "");
      } else if (typeof parsed.searchTerm === "string") {
        setSearchTerm(parsed.searchTerm);
      }
      if (hasUrlType) {
        setSelectedResourceType(urlType ?? "");
      } else if (typeof parsed.selectedResourceType === "string") {
        setSelectedResourceType(parsed.selectedResourceType);
      }
      if (hasUrlMap) {
        setFilterByMapView(Boolean(parsedUrlMap));
      } else if (typeof parsed.filterByMapView === "boolean") {
        setFilterByMapView(parsed.filterByMapView);
      }
      if (hasUrlWithin) {
        setIncludeWithinPolygons(Boolean(parsedUrlWithin));
      } else if (typeof parsed.includeWithinPolygons === "boolean") {
        setIncludeWithinPolygons(parsed.includeWithinPolygons);
      }
      if (
        parsed.viewMode === "grid" ||
        parsed.viewMode === "list" ||
        parsed.viewMode === "map"
      ) {
        setViewMode(parsed.viewMode);
      }
      if (typeof parsed.scrollY === "number") {
        setPendingScrollY(parsed.scrollY);
        setHasAppliedScroll(false);
      }
    } catch {
      // Ignore malformed state.
    } finally {
      setHasRestoredState(true);
    }
  }, [overviewStorageKey, parseBooleanUrlParam, searchParams]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    const urlQuery = searchParams.get("q") ?? "";
    if (urlQuery === searchTerm) {
      lastQueryRef.current = urlQuery;
      return;
    }
    if (urlQuery === lastQueryRef.current) {
      return;
    }
    lastQueryRef.current = urlQuery;
    setSearchTerm(urlQuery);
  }, [hasRestoredState, searchParams, searchTerm]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    const urlType = searchParams.get("type") ?? "";
    if (urlType === selectedResourceType) {
      lastTypeRef.current = urlType;
      return;
    }
    if (urlType === lastTypeRef.current) {
      return;
    }
    lastTypeRef.current = urlType;
    setSelectedResourceType(urlType);
  }, [hasRestoredState, searchParams, selectedResourceType]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    const urlMap = searchParams.get("map");
    const parsed = parseBooleanUrlParam(urlMap);
    const nextValue = parsed === true;
    lastMapRef.current = urlMap ?? "";
    if (nextValue === filterByMapView) {
      return;
    }
    setFilterByMapView(nextValue);
  }, [filterByMapView, hasRestoredState, parseBooleanUrlParam, searchParams]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    const urlWithin = searchParams.get("within");
    const parsed = parseBooleanUrlParam(urlWithin);
    const nextValue = parsed === true;
    lastWithinRef.current = urlWithin ?? "";
    if (nextValue === includeWithinPolygons) {
      return;
    }
    setIncludeWithinPolygons(nextValue);
  }, [
    hasRestoredState,
    includeWithinPolygons,
    parseBooleanUrlParam,
    searchParams,
  ]);

  // Ab lg scrollt nur die Ergebnisliste, darunter die ganze Seite.
  const getScrollContainer = useCallback(() => {
    const list = resultsScrollRef.current;
    return list && window.getComputedStyle(list).overflowY !== "visible"
      ? list
      : null;
  }, []);

  const persistOverviewState = useCallback(
    (scrollYOverride?: number) => {
      if (typeof window === "undefined") {
        return;
      }
      const container = getScrollContainer();
      const scrollY =
        typeof scrollYOverride === "number"
          ? scrollYOverride
          : container
            ? container.scrollTop
            : window.scrollY;
      const payload = {
        searchTerm,
        selectedResourceType,
        viewMode,
        includeWithinPolygons,
        filterByMapView,
        scrollY,
        updatedAt: Date.now(),
      };
      sessionStorage.setItem(overviewStorageKey, JSON.stringify(payload));
    },
    [
      filterByMapView,
      getScrollContainer,
      includeWithinPolygons,
      overviewStorageKey,
      searchTerm,
      selectedResourceType,
      viewMode,
    ],
  );

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    persistOverviewState();
  }, [
    hasRestoredState,
    includeWithinPolygons,
    persistOverviewState,
    searchTerm,
    viewMode,
  ]);

  const replaceFilterParamsInUrl = useCallback(
    (
      nextQueryValue: string,
      nextTypeValue: string,
      nextMapValue: boolean,
      nextWithinValue: boolean,
    ) => {
      if (!hasRestoredState || typeof window === "undefined") {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (nextQueryValue) {
        params.set("q", nextQueryValue);
      } else {
        params.delete("q");
      }
      if (nextTypeValue) {
        params.set("type", nextTypeValue);
      } else {
        params.delete("type");
      }

      if (nextMapValue) {
        params.set("map", "1");
      } else {
        params.delete("map");
      }

      if (nextWithinValue) {
        params.set("within", "1");
      } else {
        params.delete("within");
      }

      const nextQuery = params.toString();
      const currentQuery = window.location.search.replace(/^\?/, "");
      if (nextQuery === currentQuery) {
        lastQueryRef.current = nextQueryValue;
        lastTypeRef.current = nextTypeValue;
        lastMapRef.current = nextMapValue ? "1" : "";
        lastWithinRef.current = nextWithinValue ? "1" : "";
        return;
      }
      lastQueryRef.current = nextQueryValue;
      lastTypeRef.current = nextTypeValue;
      lastMapRef.current = nextMapValue ? "1" : "";
      lastWithinRef.current = nextWithinValue ? "1" : "";
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [hasRestoredState, pathname, router],
  );

  const commitSearchToUrl = useCallback(() => {
    replaceFilterParamsInUrl(
      searchTerm.trim(),
      selectedResourceType,
      filterByMapView,
      includeWithinPolygons,
    );
  }, [
    filterByMapView,
    includeWithinPolygons,
    replaceFilterParamsInUrl,
    searchTerm,
    selectedResourceType,
  ]);

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    if (selectedResourceType.trim().toLowerCase() === SHOWCASE_RESOURCE_TYPE) {
      setSelectedResourceType("");
      replaceFilterParamsInUrl(
        searchTerm.trim(),
        "",
        filterByMapView,
        includeWithinPolygons,
      );
    }
  }, [
    filterByMapView,
    hasRestoredState,
    includeWithinPolygons,
    replaceFilterParamsInUrl,
    searchTerm,
    selectedResourceType,
  ]);

  const handleResourceTypeChange = useCallback(
    (nextTypeValue: string) => {
      setSelectedResourceType(nextTypeValue);
      replaceFilterParamsInUrl(
        searchTerm.trim(),
        nextTypeValue,
        filterByMapView,
        includeWithinPolygons,
      );
    },
    [
      filterByMapView,
      includeWithinPolygons,
      replaceFilterParamsInUrl,
      searchTerm,
    ],
  );

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    replaceFilterParamsInUrl(
      "",
      selectedResourceType,
      filterByMapView,
      includeWithinPolygons,
    );
  }, [
    filterByMapView,
    includeWithinPolygons,
    replaceFilterParamsInUrl,
    selectedResourceType,
  ]);

  useEffect(() => {
    if (!hasRestoredState || typeof window === "undefined") {
      return;
    }
    let ticking = false;
    const handleScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        persistOverviewState();
        ticking = false;
      });
    };
    // Capture fängt auch das Scrollen der Liste, das nicht hochblubbert.
    document.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [hasRestoredState, persistOverviewState]);

  useEffect(() => {
    if (
      !hasRestoredState ||
      pendingScrollY === null ||
      loading ||
      hasAppliedScroll
    ) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const applyScroll = () => {
      if (cancelled) {
        return;
      }

      const container = getScrollContainer();
      const maxScroll = container
        ? container.scrollHeight - container.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.max(0, Math.min(pendingScrollY, maxScroll));
      if (container) {
        container.scrollTop = target;
      } else {
        window.scrollTo({ top: target, behavior: "auto" });
      }

      const current = container ? container.scrollTop : window.scrollY;
      const closeEnough = Math.abs(current - target) < 2;
      if (closeEnough || attempts >= 6 || maxScroll <= 0) {
        setHasAppliedScroll(true);
        setPendingScrollY(null);
        return;
      }

      attempts += 1;
      window.setTimeout(applyScroll, 80);
    };

    const animationId = window.requestAnimationFrame(applyScroll);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationId);
    };
  }, [
    getScrollContainer,
    hasAppliedScroll,
    hasRestoredState,
    loading,
    pendingScrollY,
  ]);

  const normalizedResources = useMemo(
    () =>
      resources.map((resource) => ({
        ...resource,
        image: resource.image ?? null,
        images: resource.images ?? (resource.image ? [resource.image] : null),
      })),
    [resources],
  );

  const normalizedMapBasemapResources = useMemo(
    () =>
      mapBasemapResources.map((resource) => ({
        ...resource,
        image: resource.image ?? null,
        images: resource.images ?? (resource.image ? [resource.image] : null),
      })),
    [mapBasemapResources],
  );

  const searchAndTypeFilteredResources = normalizedResources;
  const allMapPointResources = useMemo(() => normalizedMapBasemapResources.filter(resource =>
    (!initialResourceType || resource.type === initialResourceType) &&
    (!initialQueryText || [resource.name, resource.excerpt, resource.description, ...(resource.tags ?? [])].some(value => value?.toLocaleLowerCase().includes(initialQueryText.toLocaleLowerCase())))
  ), [normalizedMapBasemapResources, initialResourceType, initialQueryText]);

  const mapOverlayResources = useMemo(() => {
    const combinedById = new Map(
      normalizedMapBasemapResources.map((resource) => [resource.id, resource]),
    );

    searchAndTypeFilteredResources.forEach((resource) => {
      combinedById.set(resource.id, resource);
    });

    return Array.from(combinedById.values());
  }, [normalizedMapBasemapResources, searchAndTypeFilteredResources]);

  const visibleMapResourceIdSet = useMemo(
    () => new Set(visibleMapResourceIds),
    [visibleMapResourceIds],
  );

  const isWide = useSyncExternalStore(
    subscribeToWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  // Der Kartenausschnitt filtert nur, solange die Karte auch zu sehen ist.
  const mapShown = viewMode === "map" || (viewMode === "grid" && isWide);

  const visibleResources = useMemo(() => {
    if (!filterByMapView || !mapShown) {
      return searchAndTypeFilteredResources;
    }
    if (!hasMapVisibilitySnapshot) {
      return searchAndTypeFilteredResources;
    }
    return searchAndTypeFilteredResources.filter((resource) =>
      visibleMapResourceIdSet.has(resource.id),
    );
  }, [
    filterByMapView,
    hasMapVisibilitySnapshot,
    mapShown,
    searchAndTypeFilteredResources,
    visibleMapResourceIdSet,
  ]);

  const handleVisibleResourceIdsChange = useCallback(
    (resourceIds: string[]) => {
      setVisibleMapResourceIds(resourceIds);
      setHasMapVisibilitySnapshot(true);
    },
    [],
  );

  const filtersMatchLoadedResources =
    normalizedSearchTerm === initialQueryText &&
    selectedResourceType.trim() === initialResourceType;
  const canLoadMore =
    !loading &&
    filtersMatchLoadedResources &&
    (count === null || resources.length < count);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !canLoadMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(RESOURCES_PAGE_SIZE),
        offset: String(resources.length),
      });
      if (initialQueryText) {
        params.set("searchTerm", initialQueryText);
      }
      if (initialResourceType) {
        params.set("type", initialResourceType);
      }

      const response = await fetch(
        `/api/openinventory/resources?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as ResourcesListResponse;
      if (!response.ok) {
        throw new Error(payload.error || tx("Unable to load more resources."));
      }

      const incomingResources = Array.isArray(payload.resources)
        ? payload.resources
        : [];

      setResources((previous) => {
        const seenIds = new Set(previous.map((resource) => resource.id));
        const dedupedIncoming = incomingResources.filter((resource) => {
          if (seenIds.has(resource.id)) {
            return false;
          }
          seenIds.add(resource.id);
          return true;
        });
        return [...previous, ...dedupedIncoming];
      });

      if (typeof payload.count === "number") {
        setCount(payload.count);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message || tx("Unable to load more resources.")
          : tx("Unable to load more resources."),
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    canLoadMore,
    initialQueryText,
    initialResourceType,
    loadingMore,
    resources.length,
    tx,
  ]);

  const handleIncludeWithinChange = (nextValue: boolean) => {
    setIncludeWithinPolygons(nextValue);
    replaceFilterParamsInUrl(
      searchTerm.trim(),
      selectedResourceType,
      filterByMapView,
      nextValue,
    );
  };

  const handleFilterByMapViewChange = (nextValue: boolean) => {
    setFilterByMapView(nextValue);
    replaceFilterParamsInUrl(
      searchTerm.trim(),
      selectedResourceType,
      nextValue,
      includeWithinPolygons,
    );
  };

  const handleResetFilters = () => {
    setSelectedResourceType("");
    setIncludeWithinPolygons(false);
    replaceFilterParamsInUrl(searchTerm.trim(), "", filterByMapView, false);
  };

  const selectedTypeLabel =
    resourceTypeOptions.find((option) => option.value === selectedResourceType)
      ?.label ?? selectedResourceType;
  const activeFilterLabels = [
    selectedResourceType ? selectedTypeLabel : null,
    includeWithinPolygons ? tx("inkl. Ressourcen in Räumen", "de") : null,
  ].filter((label): label is string => Boolean(label));

  const isFiltered =
    normalizedSearchTerm.length > 0 ||
    Boolean(selectedResourceType) ||
    (filterByMapView && mapShown);
  const countLabel = loading
    ? "…"
    : isFiltered
      ? `${visibleResources.length} ${tx("Treffer", "de")}`
      : `${count ?? visibleResources.length} ${tx("gesamt", "de")}`;
  const isUnfilteredServerCount = !initialQueryText && !initialResourceType;

  const toolsMenuItems: ToolsMenuItem[] = [
    { href: INVENTORY_HOME, label: tx("In OpenInventory verwalten", "de"), hint: tx("Bearbeiten, anlegen und organisieren", "de") },
    { href: `${INVENTORY_URL}/konglomerat/map`, label: tx("Map features"), hint: tx("Räume und Standorte in OpenInventory pflegen", "de") },
  ];

  const renderResults = (
    layout: ResourceItemLayout | "table",
    className: string,
  ) => {
    if (visibleResources.length === 0 && loading && layout === "table") {
      return <ResourcesTableSkeleton />;
    }
    if (visibleResources.length === 0 && loading) {
      return (
        <div
          className={className}
          aria-busy="true"
          aria-label={tx("Loading resources...")}
        >
          {Array.from({ length: RESOURCE_SKELETON_COUNT }).map((_, index) => (
            <ResourceItemSkeleton key={index} />
          ))}
        </div>
      );
    }
    if (visibleResources.length === 0) {
      return (
        <Notice faceNumber={12}>
          {tx(
            "Nichts gefunden. Vielleicht heißt es anders – oder es fehlt noch im Inventar.",
            "de",
          )}
        </Notice>
      );
    }
    return (
      <div
        ref={resultsScrollRef}
        className="lg:h-full lg:overflow-y-auto lg:pb-6 lg:pr-2 lg:[scrollbar-gutter:stable]"
      >
        {layout === "table" ? (
          <ResourcesTable
            resources={visibleResources}
            placeResources={normalizedMapBasemapResources}
            locale={locale}
            tx={tx}
            highlight={(text) => highlightText(text, normalizedSearchTerm)}
            onNavigate={() => persistOverviewState()}
          />
        ) : (
          <div className={className}>
            {visibleResources.map((resource) => (
              <ResourceItem
                key={resource.id}
                resource={resource}
                layout={layout}
                normalizedSearchTerm={normalizedSearchTerm}
                locale={locale}
                tx={tx}
                onHover={setHoveredResourceId}
                onNavigate={() => persistOverviewState()}
              />
            ))}
          </div>
        )}
        {canLoadMore ? (
          <div className="mt-6 flex justify-center">
            <Button
              kind="secondary"
              size="medium"
              onClick={handleLoadMore}
              loading={loadingMore}
            >
              {loadingMore ? tx("Loading more...") : tx("Load more")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  // Ab lg füllt die Karte ihre Spalte, während nur die Liste daneben scrollt.
  // In der Kartenansicht steht der Schalter unter der Karte, neben dem Raster
  // darüber.
  const renderMapPanel = (placement: "fixed" | "stretch") => {
    const mapViewportChoice = (
      <Choice
        label={tx("Nur Ressourcen im Kartenausschnitt", "de")}
        checked={filterByMapView}
        onChange={(event) => handleFilterByMapViewChange(event.target.checked)}
      />
    );
    return (
      <div
        className={`flex flex-col gap-2.5 ${
          placement === "fixed" ? "lg:h-full" : "h-full"
        }`}
      >
        {placement === "stretch" ? mapViewportChoice : null}
        <ResourcesMapView
          resources={mapOverlayResources}
          pointResources={allMapPointResources}
          highlightedResourceId={hoveredResourceId}
          onVisibleResourceIdsChange={handleVisibleResourceIdsChange}
          className={`w-full overflow-hidden knglmrt-border ${
            placement === "fixed"
              ? "h-[60vh] min-h-[24rem] lg:h-auto lg:min-h-0 lg:flex-1"
              : "min-h-[24rem] flex-1"
          }`}
        />
        {placement === "fixed" ? mapViewportChoice : null}
      </div>
    );
  };

  const viewIconClassName = "h-4 w-4";

  return (
    <div className="flex flex-col gap-7 pb-10 lg:min-h-0 lg:flex-1 lg:pb-0">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-foreground">{tx("Inventar", "de")}</h1>
          {!loading && count !== null && isUnfilteredServerCount ? (
            <span className="knglmrt-num text-muted-foreground">
              {count} {tx("Ressourcen", "de")}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
              kind="emphasis"
              icon={faPlus}
              href={`${INVENTORY_HOME}/new`}
            >
              {tx("In OpenInventory anlegen", "de")}
          </Button>
          {toolsMenuItems.length > 0 ? (
            <ToolsMenu label={tx("Werkzeuge", "de")} items={toolsMenuItems} />
          ) : null}
        </div>
      </header>

      <section className="-mt-2 flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="min-w-0 flex-[1_1_360px]">
            <SearchField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onClear={handleClearSearch}
              onBlur={commitSearchToUrl}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitSearchToUrl();
                }
              }}
              aria-label={tx("Search resources")}
              placeholder={tx("Search by name, tag, or category")}
              count={countLabel}
              className="h-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((previous) => !previous)}
            aria-expanded={filterOpen}
            aria-controls="resource-filters"
            className={`flex min-h-11 cursor-pointer items-center gap-2 knglmrt-border px-3 text-[15px] font-bold text-foreground transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
              filterOpen ? "bg-muted" : "bg-card"
            }`}
          >
            <FontAwesomeIcon icon={faSliders} className="h-4 w-4" />
            <span>{tx("Filter", "de")}</span>
            {activeFilterLabels.length > 0 ? (
              <span className="knglmrt-num flex h-5 min-w-5 items-center justify-center bg-primary px-1 text-primary-foreground">
                {activeFilterLabels.length}
              </span>
            ) : null}
          </button>
          <SegmentedControl
            value={viewMode}
            size="small"
            tone="ink"
            onChange={setViewMode}
            segmentClassName="w-11 px-0"
            options={[
              {
                value: "grid" as const,
                label: (
                  <FontAwesomeIcon
                    icon={faGrip}
                    className={viewIconClassName}
                    title={tx("Raster", "de")}
                  />
                ),
              },
              {
                value: "list" as const,
                label: (
                  <FontAwesomeIcon
                    icon={faList}
                    className={viewIconClassName}
                    title={tx("List view")}
                  />
                ),
              },
              {
                value: "map" as const,
                label: (
                  <FontAwesomeIcon
                    icon={faMap}
                    className={viewIconClassName}
                    title={tx("Map view")}
                  />
                ),
              },
            ]}
          />
        </div>

        {filterOpen ? (
          <div
            id="resource-filters"
            className="grid grid-cols-1 items-center gap-x-5 gap-y-3.5 bg-muted p-4 sm:grid-cols-[auto_minmax(0,1fr)]"
          >
            <span className="knglmrt-label">{tx("Typ", "de")}</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "", label: tx("All types") },
                ...resourceTypeOptions,
              ].map((option) => {
                const isActive = option.value === selectedResourceType;
                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handleResourceTypeChange(option.value)}
                    className={`cursor-pointer knglmrt-border px-2.5 py-1 text-[15px] leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${
                      isActive
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-primary-soft"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="knglmrt-label">{tx("Räume", "de")}</span>
            <Choice
              kind="switch"
              label={tx("Show resources in rooms")}
              hint={
                normalizedSearchTerm.length === 0
                  ? tx("Wirkt, sobald du nach einem Raum suchst.", "de")
                  : undefined
              }
              checked={includeWithinPolygons}
              onChange={(event) =>
                handleIncludeWithinChange(event.target.checked)
              }
              disabled={normalizedSearchTerm.length === 0}
            />
          </div>
        ) : activeFilterLabels.length > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-muted-foreground">
              {tx("Gefiltert:", "de")}
            </span>
            <span className="font-semibold">
              {activeFilterLabels.join(" · ")}
            </span>
            <Button kind="tertiary" size="chip" onClick={handleResetFilters}>
              {tx("Zurücksetzen", "de")}
            </Button>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <section className="shrink-0 border border-destructive-border bg-destructive-soft p-4 text-destructive">
          {errorMessage}
        </section>
      ) : null}

      <section className="relative lg:min-h-0 lg:flex-1">
        {viewMode === "grid" ? (
          <div
            className={`grid gap-6 lg:h-full lg:grid-rows-[minmax(0,1fr)] ${
              isWide
                ? "grid-cols-[minmax(0,1fr)_minmax(380px,36%)]"
                : "grid-cols-1"
            }`}
          >
            {renderResults(
              "grid",
              "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-1.5 gap-y-2",
            )}
            {isWide ? renderMapPanel("stretch") : null}
          </div>
        ) : viewMode === "list" ? (
          renderResults("table", "")
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:h-full lg:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
            <div className="order-2 lg:order-1 lg:min-h-0">
              {renderResults("compact", "flex flex-col gap-0.5")}
            </div>
            <div className="order-1 lg:order-2 lg:min-h-0">
              {renderMapPanel("fixed")}
            </div>
          </div>
        )}
        {loading && visibleResources.length > 0 ? (
          <div className="knglmrt-num pointer-events-none absolute right-3 top-3 knglmrt-border bg-card px-3 py-1 text-muted-foreground">
            {tx("Loading...")}
          </div>
        ) : null}
      </section>
    </div>
  );
}
