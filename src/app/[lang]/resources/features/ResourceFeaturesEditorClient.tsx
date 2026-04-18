"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "react-select";
import { useForm } from "react-hook-form";
import {
  faArrowLeft,
  faChevronDown,
  faChevronUp,
  faFloppyDisk,
  faLayerGroup,
  faMap,
  faRotateLeft,
  faSatellite,
  faSpinner,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { GeoJSONSource, Map as MapboxMap, MapMouseEvent } from "mapbox-gl";

import Button from "../../components/Button";
import MdxEditorInput from "../../components/MdxEditorInput";
import ResourceForm from "../ResourceForm";
import {
  DEFAULT_INDOOR_TILESET_ID,
  MAPBOX_SATELLITE_STYLE,
  MAPBOX_STYLE,
  addIndoorOverlay,
} from "../mapbox-basemap";
import {
  normalizeResourceMapFeatures,
  toMapFeatureGeoJson,
  toMapPointFeatureGeoJson,
  type MapPolygonPoint,
  type ResourceMapFeature,
} from "../map-features";
import {
  createResourceFormData,
  fetchJson,
  getCategoryError,
  getResourceFormValues,
  getResourceImages,
  type ImageGps,
  type Resource,
  type ResourceFormValues,
} from "../resource-form-utils";
import type { RelatedResourceSelectOption } from "../ResourceForm";
import { useI18n } from "@/i18n/client";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import {
  getResourceMediaKindFromMimeType,
  getResourceMediaKindFromUrl,
  isImageUrl,
} from "@/lib/resource-media";

type ResourceSummary = {
  id: string;
  name: string;
  type?: string;
  mapFeatures: ResourceMapFeature[];
};

type ResourceSelectOption = {
  value: string;
  label: string;
};

type ResourcesListResponse = {
  resources?: Array<{
    id?: string;
    name?: string;
    mapFeatures?: unknown;
  }>;
};

type ResourceFeaturesResponse = {
  mapFeatures?: unknown;
};

type ResourceSwitchMenuState = {
  x: number;
  y: number;
  resourceIds: string[];
};

const DEFAULT_COVER_PROMPT =
  'Isolate the "{{title}}" on the photo in front of a pure white background. Professional high-end studio lighting, similar to Apple product photography. Soft, diffused light with subtle natural shadows. Perfectly centered composition. Square aspect ratio. It should fit the frame. Not too much white space. Ultra-clean, sharp focus, high resolution, no additional objects. no frontal view. Make sure background is full white (#fff)';

const getDefaultCoverPrompt = (title: string) =>
  DEFAULT_COVER_PROMPT.replace("{{title}}", title.trim() || "device");

type ResourceFeaturesEditorClientProps = {
  resourceId?: string;
  embedded?: boolean;
};

const DEFAULT_CENTER: [number, number] = [
  13.716125054140463, 51.04602573697031,
];

const featureCollectionForSingleFeature = (
  feature: ResourceMapFeature | null,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> =>
  feature
    ? toMapFeatureGeoJson([feature])
    : {
        type: "FeatureCollection",
        features: [],
      };

const draftFeatureCollection = (
  draftPoints: MapPolygonPoint[],
  draftLayer: string,
): GeoJSON.FeatureCollection<GeoJSON.Polygon> => {
  if (draftPoints.length < 3) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }
  return toMapFeatureGeoJson([
    {
      id: "draft",
      layer: draftLayer,
      geometryType: "Polygon",
      coordinates: draftPoints,
    },
  ]);
};

const updateMapSource = (
  map: MapboxMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection<GeoJSON.Geometry>,
) => {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  }
};

const toResourceFeatureCollection = ({
  resourceId,
  resourceName,
  isDirty,
  features,
}: {
  resourceId: string;
  resourceName: string;
  isDirty: boolean;
  features: ResourceMapFeature[];
}): GeoJSON.FeatureCollection<GeoJSON.Polygon> => ({
  type: "FeatureCollection",
  features: toMapFeatureGeoJson(features).features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      resourceId,
      resourceName,
      isDirty,
    },
  })),
});

const toResourcePointFeatureCollection = ({
  resourceId,
  resourceName,
  isDirty,
  features,
}: {
  resourceId: string;
  resourceName: string;
  isDirty: boolean;
  features: ResourceMapFeature[];
}): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: toMapPointFeatureGeoJson(features).features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      resourceId,
      resourceName,
      isDirty,
    },
  })),
});

const ensureSourcesAndLayers = (map: MapboxMap) => {
  if (!map.getSource("resource-map-points-other")) {
    map.addSource("resource-map-points-other", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-points-other")) {
    map.addLayer({
      id: "resource-map-points-other",
      type: "circle",
      source: "resource-map-points-other",
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#f59e0b",
          "#71717a",
        ],
        "circle-radius": 5,
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
  }

  if (!map.getSource("resource-map-points")) {
    map.addSource("resource-map-points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-points")) {
    map.addLayer({
      id: "resource-map-points",
      type: "circle",
      source: "resource-map-points",
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#f59e0b",
          "#2563eb",
        ],
        "circle-radius": 6,
        "circle-opacity": 0.95,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getSource("resource-map-features-other")) {
    map.addSource("resource-map-features-other", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-features-other-fill")) {
    map.addLayer({
      id: "resource-map-features-other-fill",
      type: "fill",
      source: "resource-map-features-other",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#f59e0b",
          "#52525b",
        ],
        "fill-opacity": 0.18,
      },
    });
  }
  if (!map.getLayer("resource-map-features-other-line")) {
    map.addLayer({
      id: "resource-map-features-other-line",
      type: "line",
      source: "resource-map-features-other",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#d97706",
          "#3f3f46",
        ],
        "line-width": 1.5,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }
  if (!map.getLayer("resource-map-features-other-label")) {
    map.addLayer({
      id: "resource-map-features-other-label",
      type: "symbol",
      source: "resource-map-features-other",
      minzoom: 13,
      layout: {
        "text-field": ["coalesce", ["get", "resourceName"], ""],
        "text-size": 12,
        "text-offset": [0, 1.1],
        "text-anchor": "bottom",
        "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#3f3f46",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1,
      },
    });
  }

  if (!map.getSource("resource-map-features")) {
    map.addSource("resource-map-features", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-features-fill")) {
    map.addLayer({
      id: "resource-map-features-fill",
      type: "fill",
      source: "resource-map-features",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#f59e0b",
          "#2563eb",
        ],
        "fill-opacity": 0.28,
      },
    });
  }
  if (!map.getLayer("resource-map-features-line")) {
    map.addLayer({
      id: "resource-map-features-line",
      type: "line",
      source: "resource-map-features",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "isDirty"], true],
          "#d97706",
          "#1d4ed8",
        ],
        "line-width": 2,
      },
    });
  }

  if (!map.getSource("resource-map-feature-active")) {
    map.addSource("resource-map-feature-active", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-feature-active-fill")) {
    map.addLayer({
      id: "resource-map-feature-active-fill",
      type: "fill",
      source: "resource-map-feature-active",
      paint: {
        "fill-color": "#f97316",
        "fill-opacity": 0.3,
      },
    });
  }
  if (!map.getLayer("resource-map-feature-active-line")) {
    map.addLayer({
      id: "resource-map-feature-active-line",
      type: "line",
      source: "resource-map-feature-active",
      paint: {
        "line-color": "#ea580c",
        "line-width": 3,
      },
    });
  }

  if (!map.getSource("resource-map-feature-active-handles")) {
    map.addSource("resource-map-feature-active-handles", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-feature-active-midpoints")) {
    map.addLayer({
      id: "resource-map-feature-active-midpoints",
      type: "circle",
      source: "resource-map-feature-active-handles",
      filter: ["==", ["get", "handleType"], "midpoint"],
      paint: {
        "circle-color": "#22c55e",
        "circle-radius": 4,
        "circle-opacity": 0.95,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
  }
  if (!map.getLayer("resource-map-feature-active-vertices")) {
    map.addLayer({
      id: "resource-map-feature-active-vertices",
      type: "circle",
      source: "resource-map-feature-active-handles",
      filter: ["==", ["get", "handleType"], "vertex"],
      paint: {
        "circle-color": "#f97316",
        "circle-radius": 6,
        "circle-opacity": 1,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getSource("resource-map-features-draft")) {
    map.addSource("resource-map-features-draft", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-features-draft-fill")) {
    map.addLayer({
      id: "resource-map-features-draft-fill",
      type: "fill",
      source: "resource-map-features-draft",
      paint: {
        "fill-color": "#14b8a6",
        "fill-opacity": 0.24,
      },
    });
  }
  if (!map.getLayer("resource-map-features-draft-line")) {
    map.addLayer({
      id: "resource-map-features-draft-line",
      type: "line",
      source: "resource-map-features-draft",
      paint: {
        "line-color": "#0f766e",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }

  if (!map.getSource("resource-map-features-draft-points")) {
    map.addSource("resource-map-features-draft-points", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
    });
  }
  if (!map.getLayer("resource-map-features-draft-points")) {
    map.addLayer({
      id: "resource-map-features-draft-points",
      type: "circle",
      source: "resource-map-features-draft-points",
      paint: {
        "circle-color": "#0f766e",
        "circle-radius": 4,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    });
  }
};

const toDraftPointsFeatureCollection = (
  draftPoints: MapPolygonPoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: draftPoints.map((point, index) => ({
    type: "Feature",
    properties: {
      index,
    },
    geometry: {
      type: "Point",
      coordinates: point,
    },
  })),
});

const toActiveEditHandlesFeatureCollection = (
  feature: ResourceMapFeature | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> => {
  if (!feature) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  if (feature.geometryType === "Point") {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            handleType: "vertex",
            index: 0,
          },
          geometry: {
            type: "Point",
            coordinates: feature.point,
          },
        },
      ],
    };
  }

  if (feature.coordinates.length < 3) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }

  const vertexFeatures: GeoJSON.Feature<GeoJSON.Point>[] =
    feature.coordinates.map((point, index) => ({
      type: "Feature",
      properties: {
        handleType: "vertex",
        index,
      },
      geometry: {
        type: "Point",
        coordinates: point,
      },
    }));

  const midpointFeatures: GeoJSON.Feature<GeoJSON.Point>[] =
    feature.coordinates.map((point, index, coordinates) => {
      const nextIndex = (index + 1) % coordinates.length;
      const nextPoint = coordinates[nextIndex];
      return {
        type: "Feature",
        properties: {
          handleType: "midpoint",
          insertAfter: index,
        },
        geometry: {
          type: "Point",
          coordinates: [
            (point[0] + nextPoint[0]) / 2,
            (point[1] + nextPoint[1]) / 2,
          ],
        },
      };
    });

  return {
    type: "FeatureCollection",
    features: [...vertexFeatures, ...midpointFeatures],
  };
};

const fitToFeatureBounds = (map: MapboxMap, features: ResourceMapFeature[]) => {
  if (features.length === 0) {
    map.setCenter(DEFAULT_CENTER);
    map.setZoom(16);
    return;
  }

  const allPoints = features.flatMap((feature) =>
    feature.geometryType === "Point" ? [feature.point] : feature.coordinates,
  );
  if (allPoints.length === 0) {
    map.setCenter(DEFAULT_CENTER);
    map.setZoom(16);
    return;
  }

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  allPoints.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    map.setCenter(allPoints[0]);
    map.setZoom(18);
    return;
  }

  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 48, maxZoom: 20 },
  );
};

export default function ResourceFeaturesEditorClient({
  resourceId,
  embedded = false,
}: ResourceFeaturesEditorClientProps = {}) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialResourceId = resourceId ?? searchParams.get("resourceId") ?? "";
  const hasFixedResource = embedded && Boolean(resourceId);

  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [selectedResourceId, setSelectedResourceId] =
    useState(initialResourceId);
  const [dirtyFeatureResourceIds, setDirtyFeatureResourceIds] = useState<
    string[]
  >([]);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [featureLayer, setFeatureLayer] = useState("default");
  const [featureDescription, setFeatureDescription] = useState("");
  const [featureCoordinatesJson, setFeatureCoordinatesJson] = useState("[]");
  const [drawingGeometryType, setDrawingGeometryType] = useState<
    "Polygon" | "Point"
  >("Polygon");
  const [draftPoints, setDraftPoints] = useState<MapPolygonPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingResource, setDeletingResource] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [switchMenu, setSwitchMenu] = useState<ResourceSwitchMenuState | null>(
    null,
  );
  const [mapboxError, setMapboxError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [resourceFormLoading, setResourceFormLoading] = useState(false);
  const [resourceFormSaving, setResourceFormSaving] = useState(false);
  const [resourceFormMessage, setResourceFormMessage] = useState<string | null>(
    null,
  );
  const [resourceFormError, setResourceFormError] = useState<string | null>(
    null,
  );
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageFileMeta, setImageFileMeta] = useState<Array<ImageGps | null>>(
    [],
  );
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [relatedResourceOptions, setRelatedResourceOptions] = useState<
    RelatedResourceSelectOption[]
  >([]);
  const [relatedResourceLoading, setRelatedResourceLoading] = useState(false);
  const [isLocationDataLoading, setIsLocationDataLoading] = useState(false);
  const [saveAllPending, setSaveAllPending] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState(getDefaultCoverPrompt(""));
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isEditResourceCollapsed, setIsEditResourceCollapsed] = useState(false);
  const [resourceFormReloadVersion, setResourceFormReloadVersion] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty },
  } = useForm<ResourceFormValues>({
    defaultValues: {
      name: "",
      description: "",
      type: "tool",
      priority: "3",
      tags: "",
      relatedResourceIds: "",
      categories: "",
      categoryIds: "",
      attachable: false,
    },
  });

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const indoorLayerRef = useRef<string[] | null>(null);
  const isDrawingRef = useRef(false);
  const drawingGeometryTypeRef = useRef<"Polygon" | "Point">("Polygon");
  const featureLayerRef = useRef("default");
  const activeFeatureRef = useRef<ResourceMapFeature | null>(null);
  const activeFeatureIdRef = useRef<string | null>(activeFeatureId);
  const selectedResourceIdRef = useRef<string>(selectedResourceId);
  const resourcesRef = useRef<ResourceSummary[]>(resources);
  const dirtyFeatureResourceIdsRef = useRef<string[]>(dirtyFeatureResourceIds);
  const isLocationDataLoadingRef = useRef(false);
  const lastLoadedResourceIdRef = useRef<string>("");
  const hasAppliedInitialFeatureFitRef = useRef(false);
  const draggingVertexRef = useRef<{
    featureId: string;
    index: number;
  } | null>(null);

  const selectedResource = useMemo(
    () =>
      resources.find((resource) => resource.id === selectedResourceId) ?? null,
    [resources, selectedResourceId],
  );

  const mapFeatures = useMemo(
    () => selectedResource?.mapFeatures ?? [],
    [selectedResource],
  );

  const activeFeature = useMemo(
    () => mapFeatures.find((feature) => feature.id === activeFeatureId) ?? null,
    [activeFeatureId, mapFeatures],
  );

  const selectedResourceName = useMemo(
    () => selectedResource?.name ?? tx("Selected resource"),
    [selectedResource, tx],
  );

  const selectedResourceFeatureCollection = useMemo(
    () =>
      toResourceFeatureCollection({
        resourceId: selectedResourceId,
        resourceName: selectedResourceName,
        isDirty: dirtyFeatureResourceIds.includes(selectedResourceId),
        features: mapFeatures,
      }),
    [
      dirtyFeatureResourceIds,
      mapFeatures,
      selectedResourceId,
      selectedResourceName,
    ],
  );

  const selectedResourcePointCollection = useMemo(
    () =>
      toResourcePointFeatureCollection({
        resourceId: selectedResourceId,
        resourceName: selectedResourceName,
        isDirty: dirtyFeatureResourceIds.includes(selectedResourceId),
        features: mapFeatures,
      }),
    [
      dirtyFeatureResourceIds,
      mapFeatures,
      selectedResourceId,
      selectedResourceName,
    ],
  );

  const otherResourcesFeatureCollection = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Polygon>
  >(
    () => ({
      type: "FeatureCollection",
      features: resources
        .filter((resource) => resource.id !== selectedResourceId)
        .flatMap(
          (resource) =>
            toResourceFeatureCollection({
              resourceId: resource.id,
              resourceName: resource.name,
              isDirty: dirtyFeatureResourceIds.includes(resource.id),
              features: resource.mapFeatures,
            }).features,
        ),
    }),
    [dirtyFeatureResourceIds, resources, selectedResourceId],
  );

  const otherResourcesPointCollection = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point>
  >(
    () => ({
      type: "FeatureCollection",
      features: resources
        .filter((resource) => resource.id !== selectedResourceId)
        .flatMap(
          (resource) =>
            toResourcePointFeatureCollection({
              resourceId: resource.id,
              resourceName: resource.name,
              isDirty: dirtyFeatureResourceIds.includes(resource.id),
              features: resource.mapFeatures,
            }).features,
        ),
    }),
    [dirtyFeatureResourceIds, resources, selectedResourceId],
  );

  const resourceNameById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource.name])),
    [resources],
  );

  const resourceSelectOptions = useMemo<ResourceSelectOption[]>(
    () =>
      resources.map((resource) => ({
        value: resource.id,
        label: resource.name,
      })),
    [resources],
  );

  const selectedResourceOption = useMemo(
    () =>
      resourceSelectOptions.find(
        (option) => option.value === selectedResourceId,
      ) ?? null,
    [resourceSelectOptions, selectedResourceId],
  );

  const activeFeatureIndex = useMemo(
    () => mapFeatures.findIndex((feature) => feature.id === activeFeatureId),
    [activeFeatureId, mapFeatures],
  );

  const canFinishPolygon =
    drawingGeometryType === "Polygon" && isDrawing && draftPoints.length >= 3;

  const canSaveAll =
    !saveAllPending &&
    !saving &&
    !resourceFormSaving &&
    !isLocationDataLoading &&
    Boolean(selectedResourceId);

  const handleDeleteResource = useCallback(async () => {
    if (!selectedResourceId || deletingResource) {
      return;
    }

    const confirmed = window.confirm(
      tx("Really delete this resource? This cannot be undone."),
    );
    if (!confirmed) {
      return;
    }

    setDeletingResource(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/campai/resources/${selectedResourceId}`,
        {
          method: "DELETE",
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? tx("Unable to delete resource."));
      }

      router.push(localizePathname("/resources", locale));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Unable to delete resource."),
      );
    } finally {
      setDeletingResource(false);
    }
  }, [deletingResource, locale, router, selectedResourceId, tx]);

  const handleLocationDataLoadingChange = useCallback((isLoading: boolean) => {
    isLocationDataLoadingRef.current = isLoading;
    setIsLocationDataLoading(isLoading);
  }, []);

  const markSelectedResourceFeaturesDirty = useCallback(() => {
    if (!selectedResourceId) {
      return;
    }
    if (!dirtyFeatureResourceIdsRef.current.includes(selectedResourceId)) {
      dirtyFeatureResourceIdsRef.current = [
        ...dirtyFeatureResourceIdsRef.current,
        selectedResourceId,
      ];
    }
    setDirtyFeatureResourceIds((previous) => {
      if (previous.includes(selectedResourceId)) {
        return previous;
      }
      return [...previous, selectedResourceId];
    });
  }, [selectedResourceId]);

  const updateSelectedResourceFeatures = useCallback(
    (updater: (previous: ResourceMapFeature[]) => ResourceMapFeature[]) => {
      if (!selectedResourceId) {
        return;
      }
      setResources((previous) => {
        const nextResources = previous.map((resource) =>
          resource.id === selectedResourceId
            ? {
                ...resource,
                mapFeatures: updater(resource.mapFeatures),
              }
            : resource,
        );
        resourcesRef.current = nextResources;
        return nextResources;
      });
      markSelectedResourceFeaturesDirty();
    },
    [markSelectedResourceFeaturesDirty, selectedResourceId],
  );

  const updateSelectedResourceFeaturesRef = useRef(
    updateSelectedResourceFeatures,
  );

  useEffect(() => {
    if (!activeFeature) {
      setFeatureLayer("default");
      setFeatureDescription("");
      setFeatureCoordinatesJson("[]");
      return;
    }
    setFeatureLayer(activeFeature.layer);
    setFeatureDescription(activeFeature.description ?? "");
    setFeatureCoordinatesJson(
      JSON.stringify(
        activeFeature.geometryType === "Point"
          ? activeFeature.point
          : activeFeature.coordinates,
        null,
        2,
      ),
    );
  }, [activeFeature]);

  useEffect(() => {
    activeFeatureRef.current = activeFeature;
  }, [activeFeature]);

  useEffect(() => {
    activeFeatureIdRef.current = activeFeatureId;
  }, [activeFeatureId]);

  useEffect(() => {
    selectedResourceIdRef.current = selectedResourceId;
  }, [selectedResourceId]);

  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);

  useEffect(() => {
    dirtyFeatureResourceIdsRef.current = dirtyFeatureResourceIds;
  }, [dirtyFeatureResourceIds]);

  useEffect(() => {
    isLocationDataLoadingRef.current = isLocationDataLoading;
  }, [isLocationDataLoading]);

  useEffect(() => {
    updateSelectedResourceFeaturesRef.current = updateSelectedResourceFeatures;
  }, [updateSelectedResourceFeatures]);

  useEffect(() => {
    if (!hasFixedResource || !resourceId) {
      return;
    }
    if (selectedResourceId !== resourceId) {
      setSelectedResourceId(resourceId);
    }
  }, [hasFixedResource, resourceId, selectedResourceId]);

  useEffect(() => {
    let active = true;

    const loadResources = async () => {
      setLoadingResources(true);
      setErrorMessage(null);
      try {
        const response = await fetch(
          "/api/campai/resources?limit=1500&offset=0",
        );
        const payload = (await response.json()) as ResourcesListResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? tx("Unable to load resources."));
        }

        if (!active) {
          return;
        }

        const options = (payload.resources ?? [])
          .filter(
            (
              resource,
            ): resource is {
              id: string;
              name: string;
              mapFeatures?: unknown;
            } => {
              return Boolean(resource.id && resource.name);
            },
          )
          .map((resource) => ({
            id: resource.id,
            name: resource.name,
            type:
              typeof (resource as { type?: unknown }).type === "string"
                ? ((resource as { type?: string }).type ?? undefined)
                : undefined,
            mapFeatures: normalizeResourceMapFeatures(resource.mapFeatures),
          }));

        setResources(options);

        if (options.length > 0) {
          setSelectedResourceId((previous) => previous || options[0].id);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : tx("Unable to load resources."),
          );
        }
      } finally {
        if (active) {
          setLoadingResources(false);
        }
      }
    };

    void loadResources();

    return () => {
      active = false;
    };
  }, [tx]);

  useEffect(() => {
    let active = true;

    const loadRelatedResources = async () => {
      setRelatedResourceLoading(true);
      try {
        const response = await fetch(
          "/api/campai/resources?limit=1500&offset=0",
        );
        const payload = (await response.json()) as ResourcesListResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? tx("Unable to load resources."));
        }

        if (!active) {
          return;
        }

        const options = (payload.resources ?? [])
          .filter(
            (entry): entry is { id: string; name: string; type?: string } =>
              Boolean(entry.id && entry.name),
          )
          .map((entry) => ({
            value: entry.id,
            label: entry.name,
            resourceType:
              typeof (entry as { type?: unknown }).type === "string"
                ? ((entry as { type?: string }).type ?? undefined)
                : undefined,
          }));

        setRelatedResourceOptions(options);
      } catch {
        if (active) {
          setRelatedResourceOptions([]);
        }
      } finally {
        if (active) {
          setRelatedResourceLoading(false);
        }
      }
    };

    void loadRelatedResources();

    return () => {
      active = false;
    };
  }, [tx]);

  useEffect(() => {
    if (!selectedResourceId) {
      reset({
        name: "",
        description: "",
        type: "tool",
        priority: "3",
        tags: "",
        relatedResourceIds: "",
        categories: "",
        categoryIds: "",
        attachable: false,
      });
      setExistingImages([]);
      setImageFiles([]);
      setImageFileMeta([]);
      setImagePreviews([]);
      return;
    }

    let active = true;

    const loadResource = async () => {
      setResourceFormLoading(true);
      setResourceFormError(null);
      setResourceFormMessage(null);
      try {
        const data = await fetchJson<{ resource: Resource }>(
          `/api/campai/resources/${selectedResourceId}`,
        );

        if (!active) {
          return;
        }

        reset(getResourceFormValues(data.resource));
        setCoverPrompt(getDefaultCoverPrompt(data.resource.name ?? ""));
        const images = getResourceImages(data.resource);
        setExistingImages(images);
        setImageFiles([]);
        setImageFileMeta([]);
        setImagePreviews(images);
      } catch (error) {
        if (active) {
          setResourceFormError(
            error instanceof Error
              ? error.message
              : tx("Unable to load resource details."),
          );
        }
      } finally {
        if (active) {
          setResourceFormLoading(false);
        }
      }
    };

    void loadResource();

    return () => {
      active = false;
    };
  }, [reset, resourceFormReloadVersion, selectedResourceId, tx]);

  useEffect(() => {
    if (imageFiles.length === 0) {
      setImagePreviews(existingImages);
      return;
    }

    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews([...existingImages, ...previews]);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [existingImages, imageFiles]);

  useEffect(() => {
    setCoverSourceIndex((previous) => {
      const imageSourceCount = existingImages.filter((url) =>
        isImageUrl(url),
      ).length;
      if (imageSourceCount === 0) {
        return 0;
      }
      if (previous < 0 || previous >= imageSourceCount) {
        return 0;
      }
      return previous;
    });
  }, [existingImages]);

  const handleRemoveImage = (index: number) => {
    if (index < existingImages.length) {
      setExistingImages((previous) =>
        previous.filter((_, imageIndex) => imageIndex !== index),
      );
      return;
    }

    const fileIndex = index - existingImages.length;
    setImageFiles((previous) =>
      previous.filter((_, imageIndex) => imageIndex !== fileIndex),
    );
    setImageFileMeta((previous) =>
      previous.filter((_, imageIndex) => imageIndex !== fileIndex),
    );
  };

  const handleReorderImages = (order: number[]) => {
    const totalImages = existingImages.length + imageFiles.length;
    if (totalImages <= 1 || order.length !== totalImages) {
      return;
    }
    if (new Set(order).size !== totalImages) {
      return;
    }

    type OrderedImage =
      | { kind: "existing"; url: string }
      | { kind: "new"; file: File; meta: ImageGps | null };

    const orderedImages: OrderedImage[] = [
      ...existingImages.map((url) => ({ kind: "existing" as const, url })),
      ...imageFiles.map((file, fileIndex) => ({
        kind: "new" as const,
        file,
        meta: imageFileMeta[fileIndex] ?? null,
      })),
    ];

    const reordered = order.map((index) => orderedImages[index]);
    const nextExistingImages = reordered
      .filter((entry) => entry.kind === "existing")
      .map((entry) => entry.url);
    const nextNewImages = reordered.filter(
      (entry): entry is Extract<OrderedImage, { kind: "new" }> =>
        entry.kind === "new",
    );

    setExistingImages(nextExistingImages);
    setImageFiles(nextNewImages.map((entry) => entry.file));
    setImageFileMeta(nextNewImages.map((entry) => entry.meta));
  };

  const imageMeta = useMemo(
    () => [...existingImages.map(() => null), ...imageFileMeta],
    [existingImages, imageFileMeta],
  );

  const mediaKinds = useMemo(
    () => [
      ...existingImages.map((url) => getResourceMediaKindFromUrl(url)),
      ...imageFiles.map((file) => getResourceMediaKindFromMimeType(file.type)),
    ],
    [existingImages, imageFiles],
  );

  const coverSourceImages = useMemo(
    () => existingImages.filter((url) => isImageUrl(url)),
    [existingImages],
  );

  const handleResourceFormSubmit = useCallback(
    async (data: ResourceFormValues) => {
      if (!selectedResourceId) {
        setResourceFormError(tx("Choose a resource first."));
        return;
      }

      setResourceFormSaving(true);
      setResourceFormError(null);
      setResourceFormMessage(null);

      const name = data.name.trim();
      const type = data.type.trim();

      if (!name && imageFiles.length === 0) {
        setResourceFormSaving(false);
        setResourceFormError(
          tx("Name is required unless a file is provided.", "en"),
        );
        return;
      }
      if (!type) {
        setResourceFormSaving(false);
        setResourceFormError(tx("Type is required."));
        return;
      }

      const categoryError = getCategoryError(data.categories, data.categoryIds);
      if (categoryError) {
        setResourceFormSaving(false);
        setResourceFormError(categoryError);
        return;
      }

      const formData = createResourceFormData({
        formValues: data,
        imageFiles,
        existingImages,
        maxImageWidth: 2000,
      });

      try {
        const payload = await fetchJson<{ resource?: Resource }>(
          `/api/campai/resources/${selectedResourceId}`,
          {
            method: "PUT",
            body: formData,
          },
        );

        if (payload.resource) {
          const images = getResourceImages(payload.resource);
          setExistingImages(images);
          setImageFiles([]);
          setImageFileMeta([]);
        }

        setResourceFormMessage(tx("Resource updated."));
      } catch (error) {
        setResourceFormError(
          error instanceof Error
            ? error.message
            : tx("Unable to update resource."),
        );
      } finally {
        setResourceFormSaving(false);
      }
    },
    [existingImages, imageFiles, selectedResourceId, tx],
  );

  const refreshFeatures = useCallback(async () => {
    if (!selectedResourceId) {
      setActiveFeatureId(null);
      lastLoadedResourceIdRef.current = "";
      return;
    }

    const loadingResourceId = selectedResourceId;
    const isResourceSwitch =
      lastLoadedResourceIdRef.current !== loadingResourceId;

    setLoadingFeatures(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/campai/resources/${selectedResourceId}/features`,
      );
      const payload = (await response.json()) as ResourceFeaturesResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? tx("Unable to load map features."));
      }

      const normalized = normalizeResourceMapFeatures(
        payload.mapFeatures ?? [],
      );
      if (dirtyFeatureResourceIdsRef.current.includes(loadingResourceId)) {
        return;
      }

      setResources((previous) => {
        const nextResources = previous.map((resource) =>
          resource.id === loadingResourceId
            ? {
                ...resource,
                mapFeatures: normalized,
              }
            : resource,
        );
        resourcesRef.current = nextResources;
        return nextResources;
      });
      setDirtyFeatureResourceIds((previous) =>
        previous.filter((id) => id !== loadingResourceId),
      );

      const previousActiveId = activeFeatureIdRef.current;
      const nextActiveId = isResourceSwitch
        ? (normalized[0]?.id ?? null)
        : previousActiveId &&
            normalized.some((feature) => feature.id === previousActiveId)
          ? previousActiveId
          : (normalized[0]?.id ?? null);

      setActiveFeatureId(nextActiveId);
      setDraftPoints([]);
      setIsDrawing(false);
      setSwitchMenu(null);

      lastLoadedResourceIdRef.current = loadingResourceId;

      if (mapRef.current && !hasAppliedInitialFeatureFitRef.current) {
        fitToFeatureBounds(mapRef.current, normalized);
        hasAppliedInitialFeatureFitRef.current = true;
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Unable to load map features."),
      );
    } finally {
      setLoadingFeatures(false);
    }
  }, [selectedResourceId, tx]);

  useEffect(() => {
    setSwitchMenu(null);
  }, [selectedResourceId]);

  useEffect(() => {
    if (!selectedResourceId) {
      setActiveFeatureId(null);
      setDraftPoints([]);
      setIsDrawing(false);
      return;
    }

    if (!dirtyFeatureResourceIdsRef.current.includes(selectedResourceId)) {
      void refreshFeatures();
    }

    const selectedFeatures =
      resourcesRef.current.find(
        (resource) => resource.id === selectedResourceId,
      )?.mapFeatures ?? [];

    setActiveFeatureId(selectedFeatures[0]?.id ?? null);
    setDraftPoints([]);
    setIsDrawing(false);

    if (mapRef.current && !hasAppliedInitialFeatureFitRef.current) {
      fitToFeatureBounds(mapRef.current, selectedFeatures);
      hasAppliedInitialFeatureFitRef.current = true;
    }
  }, [refreshFeatures, selectedResourceId]);

  useEffect(() => {
    if (
      activeFeatureId &&
      mapFeatures.some((feature) => feature.id === activeFeatureId)
    ) {
      return;
    }
    setActiveFeatureId(mapFeatures[0]?.id ?? null);
  }, [activeFeatureId, mapFeatures]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    drawingGeometryTypeRef.current = drawingGeometryType;
  }, [drawingGeometryType]);

  useEffect(() => {
    featureLayerRef.current = featureLayer;
  }, [featureLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.getCanvas().style.cursor = isDrawing ? "crosshair" : "";
  }, [isDrawing]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapboxError(tx("Missing Mapbox token."));
      return;
    }
    if (!mapContainerRef.current) {
      return;
    }

    let mounted = true;

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;

      if (!mounted || !mapContainerRef.current) {
        return;
      }

      const mapStyle = isSatellite ? MAPBOX_SATELLITE_STYLE : MAPBOX_STYLE;

      if (!mapRef.current) {
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: DEFAULT_CENTER,
          zoom: 16,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        const applyOverlay = () => {
          /* addIndoorOverlay({
            map,
            token,
            tilesetId: DEFAULT_INDOOR_TILESET_ID,
            cacheRef: indoorLayerRef,
            onError: setMapboxError,
          }); */
        };

        map.on("load", () => {
          ensureSourcesAndLayers(map);
          void applyOverlay();
        });

        map.on("style.load", () => {
          ensureSourcesAndLayers(map);
          void applyOverlay();
        });

        map.on("mousedown", (event: MapMouseEvent) => {
          if (isDrawingRef.current) {
            return;
          }
          const selectedFeature = activeFeatureRef.current;
          if (!selectedFeature) {
            return;
          }
          const hits = map.queryRenderedFeatures(event.point, {
            layers: ["resource-map-feature-active-vertices"],
          });
          if (hits.length === 0) {
            return;
          }
          const indexRaw = hits[0]?.properties?.index;
          const index = Number(indexRaw);
          if (!Number.isInteger(index) || index < 0) {
            return;
          }

          draggingVertexRef.current = {
            featureId: selectedFeature.id,
            index,
          };
          map.dragPan.disable();
          map.getCanvas().style.cursor = "grabbing";
        });

        map.on("mousemove", (event: MapMouseEvent) => {
          const draggingVertex = draggingVertexRef.current;
          if (!draggingVertex) {
            return;
          }
          const nextPoint: MapPolygonPoint = [
            event.lngLat.lng,
            event.lngLat.lat,
          ];
          updateSelectedResourceFeaturesRef.current((previous) =>
            previous.map((feature) => {
              if (feature.id !== draggingVertex.featureId) {
                return feature;
              }
              if (feature.geometryType === "Point") {
                return {
                  ...feature,
                  point: nextPoint,
                };
              }
              if (
                draggingVertex.index < 0 ||
                draggingVertex.index >= feature.coordinates.length
              ) {
                return feature;
              }
              const nextCoordinates = feature.coordinates.map(
                (point) => [...point] as MapPolygonPoint,
              );
              nextCoordinates[draggingVertex.index] = nextPoint;
              return {
                ...feature,
                coordinates: nextCoordinates,
              };
            }),
          );
        });

        const endVertexDrag = () => {
          if (!draggingVertexRef.current) {
            return;
          }
          draggingVertexRef.current = null;
          map.dragPan.enable();
          map.getCanvas().style.cursor = isDrawingRef.current
            ? "crosshair"
            : "";
          setMessage(tx("Polygon updated. Save to persist."));
          setErrorMessage(null);
        };

        map.on("mouseup", endVertexDrag);
        map.on("dragend", endVertexDrag);

        map.on("click", (event: MapMouseEvent) => {
          setSwitchMenu(null);
          if (isDrawingRef.current) {
            if (drawingGeometryTypeRef.current === "Point") {
              const normalizedPoint = normalizeResourceMapFeatures([
                {
                  id:
                    typeof crypto !== "undefined"
                      ? crypto.randomUUID()
                      : `${Date.now()}`,
                  layer: featureLayerRef.current,
                  geometryType: "Point",
                  point: [event.lngLat.lng, event.lngLat.lat],
                },
              ]);
              if (normalizedPoint.length > 0) {
                const created = normalizedPoint[0];
                updateSelectedResourceFeaturesRef.current((previous) => [
                  ...previous,
                  created,
                ]);
                setActiveFeatureId(created.id);
                setMessage(tx("Point added. Save to persist."));
                setErrorMessage(null);
                setIsDrawing(false);
              }
              return;
            }
            setDraftPoints((previous) => [
              ...previous,
              [event.lngLat.lng, event.lngLat.lat],
            ]);
            return;
          }

          const selectedFeature = activeFeatureRef.current;
          if (!selectedFeature) {
            return;
          }

          const vertexHits = map.queryRenderedFeatures(event.point, {
            layers: ["resource-map-feature-active-vertices"],
          });

          const wantsDelete =
            event.originalEvent instanceof MouseEvent &&
            (event.originalEvent.altKey || event.originalEvent.metaKey);

          if (vertexHits.length > 0 && wantsDelete) {
            const index = Number(vertexHits[0]?.properties?.index);
            if (!Number.isInteger(index)) {
              return;
            }
            updateSelectedResourceFeaturesRef.current((previous) =>
              previous.map((feature) => {
                if (feature.id !== selectedFeature.id) {
                  return feature;
                }
                if (feature.geometryType !== "Polygon") {
                  return feature;
                }
                if (feature.coordinates.length <= 3) {
                  return feature;
                }
                if (index < 0 || index >= feature.coordinates.length) {
                  return feature;
                }
                return {
                  ...feature,
                  coordinates: feature.coordinates.filter(
                    (_, coordinateIndex) => coordinateIndex !== index,
                  ),
                };
              }),
            );
            setMessage(tx("Point removed. Save to persist."));
            setErrorMessage(null);
            return;
          }

          const midpointHits = map.queryRenderedFeatures(event.point, {
            layers: ["resource-map-feature-active-midpoints"],
          });

          if (midpointHits.length > 0) {
            const insertAfter = Number(
              midpointHits[0]?.properties?.insertAfter,
            );
            if (!Number.isInteger(insertAfter)) {
              return;
            }
            updateSelectedResourceFeaturesRef.current((previous) =>
              previous.map((feature) => {
                if (feature.id !== selectedFeature.id) {
                  return feature;
                }
                if (feature.geometryType !== "Polygon") {
                  return feature;
                }
                const nextCoordinates = feature.coordinates.map(
                  (point) => [...point] as MapPolygonPoint,
                );
                const insertAt = Math.min(
                  Math.max(insertAfter + 1, 0),
                  nextCoordinates.length,
                );
                nextCoordinates.splice(insertAt, 0, [
                  event.lngLat.lng,
                  event.lngLat.lat,
                ]);
                return {
                  ...feature,
                  coordinates: nextCoordinates,
                };
              }),
            );
            setMessage(tx("Point added. Save to persist."));
            setErrorMessage(null);
          }
        });

        map.on("contextmenu", (event: MapMouseEvent) => {
          if (hasFixedResource) {
            return;
          }
          event.preventDefault();

          const hitFeatures = map.queryRenderedFeatures(event.point, {
            layers: [
              "resource-map-points-other",
              "resource-map-points",
              "resource-map-features-other-fill",
              "resource-map-features-fill",
              "resource-map-feature-active-fill",
            ],
          });

          const selectedId = selectedResourceIdRef.current;
          const hitIds = hitFeatures
            .map((feature) => {
              const resourceId = feature.properties?.resourceId;
              const layerId = feature.layer?.id;
              if (typeof resourceId === "string" && resourceId.length > 0) {
                return resourceId;
              }
              if (
                layerId === "resource-map-features-fill" ||
                layerId === "resource-map-feature-active-fill" ||
                layerId === "resource-map-points"
              ) {
                return selectedId;
              }
              return null;
            })
            .filter((id): id is string => Boolean(id));

          const uniqueIds = Array.from(new Set(hitIds));
          if (uniqueIds.length === 0) {
            setSwitchMenu(null);
            return;
          }

          setSwitchMenu({
            x: event.point.x,
            y: event.point.y,
            resourceIds: uniqueIds,
          });
        });

        mapRef.current = map;
      } else {
        mapRef.current.setStyle(mapStyle);
      }
    };

    void initMap();

    return () => {
      mounted = false;
    };
  }, [hasFixedResource, isSatellite, tx]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    updateMapSource(
      map,
      "resource-map-features-other",
      otherResourcesFeatureCollection,
    );
    updateMapSource(
      map,
      "resource-map-points-other",
      otherResourcesPointCollection,
    );
    updateMapSource(
      map,
      "resource-map-features",
      selectedResourceFeatureCollection,
    );
    updateMapSource(
      map,
      "resource-map-points",
      selectedResourcePointCollection,
    );
    updateMapSource(
      map,
      "resource-map-feature-active",
      featureCollectionForSingleFeature(activeFeature),
    );
    updateMapSource(
      map,
      "resource-map-features-draft",
      draftFeatureCollection(draftPoints, featureLayer),
    );
    updateMapSource(
      map,
      "resource-map-features-draft-points",
      toDraftPointsFeatureCollection(draftPoints),
    );
    updateMapSource(
      map,
      "resource-map-feature-active-handles",
      toActiveEditHandlesFeatureCollection(activeFeature),
    );
  }, [
    activeFeature,
    draftPoints,
    featureLayer,
    mapFeatures,
    otherResourcesFeatureCollection,
    otherResourcesPointCollection,
    selectedResourcePointCollection,
    selectedResourceFeatureCollection,
  ]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const handleSaveFeatures = useCallback(async () => {
    if (dirtyFeatureResourceIds.length === 0) {
      setMessage(tx("No map feature changes to save."));
      setErrorMessage(null);
      return true;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const updates = new Map<string, ResourceMapFeature[]>();

      for (const resourceIdToSave of dirtyFeatureResourceIds) {
        const resource = resources.find(
          (entry) => entry.id === resourceIdToSave,
        );
        if (!resource) {
          continue;
        }

        const response = await fetch(
          `/api/campai/resources/${resourceIdToSave}/features`,
          {
            method: "PUT",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ mapFeatures: resource.mapFeatures }),
          },
        );
        const payload = (await response.json()) as {
          mapFeatures?: unknown;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            payload.error ??
              `${tx("Unable to save map features for")} ${resource.name}.`,
          );
        }

        updates.set(
          resourceIdToSave,
          normalizeResourceMapFeatures(payload.mapFeatures ?? []),
        );
      }

      setResources((previous) =>
        previous.map((resource) => {
          const nextFeatures = updates.get(resource.id);
          if (!nextFeatures) {
            return resource;
          }
          return {
            ...resource,
            mapFeatures: nextFeatures,
          };
        }),
      );
      setDirtyFeatureResourceIds((previous) =>
        previous.filter((id) => !updates.has(id)),
      );

      const savedCount = updates.size;
      setMessage(
        savedCount === 1
          ? tx("Map features saved for 1 resource.")
          : `${tx("Map features saved for")} ${savedCount} ${tx("resources.")}`,
      );
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Unable to save map features."),
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirtyFeatureResourceIds, resources, tx]);

  const handleFinishPolygon = useCallback(() => {
    if (drawingGeometryType !== "Polygon") {
      return;
    }
    if (draftPoints.length < 3) {
      setErrorMessage(tx("A polygon needs at least three points."));
      return;
    }

    const normalized = normalizeResourceMapFeatures([
      {
        id:
          typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`,
        layer: featureLayer,
        coordinates: draftPoints,
      },
    ]);

    if (normalized.length === 0) {
      setErrorMessage(tx("Invalid polygon points."));
      return;
    }

    const created = normalized[0];
    updateSelectedResourceFeatures((previous) => [...previous, created]);
    setActiveFeatureId(created.id);
    setDraftPoints([]);
    setIsDrawing(false);
    setMessage(tx("Polygon added. Save to persist."));
    setErrorMessage(null);
  }, [
    drawingGeometryType,
    draftPoints,
    featureLayer,
    tx,
    updateSelectedResourceFeatures,
  ]);

  const handleApplyFeatureEdit = () => {
    if (!activeFeature) {
      return;
    }
    let parsedCoordinates: unknown;
    try {
      parsedCoordinates = JSON.parse(featureCoordinatesJson);
    } catch {
      setErrorMessage(tx("Coordinates must be valid JSON."));
      return;
    }

    const normalized = normalizeResourceMapFeatures([
      activeFeature.geometryType === "Point"
        ? {
            id: activeFeature.id,
            layer: featureLayer,
            description: featureDescription,
            geometryType: "Point",
            point: parsedCoordinates,
          }
        : {
            id: activeFeature.id,
            layer: featureLayer,
            description: featureDescription,
            geometryType: "Polygon",
            coordinates: parsedCoordinates,
          },
    ]);

    if (normalized.length === 0) {
      setErrorMessage(
        activeFeature.geometryType === "Point"
          ? tx("Point is invalid. Use [lng, lat].")
          : tx(
              "Coordinates are invalid. Use [[lng, lat], ...] with at least 3 points.",
              "en",
            ),
      );
      return;
    }

    updateSelectedResourceFeatures((previous) =>
      previous.map((feature) =>
        feature.id === activeFeature.id ? normalized[0] : feature,
      ),
    );
    setMessage(tx("Feature updated. Save to persist."));
    setErrorMessage(null);
  };

  const handleDeleteFeature = () => {
    if (!activeFeatureId) {
      return;
    }
    updateSelectedResourceFeatures((previous) =>
      previous.filter((feature) => feature.id !== activeFeatureId),
    );
    setActiveFeatureId(null);
    setMessage(tx("Feature removed. Save to persist."));
    setErrorMessage(null);
  };

  const handleToggleDrawing = useCallback(() => {
    if (!selectedResourceId) {
      return;
    }
    setDraftPoints([]);
    setIsDrawing((prev) => !prev);
    setErrorMessage(null);
    setMessage(null);
  }, [selectedResourceId]);

  const handleSelectRelativeFeature = useCallback(
    (offset: number) => {
      if (mapFeatures.length === 0) {
        return;
      }
      const currentIndex = mapFeatures.findIndex(
        (feature) => feature.id === activeFeatureId,
      );
      const baseIndex = currentIndex < 0 ? 0 : currentIndex;
      const nextIndex =
        (baseIndex + offset + mapFeatures.length) % mapFeatures.length;
      setActiveFeatureId(mapFeatures[nextIndex]?.id ?? null);
    },
    [activeFeatureId, mapFeatures],
  );

  const handleSaveAll = useCallback(async () => {
    if (!selectedResourceId) {
      setResourceFormError(tx("Choose a resource first."));
      return;
    }
    if (isLocationDataLoadingRef.current || isLocationDataLoading) {
      setResourceFormError(
        tx(
          "Wait until image location data has finished loading before saving.",
        ),
      );
      return;
    }

    setSaveAllPending(true);
    setResourceFormMessage(null);
    setResourceFormError(null);

    let formSaved = false;

    await handleSubmit(
      async (data) => {
        await handleResourceFormSubmit(data);
        formSaved = true;
      },
      () => {
        setResourceFormError(tx("Please fix the form validation errors."));
      },
    )();

    if (!formSaved) {
      setSaveAllPending(false);
      return;
    }

    const featuresSaved = await handleSaveFeatures();

    if (featuresSaved) {
      setResourceFormMessage(tx("Resource and map features saved."));
      setMessage(tx("Map features saved."));
    }

    setSaveAllPending(false);
  }, [
    handleResourceFormSubmit,
    handleSaveFeatures,
    handleSubmit,
    isLocationDataLoading,
    selectedResourceId,
    tx,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable),
      );
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        if (canSaveAll) {
          void handleSaveAll();
        }
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if (!selectedResourceId) {
        return;
      }

      if (key === "d") {
        event.preventDefault();
        handleToggleDrawing();
        return;
      }

      if (key === "p") {
        event.preventDefault();
        setDrawingGeometryType("Point");
        if (!isDrawing) {
          setDraftPoints([]);
          setIsDrawing(true);
        }
        setMessage(null);
        setErrorMessage(null);
        return;
      }

      if (key === "g") {
        event.preventDefault();
        setDrawingGeometryType("Polygon");
        if (!isDrawing) {
          setDraftPoints([]);
          setIsDrawing(true);
        }
        setMessage(null);
        setErrorMessage(null);
        return;
      }

      if (key === "enter" && canFinishPolygon) {
        event.preventDefault();
        handleFinishPolygon();
        return;
      }

      if (event.key === "Escape" && isDrawing) {
        event.preventDefault();
        setDraftPoints([]);
        setIsDrawing(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    canFinishPolygon,
    canSaveAll,
    handleFinishPolygon,
    handleSaveAll,
    handleToggleDrawing,
    isDrawing,
    selectedResourceId,
  ]);

  return (
    <main
      className={
        embedded
          ? "flex w-full flex-col gap-6"
          : "mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-10"
      }
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!hasFixedResource ? (
            <div className="mt-3 max-w-xl">
              <Select<ResourceSelectOption, false>
                inputId="resource-select"
                value={selectedResourceOption}
                onChange={(option) =>
                  setSelectedResourceId(option?.value ?? "")
                }
                options={resourceSelectOptions}
                placeholder={
                  loadingResources
                    ? tx("Loading resources...")
                    : tx("Select a resource")
                }
                isDisabled={loadingResources}
                isSearchable
                className="text-sm"
                classNamePrefix="resource-select"
                noOptionsMessage={() => tx("No resources found")}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLocationDataLoading ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-warning-border bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
              <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
              {tx("Loading location data...")}
            </span>
          ) : null}
          {!embedded ? (
            <Button
              href={
                selectedResourceId
                  ? localizePathname(`/resources/${selectedResourceId}`, locale)
                  : localizePathname("/resources", locale)
              }
              kind="secondary"
              icon={faArrowLeft}
            >
              {tx("Back to resource")}
            </Button>
          ) : null}
          <Button
            type="button"
            kind="danger-secondary"
            icon={faTrash}
            onClick={handleDeleteResource}
            disabled={!selectedResourceId || deletingResource}
          >
            {deletingResource ? tx("Deleting...") : tx("Delete")}
          </Button>
          <Button
            type="button"
            kind="primary"
            icon={faFloppyDisk}
            onClick={handleSaveAll}
            disabled={!canSaveAll}
          >
            {saveAllPending || saving || resourceFormSaving
              ? tx("Saving...")
              : isLocationDataLoading
                ? tx("Loading location data...")
                : tx("Save all")}
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <section className="rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
          {errorMessage}
        </section>
      ) : null}

      {message ? (
        <section className="rounded-2xl border border-success-border bg-success-soft p-4 text-sm text-success">
          {message}
        </section>
      ) : null}

      {isLocationDataLoading ? (
        <section className="rounded-2xl border border-warning-border bg-warning-soft p-4 text-sm text-warning">
          <span className="inline-flex items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
            {tx(
              "Image metadata is being processed. Saving is temporarily disabled.",
              "en",
            )}
          </span>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              {tx("Fast actions:")}{" "}
              <span className="font-semibold text-foreground/90">⌘/Ctrl+S</span>{" "}
              {tx("Save")} ·{" "}
              <span className="font-semibold text-foreground/90">D</span>{" "}
              {tx("Draw toggle")} ·{" "}
              <span className="font-semibold text-foreground/90">P</span>{" "}
              {tx("Point")} ·{" "}
              <span className="font-semibold text-foreground/90">G</span>{" "}
              {tx("Polygon")} ·{" "}
              <span className="font-semibold text-foreground/90">Enter</span>{" "}
              {tx("Finish polygon")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                kind="secondary"
                onClick={() => handleSelectRelativeFeature(-1)}
                disabled={mapFeatures.length < 2}
              >
                {tx("Prev feature")}
              </Button>
              <Button
                type="button"
                kind="secondary"
                onClick={() => handleSelectRelativeFeature(1)}
                disabled={mapFeatures.length < 2}
              >
                {tx("Next feature")}
              </Button>
              <Button
                type="button"
                kind={isDrawing ? "danger-secondary" : "secondary"}
                onClick={handleToggleDrawing}
                disabled={!selectedResourceId}
              >
                {isDrawing ? tx("Stop drawing") : tx("Start drawing")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              kind="secondary"
              onClick={refreshFeatures}
              disabled={!selectedResourceId || loadingFeatures}
            >
              {loadingFeatures ? tx("Loading...") : tx("Reload")}
            </Button>
            <Button
              type="button"
              kind={isDrawing ? "danger-secondary" : "secondary"}
              onClick={handleToggleDrawing}
              disabled={!selectedResourceId}
            >
              {isDrawing
                ? tx("Stop drawing")
                : drawingGeometryType === "Point"
                  ? tx("Draw point")
                  : tx("Draw polygon")}
            </Button>
            <select
              value={drawingGeometryType}
              onChange={(event) =>
                setDrawingGeometryType(
                  event.target.value === "Point" ? "Point" : "Polygon",
                )
              }
              className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground/80"
            >
              <option value="Polygon">{tx("Polygon")}</option>
              <option value="Point">{tx("Point")}</option>
            </select>
            <Button
              type="button"
              kind="secondary"
              onClick={handleFinishPolygon}
              disabled={!canFinishPolygon}
            >
              {tx("Finish polygon")}
            </Button>
          </div>

          <div>
            <label
              htmlFor="draft-layer"
              className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
            >
              {tx("Layer")}
            </label>
            <input
              id="draft-layer"
              value={featureLayer}
              onChange={(event) => setFeatureLayer(event.target.value)}
              placeholder={tx("default")}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Features ({mapFeatures.length})
              </p>
              {activeFeatureIndex >= 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  {activeFeatureIndex + 1}/{mapFeatures.length}
                </span>
              ) : null}
            </div>
            {mapFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tx("No features yet.")}</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {mapFeatures.map((feature, index) => {
                  const isActive = feature.id === activeFeatureId;
                  return (
                    <li key={feature.id}>
                      <button
                        type="button"
                        onClick={() => setActiveFeatureId(feature.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "border-primary-border bg-primary-soft text-primary"
                            : "border-border bg-card text-foreground/80 hover:border-input"
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <FontAwesomeIcon
                            icon={faLayerGroup}
                            className="text-xs"
                          />
                          {feature.layer}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {feature.geometryType === "Point"
                            ? `${tx("Point")} ${index + 1}`
                            : `${tx("Polygon")} ${index + 1} • ${feature.coordinates.length} ${tx("points")}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {activeFeature ? (
            <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {tx("Edit selected feature")}
              </p>
              <div>
                <label
                  htmlFor="selected-layer"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  {tx("Layer")}
                </label>
                <input
                  id="selected-layer"
                  value={featureLayer}
                  onChange={(event) => setFeatureLayer(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label
                  htmlFor="selected-coordinates"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  {activeFeature.geometryType === "Point"
                    ? tx("Point JSON")
                    : tx("Coordinates JSON")}
                </label>
                <textarea
                  id="selected-coordinates"
                  value={featureCoordinatesJson}
                  onChange={(event) =>
                    setFeatureCoordinatesJson(event.target.value)
                  }
                  rows={8}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {tx("Description")}
                </label>
                <MdxEditorInput
                  value={featureDescription}
                  onChange={setFeatureDescription}
                  ariaLabel={tx("Map element description", "en")}
                  placeholder={tx(
                    "Optional text for this map element. You can also embed already uploaded images.",
                    "en",
                  )}
                  availableImageUrls={existingImages}
                  embedButtonLabel={tx("Embed uploaded image", "en")}
                  emptyImageMessage={tx(
                    "Uploaded images become available here after they have been saved.",
                    "en",
                  )}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  kind="secondary"
                  onClick={handleApplyFeatureEdit}
                >
                  {tx("Apply edit")}
                </Button>
                <Button
                  type="button"
                  kind="danger-secondary"
                  icon={faXmark}
                  onClick={handleDeleteFeature}
                >
                  {tx("Delete")}
                </Button>
              </div>
            </div>
          ) : null}

          {isDrawing ? (
            <p className="text-xs text-muted-foreground">
              {drawingGeometryType === "Point"
                ? tx("Drawing mode active: click the map to place a point.")
                : tx(
                    "Drawing mode active: click the map to add polygon points.",
                    "en",
                  )}
            </p>
          ) : activeFeature ? (
            <p className="text-xs text-muted-foreground">
              {tx(
                "Edit mode: drag orange points to move, click green points to add, Alt/Option-click orange points to remove.",
                "en",
              )}
            </p>
          ) : null}
        </aside>

        <section className="relative overflow-hidden rounded-2xl border border-border bg-card lg:min-h-[70vh]">
          {mapboxError ? (
            <div className="flex h-[70vh] items-center justify-center p-6 text-sm text-muted-foreground">
              {mapboxError}
            </div>
          ) : (
            <div ref={mapContainerRef} className="h-[70vh] w-full" />
          )}
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSatellite((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-semibold text-foreground/80 shadow-sm"
            >
              <FontAwesomeIcon
                icon={isSatellite ? faMap : faSatellite}
                className="text-[10px]"
              />
              {isSatellite ? tx("Map") : tx("Satellite")}
            </button>
          </div>
          {switchMenu && !hasFixedResource ? (
            <div
              className="absolute z-30 min-w-56 rounded-lg border border-border bg-card p-2 shadow-lg"
              style={{
                left: Math.max(8, Math.min(switchMenu.x, 860)),
                top: Math.max(8, Math.min(switchMenu.y, 620)),
              }}
            >
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tx("Switch resource")}
              </p>
              <div className="mt-1 space-y-1">
                {switchMenu.resourceIds.map((resourceId) => {
                  const label = resourceNameById.get(resourceId) ?? resourceId;
                  const isSelected = resourceId === selectedResourceId;

                  return (
                    <button
                      key={resourceId}
                      type="button"
                      onClick={() => {
                        setSwitchMenu(null);
                        if (resourceId !== selectedResourceId) {
                          setSelectedResourceId(resourceId);
                        }
                      }}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                        isSelected
                          ? "bg-primary-soft text-primary"
                          : "text-foreground/80 hover:bg-accent"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {tx("Edit resource")}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isDirty ? (
              <span className="rounded-full border border-warning-border bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                {tx("Unsaved changes")}
              </span>
            ) : (
              <span className="rounded-full border border-success-border bg-success-soft px-2 py-1 text-xs font-semibold text-success">
                {tx("Saved state")}
              </span>
            )}
            <Button
              type="button"
              kind="secondary"
              icon={faRotateLeft}
              onClick={() => setResourceFormReloadVersion((value) => value + 1)}
              disabled={
                !selectedResourceId || resourceFormLoading || resourceFormSaving
              }
            >
              {tx("Reset form")}
            </Button>
            <Button
              type="button"
              kind="secondary"
              icon={isEditResourceCollapsed ? faChevronDown : faChevronUp}
              onClick={() => setIsEditResourceCollapsed((value) => !value)}
            >
              {isEditResourceCollapsed ? tx("Expand") : tx("Collapse")}
            </Button>
          </div>
        </div>

        {resourceFormError || resourceFormMessage ? (
          <div className="mt-2 space-y-2">
            {resourceFormError ? (
              <div className="rounded-xl border border-destructive-border bg-destructive-soft p-2.5 text-sm text-destructive">
                {resourceFormError}
              </div>
            ) : null}

            {resourceFormMessage ? (
              <div className="rounded-xl border border-success-border bg-success-soft p-2.5 text-sm text-success">
                {resourceFormMessage}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isEditResourceCollapsed ? (
          resourceFormLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {tx("Loading resource...")}
            </p>
          ) : (
            <div className="mt-2.5">
              <ResourceForm
                register={register}
                watch={watch}
                setValue={setValue}
                setImageFiles={setImageFiles}
                setImageFileMeta={setImageFileMeta}
                onImageProcessingChange={handleLocationDataLoadingChange}
                imagePreviews={imagePreviews}
                mediaKinds={mediaKinds}
                imageMeta={imageMeta}
                onRemoveImage={handleRemoveImage}
                onReorderImages={handleReorderImages}
                onSubmit={handleSubmit(handleResourceFormSubmit)}
                saving={resourceFormSaving}
                submitLabel={tx("Update resource")}
                fileLabel={tx("Files", "en")}
                descriptionAvailableImageUrls={existingImages}
                relatedResourceOptions={relatedResourceOptions.filter(
                  (option) => option.value !== selectedResourceId,
                )}
                relatedResourceLoading={relatedResourceLoading}
                priorityInput="stars"
                maxImageWidth={2000}
                showSubmitButton={false}
              />
            </div>
          )
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold text-foreground">
          {tx("Generate cover image")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx(
            "Creates a new cover image from the selected existing photo and keeps the original image as an additional photo.",
            "en",
          )}
        </p>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tx("Source image")}
            </label>
            <select
              value={String(coverSourceIndex)}
              onChange={(event) =>
                setCoverSourceIndex(Number.parseInt(event.target.value, 10))
              }
              disabled={coverSourceImages.length === 0}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              {coverSourceImages.length === 0 ? (
                <option value="0">{tx("No existing images")}</option>
              ) : (
                coverSourceImages.map((_, imageIndex) => (
                  <option
                    key={`cover-source-${imageIndex}`}
                    value={String(imageIndex)}
                  >
                    {tx("Image")} {imageIndex + 1}
                  </option>
                ))
              )}
            </select>
          </div>

          <textarea
            value={coverPrompt}
            onChange={(event) => setCoverPrompt(event.target.value)}
            rows={6}
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80"
            placeholder={tx("Cover prompt")}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              kind="secondary"
              disabled={
                generatingCover ||
                resourceFormSaving ||
                saveAllPending ||
                coverSourceImages.length === 0 ||
                !selectedResourceId
              }
              onClick={async () => {
                if (generatingCover || resourceFormSaving || saveAllPending) {
                  return;
                }
                if (!selectedResourceId) {
                  setResourceFormError(tx("Choose a resource first."));
                  return;
                }
                if (coverSourceImages.length === 0) {
                  setResourceFormError(
                    tx(
                      "Upload at least one image first, then generate a cover.",
                      "en",
                    ),
                  );
                  return;
                }

                const confirmed = window.confirm(
                  `${tx("Generate a new cover image from Image")} ${coverSourceIndex + 1}? ${tx("The original photo will be kept as an additional image.")}`,
                );
                if (!confirmed) {
                  return;
                }

                setGeneratingCover(true);
                setResourceFormMessage(null);
                setResourceFormError(null);

                try {
                  const data = await fetchJson<{ resource?: Resource }>(
                    `/api/campai/resources/${selectedResourceId}/cover`,
                    {
                      method: "POST",
                      headers: {
                        "content-type": "application/json",
                      },
                      body: JSON.stringify({
                        prompt: coverPrompt,
                        sourceIndex: coverSourceIndex,
                      }),
                    },
                  );

                  const images = data.resource
                    ? getResourceImages(data.resource)
                    : null;

                  if (images && images.length > 0) {
                    setExistingImages(images);
                    setResourceFormMessage(tx("Cover image generated."));
                  } else {
                    setResourceFormMessage(
                      tx(
                        "Cover image generated, but could not refresh images.",
                        "en",
                      ),
                    );
                  }
                } catch (error) {
                  setResourceFormError(
                    error instanceof Error
                      ? error.message
                      : tx("Unable to generate cover image."),
                  );
                } finally {
                  setGeneratingCover(false);
                }
              }}
            >
              {generatingCover ? tx("Generating...") : tx("Generate cover")}
            </Button>
            {existingImages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tx('Add images and click "Save all" first.')}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
