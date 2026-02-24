"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map } from "mapbox-gl";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import {
  DEFAULT_INDOOR_TILESET_ID,
  MAPBOX_STYLE,
  MAPBOX_SATELLITE_STYLE,
  addIndoorOverlay,
} from "./mapbox-basemap";
import {
  getPointFeatures,
  toMapFeatureGeoJson,
  type ResourceMapFeature,
} from "./map-features";

type ResourceMapItem = {
  id: string;
  prettyTitle?: string | null;
  name: string;
  type?: string;
  image?: string | null;
  images?: string[] | null;
  mapFeatures?: ResourceMapFeature[];
};

type ResourcesMapViewProps = {
  resources: ResourceMapItem[];
  pointResources?: ResourceMapItem[];
  highlightedResourceId?: string | null;
  onVisibleResourceIdsChange?: (resourceIds: string[]) => void;
  className?: string;
};

const defaultCenter = {
  latitude: 51.04602573697031,
  longitude: 13.716125054140463,
};

const getSupabaseThumbnailUrl = (url: string, width = 72) => {
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
    renderUrl.searchParams.set("height", String(width));
    renderUrl.searchParams.set("resize", "cover");
    return renderUrl.toString();
  } catch {
    return url;
  }
};

const RESOURCE_FEATURES_SOURCE_ID = "resource-features-overlay";
const RESOURCE_FEATURES_FILL_LAYER_PREFIX = "resource-features-fill";
const RESOURCE_FEATURES_LINE_LAYER_PREFIX = "resource-features-line";
const RESOURCE_FEATURES_LABEL_LAYER_PREFIX = "resource-features-label";

const normalizeResourceTypeForLayerId = (resourceType: string) => {
  const normalized = resourceType.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_-]/g, "-") || "unknown";
};

const getResourceFeaturePaint = (resourceType: string) => {
  if (resourceType === "furniture") {
    return {
      fillColor: "#313131",
      fillOpacity: 0.2,
      lineColor: "#313131",
      textColor: "#000000",
    };
  }
  return {
    fillColor: "#2563eb",
    fillOpacity: 0.12,
    lineColor: "#1d4ed8",
    textColor: "#1e3a8a",
  };
};

const ensureResourceFeatureLayers = (map: Map, resourceTypes: string[]) => {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (!map.getSource(RESOURCE_FEATURES_SOURCE_ID)) {
    map.addSource(RESOURCE_FEATURES_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }

  resourceTypes.forEach((resourceType) => {
    const layerTypeId = normalizeResourceTypeForLayerId(resourceType);
    const fillLayerId = `${RESOURCE_FEATURES_FILL_LAYER_PREFIX}-${layerTypeId}`;
    const lineLayerId = `${RESOURCE_FEATURES_LINE_LAYER_PREFIX}-${layerTypeId}`;
    const labelLayerId = `${RESOURCE_FEATURES_LABEL_LAYER_PREFIX}-${layerTypeId}`;
    const paint = getResourceFeaturePaint(resourceType);
    const typeFilter: import("mapbox-gl").FilterSpecification = [
      "==",
      ["coalesce", ["get", "resourceType"], ""],
      resourceType,
    ];

    if (!map.getLayer(fillLayerId)) {
      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: RESOURCE_FEATURES_SOURCE_ID,
        filter: typeFilter,
        paint: {
          "fill-color": paint.fillColor,
          "fill-opacity": paint.fillOpacity,
        },
      });
    }

    if (!map.getLayer(lineLayerId)) {
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: RESOURCE_FEATURES_SOURCE_ID,
        filter: typeFilter,
        paint: {
          "line-color": paint.lineColor,
          "line-width": 2,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });
    }

    if (!map.getLayer(labelLayerId)) {
      map.addLayer({
        id: labelLayerId,
        type: "symbol",
        source: RESOURCE_FEATURES_SOURCE_ID,
        filter: typeFilter,
        minzoom: 13,
        layout: {
          "text-field": ["coalesce", ["get", "resourceName"], ""],
          "text-size": 14,
          "text-offset": [0, 1.2],
          "text-anchor": "bottom",
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": paint.textColor,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });
    }
  });
};

export default function ResourcesMapView({
  resources,
  pointResources,
  highlightedResourceId,
  onVisibleResourceIdsChange,
  className = "w-full aspect-[4/3]",
}: ResourcesMapViewProps) {
  const [mapboxError, setMapboxError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const highlightedIdRef = useRef<string | null>(highlightedResourceId ?? null);
  const viewportHandlerRef = useRef<(() => void) | null>(null);
  const zoomHandlerRef = useRef<(() => void) | null>(null);
  const markersRef = useRef<import("mapbox-gl").Marker[]>([]);
  const markerElementsRef = useRef<
    Record<string, { outer: HTMLDivElement; inner: HTMLDivElement }>
  >({});
  const lastStyleRef = useRef<string | null>(null);
  const indoorLayerRef = useRef<string[] | null>(null);
  const indoorTileset = DEFAULT_INDOOR_TILESET_ID;
  const mapStyle = isSatellite ? MAPBOX_SATELLITE_STYLE : MAPBOX_STYLE;
  const markerResources = pointResources ?? resources;
  const useCompactMarkers = markerResources.length > 20;

  const getMarkerSize = useCallback((zoom: number, compact: boolean) => {
    const minZoom = 15;
    const maxZoom = 22;
    const t = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
    const minSize = compact ? 2 : 42;
    const maxSize = compact ? 40 : 72;
    return Math.round(minSize + (maxSize - minSize) * t);
  }, []);

  const applyMarkerSizes = useCallback(
    (zoom: number) => {
      const highlightedId = highlightedIdRef.current;
      Object.entries(markerElementsRef.current).forEach(([id, elements]) => {
        const isActive = highlightedId === id;
        const shouldUseFullMarker = !useCompactMarkers || isActive;
        const size = getMarkerSize(zoom, !shouldUseFullMarker);
        elements.outer.style.width = `${size}px`;
        elements.outer.style.height = `${size}px`;
      });
    },
    [getMarkerSize, useCompactMarkers],
  );

  const applyMarkerHighlight = useCallback(() => {
    const zoom = mapRef.current?.getZoom() ?? 14;
    applyMarkerSizes(zoom);
    const highlightedId = highlightedIdRef.current;
    Object.entries(markerElementsRef.current).forEach(([id, elements]) => {
      const isActive = highlightedId === id;
      const shouldUseFullMarker = !useCompactMarkers || isActive;
      elements.inner.style.border = isActive
        ? "3px solid #f97316"
        : shouldUseFullMarker
          ? "2px solid #fff"
          : "1px solid rgba(255, 255, 255, 0.9)";
      elements.inner.style.borderRadius = shouldUseFullMarker
        ? "12px"
        : "9999px";
      elements.inner.style.transform = isActive ? "scale(1.08)" : "scale(1)";
      elements.inner.style.boxShadow = isActive
        ? "0 10px 22px rgba(15, 23, 42, 0.35)"
        : shouldUseFullMarker
          ? "0 6px 18px rgba(15, 23, 42, 0.25)"
          : "0 2px 8px rgba(15, 23, 42, 0.2)";
      elements.inner.style.background = shouldUseFullMarker
        ? "#e2e8f0"
        : "#94a3b8";
      elements.outer.style.zIndex = isActive ? "10" : "1";
    });
  }, [applyMarkerSizes, useCompactMarkers]);

  const locations = useMemo(
    () =>
      markerResources
        .map((resource) => {
          const pointFeatures = getPointFeatures(resource.mapFeatures ?? []);
          const pointFeature =
            pointFeatures.find((feature) => feature.id === "gps-point") ??
            pointFeatures.find((feature) => feature.layer === "location") ??
            pointFeatures[0];
          return {
            id: resource.id,
            name: resource.name,
            latitude: pointFeature?.point[1] ?? null,
            longitude: pointFeature?.point[0] ?? null,
            image: resource.images?.[0] ?? resource.image ?? null,
            markerImage: resource.images?.[0] ?? resource.image ?? null,
          };
        })
        .filter(
          (
            item,
          ): item is {
            id: string;
            name: string;
            latitude: number;
            longitude: number;
            image: string | null;
            markerImage: string | null;
          } => item.latitude != null && item.longitude != null,
        ),
    [markerResources],
  );

  const resourceFeatureCollection = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Polygon>
  >(() => {
    const polygonFeatures = resources.flatMap((resource) => {
      const resourceType = resource.type?.trim().toLowerCase() ?? "";
      return (resource.mapFeatures ?? [])
        .filter((feature) => feature.geometryType === "Polygon")
        .map((feature) => {
          const geoJson = toMapFeatureGeoJson([feature]);
          const polygon = geoJson.features[0];
          return {
            ...polygon,
            properties: {
              ...polygon.properties,
              resourceId: resource.id,
              resourceType,
              resourceName: resource.name,
            },
          } satisfies GeoJSON.Feature<GeoJSON.Polygon>;
        });
    });

    return {
      type: "FeatureCollection",
      features: polygonFeatures,
    };
  }, [resources]);

  const resourceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          resources
            .map((resource) => resource.type?.trim().toLowerCase() ?? "")
            .filter(Boolean),
        ),
      ),
    [resources],
  );

  const emitVisibleResourceIds = useCallback(
    (map: Map) => {
      if (!onVisibleResourceIdsChange) {
        return;
      }
      const bounds = map.getBounds();
      if (!bounds) {
        onVisibleResourceIdsChange([]);
        return;
      }
      const visibleIds = locations
        .filter((location) =>
          bounds.contains([location.longitude, location.latitude]),
        )
        .map((location) => location.id);
      onVisibleResourceIdsChange(visibleIds);
    },
    [locations, onVisibleResourceIdsChange],
  );

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapboxError("Missing Mapbox token.");
      return;
    }
    if (!mapContainerRef.current) {
      return;
    }

    let active = true;

    const applyOverlay = (map: Map) =>
      addIndoorOverlay({
        map,
        token,
        tilesetId: indoorTileset,
        cacheRef: indoorLayerRef,
        onError: setMapboxError,
      });

    const applyResourceFeatureLayers = (map: Map) => {
      if (!map.isStyleLoaded()) {
        return;
      }
      ensureResourceFeatureLayers(map, resourceTypes);
      const source = map.getSource(RESOURCE_FEATURES_SOURCE_ID) as
        | import("mapbox-gl").GeoJSONSource
        | undefined;
      source?.setData(resourceFeatureCollection);
    };

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      if (!active || !mapContainerRef.current) {
        return;
      }

      const centerLng = locations[0]?.longitude ?? defaultCenter.longitude;
      const centerLat = locations[0]?.latitude ?? defaultCenter.latitude;

      if (!mapRef.current) {
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: [centerLng, centerLat],
          zoom: locations.length ? 14 : 12,
          attributionControl: false,
        });
        map.scrollZoom.disable();
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.on("load", () => {
          void applyOverlay(map);
          applyResourceFeatureLayers(map);
        });
        map.on("style.load", () => {
          void applyOverlay(map);
          applyResourceFeatureLayers(map);
        });
        mapRef.current = map;
      }

      const map = mapRef.current;
      if (!map) {
        return;
      }

      applyResourceFeatureLayers(map);

      if (lastStyleRef.current !== mapStyle) {
        map.setStyle(mapStyle);
        lastStyleRef.current = mapStyle;
      }

      if (viewportHandlerRef.current) {
        map.off("moveend", viewportHandlerRef.current);
        map.off("zoomend", viewportHandlerRef.current);
      }
      if (zoomHandlerRef.current) {
        map.off("zoom", zoomHandlerRef.current);
      }

      const handleViewportChange = () => {
        emitVisibleResourceIds(map);
      };
      viewportHandlerRef.current = handleViewportChange;
      map.on("moveend", handleViewportChange);
      map.on("zoomend", handleViewportChange);

      const handleZoom = () => {
        applyMarkerSizes(map.getZoom());
      };
      zoomHandlerRef.current = handleZoom;
      map.on("zoom", handleZoom);

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markerElementsRef.current = {};

      if (locations.length === 0) {
        const polygonCoordinates = resourceFeatureCollection.features.flatMap(
          (feature) => feature.geometry.coordinates[0] ?? [],
        );
        if (polygonCoordinates.length > 0) {
          const polygonBounds = new mapboxgl.LngLatBounds();
          polygonCoordinates.forEach((point) => {
            polygonBounds.extend(point as [number, number]);
          });
          if (!polygonBounds.isEmpty()) {
            map.fitBounds(polygonBounds, {
              padding: 48,
              maxZoom: 22,
            });
            emitVisibleResourceIds(map);
            return;
          }
        }
        map.setCenter([centerLng, centerLat]);
        map.setZoom(12);
        emitVisibleResourceIds(map);
        return;
      }

      const bounds = new mapboxgl.LngLatBounds();
      locations.forEach((location) => {
        const isActive = highlightedIdRef.current === location.id;
        const shouldUseFullMarker = !useCompactMarkers || isActive;
        const markerElement = document.createElement("div");
        const size = getMarkerSize(map.getZoom(), !shouldUseFullMarker);
        markerElement.style.width = `${size}px`;
        markerElement.style.height = `${size}px`;
        const markerInner = document.createElement("div");
        markerInner.style.width = "100%";
        markerInner.style.height = "100%";
        markerInner.style.borderRadius = shouldUseFullMarker
          ? "12px"
          : "9999px";
        markerInner.style.overflow = "hidden";
        markerInner.style.border = shouldUseFullMarker
          ? "2px solid #fff"
          : "1px solid rgba(255, 255, 255, 0.9)";
        markerInner.style.boxShadow = shouldUseFullMarker
          ? "0 6px 18px rgba(15, 23, 42, 0.25)"
          : "0 2px 8px rgba(15, 23, 42, 0.2)";
        markerInner.style.background = shouldUseFullMarker
          ? "#e2e8f0"
          : "#94a3b8";
        markerElement.title = location.name;
        markerElement.dataset.resourceId = location.id;

        if (location.image) {
          const imageEl = document.createElement("img");
          imageEl.src = location.markerImage
            ? getSupabaseThumbnailUrl(location.markerImage, 90)
            : location.image;
          imageEl.alt = location.name;
          imageEl.style.width = "100%";
          imageEl.style.height = "100%";
          imageEl.style.objectFit = "cover";
          markerInner.appendChild(imageEl);
        } else {
          markerInner.style.display = "flex";
          markerInner.style.alignItems = "center";
          markerInner.style.justifyContent = "center";
          markerInner.style.color = "#1f2937";
          markerInner.style.fontSize = "12px";
          markerInner.style.fontWeight = "700";
          markerInner.textContent = location.name.slice(0, 2).toUpperCase();
        }

        markerElement.appendChild(markerInner);

        const detailLink = buildResourcePath(location);
        const popupHtml = location.image
          ? `<div style="display:flex; flex-direction:column;">
               <img src="${location.image}" alt="${location.name}" style="width:200px; height:200px; object-fit:cover; border-radius:0;" />
              
               <a href="${detailLink}" class="mapbox-popup-link">${location.name}</a>
             </div>`
          : `<div style="display:flex; flex-direction:column; gap:6px;">
              
               <a href="${detailLink}" class="mapbox-popup-link">${location.name}</a>
             </div>`;

        const marker = new mapboxgl.Marker({ element: markerElement })
          .setLngLat([location.longitude, location.latitude])
          .setPopup(
            new mapboxgl.Popup({
              offset: 12,
              className: "resource-map-popup",
            }).setHTML(popupHtml),
          )
          .addTo(map);
        markersRef.current.push(marker);
        markerElementsRef.current[location.id] = {
          outer: markerElement,
          inner: markerInner,
        };
        bounds.extend([location.longitude, location.latitude]);
      });

      applyMarkerHighlight();

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: 23,
        });
      } else {
        emitVisibleResourceIds(map);
      }

      window.requestAnimationFrame(() => emitVisibleResourceIds(map));
    };

    void initMap();

    return () => {
      active = false;
    };
  }, [
    applyMarkerSizes,
    applyMarkerHighlight,
    emitVisibleResourceIds,
    getMarkerSize,
    indoorTileset,
    locations,
    mapStyle,
    resourceFeatureCollection,
    resourceTypes,
    useCompactMarkers,
  ]);

  useEffect(() => {
    highlightedIdRef.current = highlightedResourceId ?? null;
    applyMarkerHighlight();
  }, [applyMarkerHighlight, highlightedResourceId]);

  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map && viewportHandlerRef.current) {
        map.off("moveend", viewportHandlerRef.current);
        map.off("zoomend", viewportHandlerRef.current);
      }
      if (map && zoomHandlerRef.current) {
        map.off("zoom", zoomHandlerRef.current);
      }
      viewportHandlerRef.current = null;
      zoomHandlerRef.current = null;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (mapboxError) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-50 text-xs text-zinc-500 ${className}`}
      >
        {mapboxError}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapContainerRef}
        className="relative z-20 h-full w-full"
        aria-label="Map view"
      />
      <button
        type="button"
        onClick={() => setIsSatellite((prev) => !prev)}
        className="absolute left-3 top-3 z-10 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
      >
        {isSatellite ? "Karte" : "Satellit"}
      </button>
    </div>
  );
}
