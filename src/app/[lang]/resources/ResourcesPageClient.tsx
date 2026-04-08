"use client";
/* eslint-disable @next/next/no-img-element */

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "motion/react";
import {
  faCamera,
  faClone,
  faChevronLeft,
  faChevronRight,
  faXmark,
  faList,
  faMagnifyingGlass,
  faMap,
  faPlus,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import {
  localizePathname,
  RESOURCES_NAMESPACE,
  type Locale,
} from "@/i18n/config";
import Button from "../components/Button";
import { Input, Select } from "../components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import ResourcesMapView from "./ResourcesMapView";
import { RESOURCE_TYPES } from "./resource-types";

type Resource = ResourcePayload;

type ResourceCardProps = {
  resource: Resource;
  normalizedSearchTerm: string;
  locale: Locale;
  tx: (key: string, sourceLocale?: Locale) => string;
  onHover: (resourceId: string | null) => void;
  onNavigate?: () => void;
};

type ResourcesPageClientProps = {
  initialResources: Resource[];
  initialMapBasemapResources: Resource[];
  initialCount: number | null;
  initialErrorMessage: string | null;
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
        className="rounded bg-yellow-300 px-0.5 text-zinc-900 dark:!text-zinc-900"
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

const ResourceCard = ({
  resource,
  normalizedSearchTerm,
  locale,
  tx,
  onHover,
  onNavigate,
}: ResourceCardProps) => {
  const typeConfig =
    resource.type &&
    RESOURCE_TYPES[
      resource.type.trim().toLowerCase() as keyof typeof RESOURCE_TYPES
    ]
      ? RESOURCE_TYPES[
          resource.type.trim().toLowerCase() as keyof typeof RESOURCE_TYPES
        ]
      : null;
  const images = resource.images?.length
    ? resource.images
    : resource.image
      ? [resource.image]
      : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const hasCarousel = images.length > 1;
  const displayImages = images.map((image) =>
    getSupabaseThumbnailUrl(image, 900),
  );
  const slideWidth = "100%";
  const slideGap = "0rem";
  const trackOffset = `calc(-${activeIndex} * (${slideWidth} + ${slideGap}))`;
  const resourcePath = localizePathname(buildResourcePath(resource), locale);
  const editPath = localizePathname(
    `/resources/features?resourceId=${resource.id}`,
    locale,
  );

  const handlePrev = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  const handleDotClick = (
    event: MouseEvent<HTMLButtonElement>,
    index: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex(index);
  };

  return (
    <article
      onMouseEnter={() => onHover(resource.id)}
      onMouseLeave={() => onHover(null)}
      className="group cursor-pointer overflow-hidden rounded-2xl"
    >
      <div className="relative aspect-[4/3.7] w-full overflow-hidden">
        {typeConfig ? (
          <FontAwesomeIcon
            icon={typeConfig.icon}
            className={`${typeConfig.color} absolute top-2 right-2 z-10 p-1 text-xs opacity-60`}
          />
        ) : null}
        <Link
          href={resourcePath}
          className="block h-full w-full"
          onClick={onNavigate}
        >
          {displayImages.length > 0 ? (
            <motion.div
              className="flex h-full"
              animate={{ x: trackOffset }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {displayImages.map((image, index) => (
                <div
                  key={`${resource.id}-slide-${index}`}
                  className="h-full min-w-full w-full flex-shrink-0 overflow-hidden rounded-xl bg-zinc-100"
                >
                  <img
                    src={image}
                    alt={resource.name}
                    className="block h-full w-full object-cover"
                  />
                </div>
              ))}
            </motion.div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-100">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                {tx("No image")}
              </span>
            </div>
          )}
        </Link>

        {hasCarousel ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label={tx("Previous image")}
              onClick={handlePrev}
              className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="text-[11px]" />
            </button>
            <button
              type="button"
              aria-label={tx("Next image")}
              onClick={handleNext}
              className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white"
            >
              <FontAwesomeIcon icon={faChevronRight} className="text-[11px]" />
            </button>
          </div>
        ) : null}

        {hasCarousel ? (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            {images.map((_, index) => (
              <button
                key={`${resource.id}-dot-${index}`}
                type="button"
                aria-label={`${tx("Image")} ${index + 1}`}
                onClick={(event) => handleDotClick(event, index)}
                className={`pointer-events-auto h-1.5 w-1.5 rounded-full transition ${
                  index === activeIndex ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-2">
        <div>
          <h3 className="flex items-center justify-between gap-4 text-md font-semibold text-zinc-800">
            <Link
              href={resourcePath}
              className="inline-flex items-center gap-2 font-semibold text-zinc-1000 hover:underline"
              onClick={onNavigate}
            >
              {highlightText(resource.name, normalizedSearchTerm)}
            </Link>

            <Link
              href={editPath}
              className="font-normal text-zinc-500 hover:text-zinc-800"
            >
              {tx("Edit")}
            </Link>
          </h3>

          {resource.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-500">
              {highlightText(
                truncateText(resource.description, 100),
                normalizedSearchTerm,
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] text-zinc-600">
          {resource.tags?.slice(0, 3).map((tag) => (
            <span
              key={`${resource.id}-${tag}`}
              className="rounded-full border border-zinc-200 bg-white px-2 py-1"
            >
              {highlightText(tag, normalizedSearchTerm)}
            </span>
          ))}
        </div>
        {resource.categories && resource.categories.length > 0 ? (
          <div className="text-[11px] text-zinc-500">
            {tx("Categories")}:{" "}
            {resource.categories
              .map((category) =>
                category.name
                  ? highlightText(category.name, normalizedSearchTerm)
                  : null,
              )
              .filter(Boolean)
              .flatMap((node, index, array) =>
                index === array.length - 1 ? [node] : [node, ", "],
              )}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default function ResourcesPageClient({
  initialResources,
  initialMapBasemapResources,
  initialCount,
  initialErrorMessage,
}: ResourcesPageClientProps) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const overviewStorageKey = "resourcesOverviewState";
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hasInitializedRef = useRef(false);
  const lastQueryRef = useRef<string>("");
  const lastTypeRef = useRef<string>("");
  const lastMapRef = useRef<string>("");
  const lastWithinRef = useRef<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResourceType, setSelectedResourceType] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
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
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [count, setCount] = useState<number | null>(initialCount);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const normalizedSearchTerm = searchTerm.trim();
  const loading = false;
  const resourceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .map((resource) => resource.type?.trim())
            .filter((resourceType): resourceType is string =>
              Boolean(resourceType),
            ),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [resources],
  );
  const resourceTypeOptions = useMemo(
    () => {
      const optionsByValue = new Map<string, string>();

      Object.entries(RESOURCE_TYPES).forEach(([value, config]) => {
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
    },
    [resourceTypes, selectedResourceType],
  );

  useEffect(() => {
    setResources(initialResources);
    setCount(initialCount);
    setErrorMessage(initialErrorMessage);
    setVisibleMapResourceIds([]);
    setHasMapVisibilitySnapshot(false);
    setLoadingMore(false);
  }, [initialCount, initialErrorMessage, initialResources]);

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
        viewMode?: "list" | "map";
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
      if (parsed.viewMode === "list" || parsed.viewMode === "map") {
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

  const persistOverviewState = useCallback(
    (scrollYOverride?: number) => {
      if (typeof window === "undefined") {
        return;
      }
      const scrollY =
        typeof scrollYOverride === "number" ? scrollYOverride : window.scrollY;
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
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
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

      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.max(0, Math.min(pendingScrollY, maxScroll));
      window.scrollTo({ top: target, behavior: "auto" });

      const closeEnough = Math.abs(window.scrollY - target) < 2;
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
  }, [hasAppliedScroll, hasRestoredState, loading, pendingScrollY]);

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
      initialMapBasemapResources.map((resource) => ({
        ...resource,
        image: resource.image ?? null,
        images: resource.images ?? (resource.image ? [resource.image] : null),
      })),
    [initialMapBasemapResources],
  );

  const searchAndTypeFilteredResources = normalizedResources;

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

  const visibleResources = useMemo(() => {
    if (!filterByMapView) {
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

  const canLoadMore = count === null || resources.length < count;

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
      if (searchTerm.trim()) {
        params.set("searchTerm", searchTerm.trim());
      }
      if (selectedResourceType.trim()) {
        params.set("type", selectedResourceType.trim());
      }

      const response = await fetch(
        `/api/campai/resources?${params.toString()}`,
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
    loadingMore,
    resources.length,
    searchTerm,
    selectedResourceType,
    tx,
  ]);

  return (
    <main className="flex min-h-screen w-full max-w-none flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {tx("Inventar", "de")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {tx(
              "Tools & Ressourcen, die im Konglomerat zur Verfügung stehen.",
              "de",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            href={localizePathname("/resources/features", locale)}
            kind="secondary"
            className="gap-2"
          >
            <FontAwesomeIcon icon={faLayerGroup} className="text-[10px]" />
            <span>{tx("Map features")}</span>
          </Button>
          <Button
            href={localizePathname("/resources/duplicates", locale)}
            kind="secondary"
            className="gap-2"
          >
            <FontAwesomeIcon icon={faClone} className="text-[10px]" />
            <span>{tx("Duplicates")}</span>
          </Button>
          <Button
            href={localizePathname("/resources/batch", locale)}
            kind="secondary"
            className="gap-2"
          >
            <FontAwesomeIcon icon={faCamera} className="text-[10px]" />
            <span>{tx("Batch capture")}</span>
          </Button>
          <Button
            href={localizePathname("/resources/new", locale)}
            kind="primary"
            className="gap-2"
          >
            <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
            <span>{tx("New resource")}</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            viewMode === "list"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <FontAwesomeIcon icon={faList} className="text-[10px]" />
            {tx("List view")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("map")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            viewMode === "map"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <FontAwesomeIcon icon={faMap} className="text-[10px]" />
            {tx("Map view")}
          </span>
        </button>
      </div>

      {errorMessage ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid w-full flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,40%)]">
        <div className={`${viewMode === "list" ? "block" : "hidden"} lg:block`}>
          <section className="space-y-4">
            <div className="relative">
              <label htmlFor="resource-search" className="sr-only">
                {tx("Search")}
              </label>
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500"
              />
              <Input
                id="resource-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onBlur={commitSearchToUrl}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitSearchToUrl();
                  }
                }}
                aria-label={tx("Search resources")}
                placeholder={tx("Search by name, tag, or category")}
                className="pl-9 pr-10 py-3 text-base"
              />
              {searchTerm.trim().length > 0 ? (
                <button
                  type="button"
                  aria-label={tx("Clear search")}
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-[11px]" />
                </button>
              ) : null}
            </div>

            <TooltipProvider delayDuration={200}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-full sm:w-auto sm:min-w-30">
                  <Select
                    value={selectedResourceType}
                    onChange={(event) =>
                      handleResourceTypeChange(event.target.value)
                    }
                    aria-label={tx("Filter by resource type")}
                    className="py-2 text-xs font-semibold text-zinc-700"
                  >
                    <option value="">{tx("All types")}</option>
                    {resourceTypeOptions.map((resourceType) => (
                      <option
                        key={resourceType.value}
                        value={resourceType.value}
                      >
                        {resourceType.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={filterByMapView}
                    onChange={(event) => {
                      const nextValue = event.target.checked;
                      setFilterByMapView(nextValue);
                      replaceFilterParamsInUrl(
                        searchTerm.trim(),
                        selectedResourceType,
                        nextValue,
                        includeWithinPolygons,
                      );
                    }}
                    className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-900 shadow-xs shadow-zinc-900/20 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{tx("Filter by map viewport")}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {tx(
                        "Only show resources that are currently visible in the map area.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </label>

                <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={includeWithinPolygons}
                    onChange={(event) => {
                      const nextValue = event.target.checked;
                      setIncludeWithinPolygons(nextValue);
                      replaceFilterParamsInUrl(
                        searchTerm.trim(),
                        selectedResourceType,
                        filterByMapView,
                        nextValue,
                      );
                    }}
                    disabled={normalizedSearchTerm.length === 0}
                    className="h-4 w-4 rounded border-zinc-300 bg-white text-zinc-900 shadow-xs shadow-zinc-900/20 transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>{tx("Show resources in rooms")}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {tx(
                        "Also include resources that are placed inside mapped room areas when searching for rooms.",
                      )}
                    </TooltipContent>
                  </Tooltip>
                </label>

                <div className="ml-auto hidden text-right md:block">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {tx("Results")}
                  </p>
                  <p className="text-sm font-semibold text-zinc-900">
                    {loading
                      ? tx("Loading...")
                      : `${visibleResources.length} ${tx("of")} ${count ?? searchAndTypeFilteredResources.length}`}
                  </p>
                </div>
              </div>
            </TooltipProvider>
          </section>

          <section className="relative mt-6">
            {visibleResources.length === 0 && loading ? (
              <p className="text-sm text-zinc-500">
                {tx("Loading resources...")}
              </p>
            ) : visibleResources.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {tx("No resources found.")}
              </p>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  {visibleResources.map((resource) => (
                    <ResourceCard
                      key={resource.id}
                      resource={resource}
                      normalizedSearchTerm={normalizedSearchTerm}
                      locale={locale}
                      tx={tx}
                      onHover={setHoveredResourceId}
                      onNavigate={() => persistOverviewState(window.scrollY)}
                    />
                  ))}
                </div>

                {canLoadMore ? (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="inline-flex cursor-pointer items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadingMore ? tx("Loading more...") : tx("Load more")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {loading ? (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
                {tx("Loading...")}
              </div>
            ) : null}
          </section>
        </div>

        <aside
          className={`${viewMode === "map" ? "block" : "hidden"} lg:block`}
        >
          <div className="rounded-2xl lg:sticky lg:top-[30px] lg:h-[calc(100vh-60px)]">
            <ResourcesMapView
              resources={mapOverlayResources}
              pointResources={searchAndTypeFilteredResources}
              highlightedResourceId={hoveredResourceId}
              onVisibleResourceIdsChange={handleVisibleResourceIdsChange}
              className="h-[70vh] min-h-[24rem] w-full overflow-hidden rounded-2xl lg:h-full"
            />
            <p className="mt-2 text-xs text-zinc-500">
              {tx("Showing resources with saved locations.")}
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
