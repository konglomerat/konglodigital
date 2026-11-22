import site from "./site.json";
import { laserWorkshopId, workshopWallSpans } from "./laser-workshop";
import { describe, expect, it } from "vitest";
import {
  ORIGIN,
  inSite,
  toLocal,
  toGeographic,
  toMapItem,
  pointInPolygon,
} from "./geometry";
describe("Rosenwerk georeferencing", () => {
  it("uses metres, east-positive and north-negative, and roundtrips coordinates", () => {
    expect(toLocal(ORIGIN)).toEqual([0, -0]);
    const p = [13.716, 51.047];
    const [x, z] = toLocal(p);
    expect(x).toBeGreaterThan(20);
    expect(z).toBeLessThan(-70);
    const restored = toGeographic(x, z);
    expect(restored[0]).toBeCloseTo(p[0], 10);
    expect(restored[1]).toBeCloseTo(p[1], 10);
  });
  it("rejects private resources, projects and locations outside the site", () => {
    const row = {
      id: "x",
      name: "X",
      gps_longitude: 13.7157,
      gps_latitude: 51.0463,
    };
    expect(toMapItem({ ...row, is_private: true })).toBeNull();
    expect(toMapItem({ ...row, type: "project" })).toBeNull();
    expect(toMapItem({ ...row, gps_latitude: 52 })).toBeNull();
    expect(toMapItem({ ...row, gps_latitude: NaN })).toBeNull();
  });
  it("prefers a mapped outline to photo GPS and retains valid point-only places", () => {
    const row = {
      id: "x",
      name: "Raum",
      type: "place",
      gps_longitude: 13.7157,
      gps_latitude: 51.0463,
      map_features: [
        {
          geometryType: "Polygon",
          coordinates: [
            [13.7153, 51.04615],
            [13.7155, 51.04615],
            [13.7155, 51.04625],
            [13.7153, 51.04625],
          ],
        },
      ],
    };
    expect(toMapItem(row)?.point[0]).toBeCloseTo(13.7154, 8);
    expect(toMapItem({ ...row, map_features: [] })?.point).toEqual([
      13.7157, 51.0463,
    ]);
  });
  it("includes both KuSS containers and excludes neighboring buildings and the exchange bodies", () => {
    expect(inSite([13.715015, 51.046806])).toBe(true);
    expect(inSite([13.715045, 51.046858])).toBe(true);
    expect(inSite([13.7154, 51.04692])).toBe(false);
    expect(
      toMapItem({
        id: "offsite",
        name: "Wechselbrücke",
        gps_longitude: ORIGIN[0],
        gps_latitude: ORIGIN[1],
        map_features: [
          {
            geometryType: "Polygon",
            coordinates: [
              [13.71614, 51.04605],
              [13.71617, 51.04601],
              [13.71631, 51.04605],
              [13.71628, 51.04609],
            ],
          },
        ],
      }),
    ).toBeNull();
  });
  it("associates rooms only with containing buildings", () => {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    expect(pointInPolygon([2, 2], ring)).toBe(true);
    expect(pointInPolygon([5, 2], ring)).toBe(false);
  });
});

describe("Öffnungen der Laserwerkstatt", () => {
  const [ronOpen, ronRear, , windowOpen] =
    site.laserWorkshop.corners.map(toLocal);
  it("lässt den ganzen gemeinsamen Rand zum Siebdruck von beiden Seiten offen", () => {
    expect(workshopWallSpans(laserWorkshopId, ronOpen, windowOpen)).toEqual([]);
    expect(
      workshopWallSpans(site.interiors.Siebdruckwerkstatt, windowOpen, ronOpen),
    ).toEqual([]);
  });
  it("schneidet dieselbe Tür aus der kurzen Werkstattwand und der langen RON-Wand", () => {
    const far = toLocal([13.716008992153945, 51.04631379398887]);
    const near = toLocal([13.7161571487662, 51.04615095966966]);
    for (const [id, a, b] of [
      [laserWorkshopId, ronOpen, ronRear],
      [site.interiors["Raum ohne Namen (RON)"], near, far],
      [site.interiors["Raum ohne Namen (RON)"], far, near],
    ] as const) {
      const spans = workshopWallSpans(id, a, b);
      expect(spans).toHaveLength(2);
      const point = (t: number) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ];
      const edges = [point(spans[0][1]), point(spans[1][0])];
      const offsets = edges
        .map(([x, z]) => Math.hypot(x - ronRear[0], z - ronRear[1]))
        .sort((x, y) => x - y);
      for (let i = 0; i < 2; i++)
        expect(
          Math.abs(offsets[i] - site.laserWorkshop.ronDoor[i]),
        ).toBeLessThan(0.06);
    }
  });
});
