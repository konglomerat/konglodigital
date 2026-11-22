import site from "./site.json";
import {
  pointInPolygon,
  toGeographic,
  toLocal,
  type MapItem,
} from "./geometry";

const timber = site.timberWorkshop;
const metal = site.metalWorkshop;
export const timberWorkshopId = site.interiors.Holzwerkstatt;
export const metalWorkshopId = site.interiors.Metallwerkstatt;
const workshops = [
  { ids: new Set([timberWorkshopId, timber.cncRoomId]), plan: timber },
  { ids: new Set([metalWorkshopId]), plan: metal },
];
export function isDockWorkshop(id: string | null) {
  return id === timberWorkshopId || id === metalWorkshopId;
}
export const dockMachineIds = new Set(
  workshops.flatMap(({ plan }) =>
    Object.values(plan.equipment).map((m) => m.id),
  ),
);
const cos = Math.cos(Math.PI / 6);
const sin = Math.sin(Math.PI / 6);
const [ax, az] = toLocal(site.frame.anchor);

export function factoryPoint(u: number, v: number): [number, number] {
  return [ax + u * cos - v * sin, az - u * sin - v * cos];
}

/** The surveyed shop and its contents share one datum. Align that footprint with
 * the inset loading facade for this map, keeping original inventory records intact. */
export function registerDockItem(
  item: MapItem,
  workshop?: string | null,
): MapItem {
  if (item.level !== 0 || item.outdoor) return item;
  const owner = workshops.find(
    ({ ids, plan }) =>
      ids.has(item.id) ||
      (item.type !== "place" &&
        (workshop
          ? ids.has(workshop)
          : pointInPolygon(item.point, plan.inventoryCorners))),
  );
  if (!owner) return item;
  const { plan } = owner;
  const machine = Object.values(plan.equipment).find((m) => m.id === item.id);
  const [du, dv] =
    machine && "photoOffset" in machine ? machine.photoOffset : [0, 0];
  const offsetU = plan.inventoryOffsetU + du;
  const shift = (p: readonly number[]) => {
    const [x, z] = toLocal(p);
    return toGeographic(
      x + offsetU * cos - dv * sin,
      z - offsetU * sin - dv * cos,
    );
  };
  return {
    ...item,
    point: shift(item.point),
    features: item.features.map((f) =>
      f.geometryType === "Point"
        ? { ...f, point: shift(f.point) }
        : { ...f, coordinates: f.coordinates.map(shift) },
    ),
  };
}

export function dockWallSpans(
  room: string,
  a: [number, number],
  b: [number, number],
): [number, number][] {
  const plan = room === metalWorkshopId ? metal : timber;
  const uv = ([x, z]: [number, number]) => [
    (x - ax) * cos - (z - az) * sin,
    -(x - ax) * sin - (z - az) * cos,
  ];
  const [u, v] = uv(a),
    [u2, v2] = uv(b);
  if (
    Math.max(Math.abs(u - plan.dockWallU), Math.abs(u2 - plan.dockWallU)) >
      0.15 ||
    Math.abs(v2 - v) < 0.001
  )
    return [[0, 1]];
  const cuts = [-1, 1]
    .map((s) => (plan.doorCenterV + s * plan.doorHalfWidth - v) / (v2 - v))
    .sort((x, y) => x - y);
  const spans: [number, number][] = [];
  if (cuts[0] > 0) spans.push([0, Math.min(cuts[0], 1)]);
  if (cuts[1] < 1) spans.push([Math.max(cuts[1], 0), 1]);
  return spans;
}

export type DockView = "from-dock" | "towards-dock" | "cnc" | "bicycle-area";
export function dockViewpoints(room: string | null, view: DockView) {
  if (room === metalWorkshopId) {
    const entry = metal.doorCenterV;
    if (view === "towards-dock")
      return {
        eye: factoryPoint(7.62, 25.77),
        target: factoryPoint(2.51, entry),
        eyeHeight: 1.72,
        targetHeight: 1.39,
      };
    if (view === "bicycle-area")
      return {
        eye: factoryPoint(7.02, 25.68),
        target: factoryPoint(13.87, 25.5),
        eyeHeight: 1.85,
        targetHeight: 1.36,
      };
    return {
      eye: factoryPoint(2.76, entry),
      target: factoryPoint(10.63, 25.7),
      eyeHeight: 1.73,
      targetHeight: 1.45,
    };
  }
  switch (view) {
    case "towards-dock":
      return {
        eye: factoryPoint(9.46, 32.57),
        target: factoryPoint(2.43, 32.3),
        eyeHeight: 1.97,
        targetHeight: 1.2,
      };
    case "cnc":
      return {
        eye: factoryPoint(13.39, 32.21),
        target: factoryPoint(11.02, 30.45),
        eyeHeight: 1.92,
        targetHeight: 0.96,
      };
    default:
      return {
        eye: factoryPoint(2.62, 32.47),
        target: factoryPoint(8.06, 31.88),
        eyeHeight: 2.33,
        targetHeight: 1.03,
      };
  }
}
