import site from "./site.json";
import {
  normalizeResourceMapFeatures,
  type ResourceMapFeature,
} from "@/app/[lang]/resources/map-features";

export const ORIGIN = site.origin;
const METRES = (Math.PI / 180) * 6378137;
/** Local tangent approximation over this <1 km site. x east, z south, y up. */
export function toLocal(point: readonly number[]): [number, number] {
  return [
    (point[0] - ORIGIN[0]) * METRES * Math.cos((ORIGIN[1] * Math.PI) / 180),
    -(point[1] - ORIGIN[1]) * METRES,
  ];
}
export function toGeographic(x: number, z: number): [number, number] {
  return [
    ORIGIN[0] + x / (METRES * Math.cos((ORIGIN[1] * Math.PI) / 180)),
    ORIGIN[1] - z / METRES,
  ];
}
const siteRings = [...site.buildings, ...site.containers].map((area) =>
  area.coordinates.map(toLocal),
);

export function inSite(point: readonly number[]) {
  if (point.length < 2 || !point.every(Number.isFinite)) return false;
  const local = toLocal(point);
  return siteRings.some((ring) => {
    if (pointInPolygon(local, ring)) return true;
    // Inventory outlines and the OSM facade have a small digitising offset.
    return ring.some(([x, z], i) => {
      const end = ring[(i + 1) % ring.length];
      const dx = end[0] - x,
        dz = end[1] - z;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((local[0] - x) * dx + (local[1] - z) * dz) /
            (dx * dx + dz * dz || 1),
        ),
      );
      return Math.hypot(local[0] - x - t * dx, local[1] - z - t * dz) <= 1.5;
    });
  });
}
export function pointInPolygon(
  point: readonly number[],
  ring: readonly (readonly number[])[],
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
const roomLevels: Readonly<Record<string, number>> = site.roomLevels;

export function floorHeight(level: number) {
  if (level === site.basement.level) return site.basement.height;
  return (
    site.upperFloors.find((floor) => floor.level === level)?.height ??
    site.inventoryLift + 0.31
  );
}

export function floorLabel(level: number) {
  if (level === -1) return "Keller";
  return level === 0 ? "Erdgeschoss" : `${level}. Obergeschoss`;
}

export type MapItem = {
  id: string;
  name: string;
  slug: string | null;
  type: string;
  image: string | null;
  features: ResourceMapFeature[];
  point: [number, number];
  outdoor: boolean;
  level: number;
};
export type InventoryRow = {
  id: string;
  name: string;
  pretty_title?: string | null;
  type?: string | null;
  image?: string | null;
  map_features?: unknown;
  gps_longitude?: number | null;
  gps_latitude?: number | null;
  is_private?: boolean | null;
  workshop_resource_id?: string | null;
};
export function toMapItem(row: InventoryRow): MapItem | null {
  if (row.is_private || row.type?.toLowerCase() === "project") return null;
  const rawFeatures = normalizeResourceMapFeatures(row.map_features);
  const features = rawFeatures.filter((f) =>
    f.geometryType === "Point" ? inSite(f.point) : f.coordinates.every(inSite),
  );
  const polygon = features.find((f) => f.geometryType === "Polygon");
  if (!polygon && rawFeatures.some((f) => f.geometryType === "Polygon"))
    return null;
  const marker = features.find((f) => f.geometryType === "Point");
  let point: [number, number] | null = null;
  // Prefer the mapped outline over a potentially displaced photo GPS point.
  if (polygon?.geometryType === "Polygon") {
    const ring = polygon.coordinates;
    point = [
      ring.reduce((n, p) => n + p[0], 0) / ring.length,
      ring.reduce((n, p) => n + p[1], 0) / ring.length,
    ];
  } else if (marker?.geometryType === "Point") point = marker.point;
  else if (
    typeof row.gps_longitude === "number" &&
    typeof row.gps_latitude === "number" &&
    inSite([row.gps_longitude, row.gps_latitude])
  )
    point = [row.gps_longitude, row.gps_latitude];
  if (!point) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.pretty_title ?? null,
    type: row.type?.toLowerCase() ?? "object",
    image: row.image ?? null,
    features,
    point,
    level:
      roomLevels[row.id] ?? roomLevels[row.workshop_resource_id ?? ""] ?? 0,
    outdoor: /innenhof|außen|wechselbrücken/i.test(row.name),
  };
}
