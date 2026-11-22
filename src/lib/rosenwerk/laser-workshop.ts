import site from "./site.json";
import { toLocal } from "./geometry";

type Point = [number, number];
export type WorkshopView = "from-screen-printing" | "printer-racks";
export const laserWorkshopId = site.interiors["Laser- und 3D-Druckwerkstatt"];
const adjoiningRooms = new Set([
  laserWorkshopId,
  site.interiors["Raum ohne Namen (RON)"],
  site.interiors.Siebdruckwerkstatt,
]);
// Order follows the four public inventory corners around the room.
const [ronOpen, ronRear, windowRear, windowOpen] =
  site.laserWorkshop.corners.map(toLocal);

function unit(x: number, z: number): Point {
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}
const along = unit(
  windowOpen[0] - windowRear[0] + ronOpen[0] - ronRear[0],
  windowOpen[1] - windowRear[1] + ronOpen[1] - ronRear[1],
);
export function workshopPoint(x: number, y: number): Point {
  return [
    windowRear[0] + along[0] * x + along[1] * y,
    windowRear[1] + along[1] * x - along[0] * y,
  ];
}
export function workshopViewpoints(view: WorkshopView) {
  const shelves = view === "printer-racks";
  return {
    eye: shelves ? workshopPoint(2.59, 2.03) : workshopPoint(6.45, 2.24),
    target: shelves ? workshopPoint(2.99, 5.33) : workshopPoint(1.43, 3.26),
    eyeHeight: shelves ? 1.57 : 2.20,
    targetHeight: shelves ? 1.34 : 1.21,
  };
}
const ronAxis = unit(ronOpen[0] - ronRear[0], ronOpen[1] - ronRear[1]);
const [doorA, doorB] = site.laserWorkshop.ronDoor.map((d): Point => [
  ronRear[0] + ronAxis[0] * d,
  ronRear[1] + ronAxis[1] * d,
]);

/** Visible intervals along an inventory wall. Neighbor polygons can digitize
 * a shared edge in reverse or extend it several rooms past the doorway. */
export function workshopWallSpans(id: string, a: Point, b: Point): Point[] {
  if (!adjoiningRooms.has(id)) return [[0, 1]];
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz);
  if (length < 0.02) return [];
  for (const [start, end] of [
    [doorA, doorB],
    [windowOpen, ronOpen],
  ]) {
    const distance = (p: Point) =>
      Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / length;
    if (distance(start) > 0.18 || distance(end) > 0.18) continue;
    const t = (p: Point) =>
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (length * length);
    const ts = [t(start), t(end)].sort((x, y) => x - y);
    if (ts[0] >= 1 || ts[1] <= 0) continue;
    const spans: Point[] = [];
    if (ts[0] * length > 0.05) spans.push([0, ts[0]]);
    if ((1 - ts[1]) * length > 0.05) spans.push([ts[1], 1]);
    return spans;
  }
  return [[0, 1]];
}
