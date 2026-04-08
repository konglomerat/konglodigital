export type MapPolygonPoint = [number, number];

export type ResourceMapPolygonFeature = {
  id: string;
  layer: string;
  geometryType: "Polygon";
  coordinates: MapPolygonPoint[];
};

export type ResourceMapPointFeature = {
  id: string;
  layer: string;
  geometryType: "Point";
  point: MapPolygonPoint;
};

export type ResourceMapFeature =
  | ResourceMapPolygonFeature
  | ResourceMapPointFeature;

const MAX_FEATURES = 200;
const MAX_POINTS_PER_FEATURE = 400;

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePoint = (value: unknown): MapPolygonPoint | null => {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const lng = toFiniteNumber(value[0]);
  const lat = toFiniteNumber(value[1]);
  if (lng === null || lat === null) {
    return null;
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null;
  }
  return [lng, lat];
};

const normalizeLayer = (value: unknown) => {
  if (typeof value !== "string") {
    return "default";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 64) : "default";
};

const normalizeGeometryType = (value: unknown) => {
  if (typeof value !== "string") {
    return "Polygon" as const;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "point" ? ("Point" as const) : ("Polygon" as const);
};

export const normalizeResourceMapFeatures = (
  value: unknown,
): ResourceMapFeature[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const features = value
    .map((entry, index): ResourceMapFeature | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const row = entry as Record<string, unknown>;
      const geometry =
        row.geometry && typeof row.geometry === "object"
          ? (row.geometry as Record<string, unknown>)
          : null;
      const geometryType = normalizeGeometryType(
        row.geometryType ?? geometry?.type ?? row.type,
      );
      const rawCoordinates = Array.isArray(row.coordinates)
        ? row.coordinates
        : Array.isArray(row.points)
          ? row.points
          : [];

      const idCandidate =
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim()
          : `feature-${index + 1}`;

      if (geometryType === "Point") {
        const pointCandidate = normalizePoint(
          row.point ??
            row.coordinate ??
            row.coordinates ??
            geometry?.coordinates,
        );
        if (!pointCandidate) {
          return null;
        }
        return {
          id: idCandidate.slice(0, 80),
          layer: normalizeLayer(row.layer),
          geometryType: "Point",
          point: pointCandidate,
        };
      }

      const coordinates = rawCoordinates
        .map((point) => normalizePoint(point))
        .filter((point): point is MapPolygonPoint => point !== null)
        .slice(0, MAX_POINTS_PER_FEATURE);
      if (coordinates.length < 3) {
        return null;
      }

      return {
        id: idCandidate.slice(0, 80),
        layer: normalizeLayer(row.layer),
        geometryType: "Polygon",
        coordinates,
      };
    })
    .filter((feature): feature is ResourceMapFeature => feature !== null)
    .slice(0, MAX_FEATURES);

  return features;
};

export const getPolygonFeatures = (features: ResourceMapFeature[]) =>
  features.filter(
    (feature): feature is ResourceMapPolygonFeature =>
      feature.geometryType === "Polygon",
  );

export const getPointFeatures = (features: ResourceMapFeature[]) =>
  features.filter(
    (feature): feature is ResourceMapPointFeature =>
      feature.geometryType === "Point",
  );

export const upsertGpsPointFeature = ({
  features,
  latitude,
  longitude,
}: {
  features: ResourceMapFeature[];
  latitude?: number | null;
  longitude?: number | null;
}) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return features;
  }
  const normalized = [...features];
  const index = normalized.findIndex((feature) => feature.id === "gps-point");
  const pointFeature: ResourceMapPointFeature = {
    id: "gps-point",
    layer: "location",
    geometryType: "Point",
    point: [lng, lat],
  };
  if (index === -1) {
    return [pointFeature, ...normalized];
  }
  normalized[index] = pointFeature;
  return normalized;
};

export const toMapFeatureGeoJson = (
  features: ResourceMapFeature[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon> => ({
  type: "FeatureCollection",
  features: getPolygonFeatures(features).map((feature) => {
    const first = feature.coordinates[0];
    const last = feature.coordinates[feature.coordinates.length - 1];
    const closedRing =
      first[0] === last[0] && first[1] === last[1]
        ? feature.coordinates
        : [...feature.coordinates, first];

    return {
      type: "Feature",
      properties: {
        id: feature.id,
        layer: feature.layer,
        geometryType: feature.geometryType,
      },
      geometry: {
        type: "Polygon",
        coordinates: [closedRing],
      },
    };
  }),
});

export const toMapPointFeatureGeoJson = (
  features: ResourceMapFeature[],
): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: getPointFeatures(features).map((feature) => ({
    type: "Feature",
    properties: {
      id: feature.id,
      layer: feature.layer,
      geometryType: feature.geometryType,
    },
    geometry: {
      type: "Point",
      coordinates: feature.point,
    },
  })),
});
