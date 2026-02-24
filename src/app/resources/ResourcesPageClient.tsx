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
  faChevronLeft,
  faChevronRight,
  faFilter,
  faXmark,
  faList,
  faMagnifyingGlass,
  faMap,
  faPlus,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";

import type { ResourcePayload } from "@/lib/campai-resources";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import Button from "../components/Button";
import ResourcesMapView from "./ResourcesMapView";
import { RESOURCE_TYPES } from "./resource-types";

type Resource = ResourcePayload;

type ResourceCardProps = {
  resource: Resource;
  normalizedSearchTerm: string;
  onHover: (resourceId: string | null) => void;
  onNavigate?: () => void;
};

type ResourcesPageClientProps = {
  initialResources: Resource[];
  initialCount: number | null;
  initialErrorMessage: string | null;
};

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
          href={buildResourcePath(resource)}
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
                No image
              </span>
            </div>
          )}
        </Link>

        {hasCarousel ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label="Previous image"
              onClick={handlePrev}
              className="pointer-events-auto inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="text-[11px]" />
            </button>
            <button
              type="button"
              aria-label="Next image"
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
                aria-label={`Image ${index + 1}`}
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
              href={buildResourcePath(resource)}
              className="inline-flex items-center gap-2 font-semibold text-zinc-1000 hover:underline"
              onClick={onNavigate}
            >
              {highlightText(resource.name, normalizedSearchTerm)}
            </Link>

            <Link
              href={`/resources/features?resourceId=${resource.id}`}
              className="font-normal text-zinc-500 hover:text-zinc-800"
            >
              Edit
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
            Categories:{" "}
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
  initialCount,
  initialErrorMessage,
}: ResourcesPageClientProps) {
  const overviewStorageKey = "resourcesOverviewState";
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const hasInitializedRef = useRef(false);
  const lastQueryRef = useRef<string>("");
  const lastTypeRef = useRef<string>("");
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
  const [visibleMapResourceIds, setVisibleMapResourceIds] = useState<string[]>(
    [],
  );
  const [hasMapVisibilitySnapshot, setHasMapVisibilitySnapshot] =
    useState(false);
  const normalizedSearchTerm = searchTerm.trim();
  const resources = initialResources;
  const count = initialCount;
  const errorMessage = initialErrorMessage;
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
    () =>
      resourceTypes
        .map((value) => {
          const known = RESOURCE_TYPES[value as keyof typeof RESOURCE_TYPES];
          return { value, label: known?.label ?? value };
        })
        .sort((left, right) => left.label.localeCompare(right.label)),
    [resourceTypes],
  );

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
    const hasUrlQuery = urlQuery !== null;
    const hasUrlType = urlType !== null;
    lastQueryRef.current = urlQuery ?? "";
    lastTypeRef.current = urlType ?? "";
    if (!stored) {
      if (hasUrlQuery) {
        setSearchTerm(urlQuery ?? "");
      }
      if (hasUrlType) {
        setSelectedResourceType(urlType ?? "");
      }
      setHasRestoredState(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        searchTerm?: string;
        selectedResourceType?: string;
        viewMode?: "list" | "map";
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
  }, [overviewStorageKey, searchParams]);

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
        scrollY,
        updatedAt: Date.now(),
      };
      sessionStorage.setItem(overviewStorageKey, JSON.stringify(payload));
    },
    [overviewStorageKey, searchTerm, selectedResourceType, viewMode],
  );

  useEffect(() => {
    if (!hasRestoredState) {
      return;
    }
    persistOverviewState();
  }, [hasRestoredState, persistOverviewState, searchTerm, viewMode]);

  const replaceFilterParamsInUrl = useCallback(
    (nextQueryValue: string, nextTypeValue: string) => {
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
      const nextQuery = params.toString();
      const currentQuery = window.location.search.replace(/^\?/, "");
      if (nextQuery === currentQuery) {
        lastQueryRef.current = nextQueryValue;
        lastTypeRef.current = nextTypeValue;
        return;
      }
      lastQueryRef.current = nextQueryValue;
      lastTypeRef.current = nextTypeValue;
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [hasRestoredState, pathname, router],
  );

  const commitSearchToUrl = useCallback(() => {
    replaceFilterParamsInUrl(searchTerm.trim(), selectedResourceType);
  }, [replaceFilterParamsInUrl, searchTerm, selectedResourceType]);

  const handleResourceTypeChange = useCallback(
    (nextTypeValue: string) => {
      setSelectedResourceType(nextTypeValue);
      replaceFilterParamsInUrl(searchTerm.trim(), nextTypeValue);
    },
    [replaceFilterParamsInUrl, searchTerm],
  );

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    replaceFilterParamsInUrl("", selectedResourceType);
  }, [replaceFilterParamsInUrl, selectedResourceType]);

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

  const typeFilteredResources = useMemo(() => {
    const normalizedType = selectedResourceType.trim().toLowerCase();
    return normalizedResources.filter((resource) => {
      if (normalizedType) {
        const resourceType = resource.type?.trim().toLowerCase() ?? "";
        if (resourceType !== normalizedType) {
          return false;
        }
      }
      return true;
    });
  }, [normalizedResources, selectedResourceType]);

  const searchAndTypeFilteredResources = useMemo(() => {
    const normalizedQuery = normalizedSearchTerm.toLowerCase();
    return typeFilteredResources.filter((resource) => {
      if (!normalizedQuery) {
        return true;
      }
      const searchable = [
        resource.name,
        resource.description,
        resource.type,
        ...(resource.tags ?? []),
        ...(resource.categories?.map((category) => category.name) ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedSearchTerm, typeFilteredResources]);

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

  return (
    <main className="flex min-h-screen w-full max-w-none flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventar</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Tools & Ressourcen, die im Konglomerat zur Verfügung stehen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button href="/resources/features" kind="secondary" className="gap-2">
            <FontAwesomeIcon icon={faLayerGroup} className="text-[10px]" />
            <span>Map features</span>
          </Button>
          <Button href="/resources/batch" kind="secondary" className="gap-2">
            <FontAwesomeIcon icon={faCamera} className="text-[10px]" />
            <span>Batch capture</span>
          </Button>
          <Button href="/resources/new" kind="primary" className="gap-2">
            <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
            <span>New resource</span>
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
            List view
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
            Map view
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
          <section className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex w-full flex-col gap-3 sm:w-auto">
              <div className="relative w-full sm:w-[24rem]">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm"
                />
                <input
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
                  placeholder="Search by name, tag, or category"
                  className="w-full rounded-md bg-white py-3.5 pl-11 pr-11 text-base shadow-xs shadow-zinc-900/30 transition focus:border-white focus:outline-none focus:ring-4 focus:ring-blue-900/10"
                />
                {searchTerm.trim().length > 0 ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <FontAwesomeIcon icon={faXmark} className="text-[11px]" />
                  </button>
                ) : null}
              </div>
              <div>
                <select
                  value={selectedResourceType}
                  onChange={(event) =>
                    handleResourceTypeChange(event.target.value)
                  }
                  className="rounded-md bg-white px-4 py-2 text-xs font-semibold text-zinc-700 shadow-xs shadow-zinc-900/20 transition focus:outline-none focus:ring-4 focus:ring-blue-900/10"
                  aria-label="Filter by resource type"
                >
                  <option value="">All resource types</option>
                  {resourceTypeOptions.map((resourceType) => (
                    <option key={resourceType.value} value={resourceType.value}>
                      {resourceType.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setFilterByMapView((prev) => !prev)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                    filterByMapView
                      ? "bg-zinc-900 text-white"
                      : "bg-white text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <FontAwesomeIcon icon={faFilter} className="text-[10px]" />
                  <span>
                    {filterByMapView
                      ? "Showing map viewport"
                      : "Filter by map viewport"}
                  </span>
                </button>
              </div>
            </div>
            <div className="hidden md:block text-right">
              <h2 className="text-sm font-semibold text-white">Resources</h2>
              <p className="text-xs">
                {loading
                  ? "Loading..."
                  : `${visibleResources.length} of ${count ?? searchAndTypeFilteredResources.length}`}
              </p>
            </div>
          </section>

          <section className="relative mt-6">
            {visibleResources.length === 0 && loading ? (
              <p className="text-sm text-zinc-500">Loading resources...</p>
            ) : visibleResources.length === 0 ? (
              <p className="text-sm text-zinc-500">No resources found.</p>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {visibleResources.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    normalizedSearchTerm={normalizedSearchTerm}
                    onHover={setHoveredResourceId}
                    onNavigate={() => persistOverviewState(window.scrollY)}
                  />
                ))}
              </div>
            )}
            {loading ? (
              <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm">
                Loading...
              </div>
            ) : null}
          </section>
        </div>

        <aside
          className={`${viewMode === "map" ? "block" : "hidden"} lg:block`}
        >
          <div className="rounded-2xl lg:sticky lg:top-[30px] lg:h-[calc(100vh-60px)]">
            <ResourcesMapView
              resources={typeFilteredResources}
              pointResources={searchAndTypeFilteredResources}
              highlightedResourceId={hoveredResourceId}
              onVisibleResourceIdsChange={handleVisibleResourceIdsChange}
              className="h-[70vh] min-h-[24rem] w-full overflow-hidden rounded-2xl lg:h-full"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Showing resources with saved locations.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
