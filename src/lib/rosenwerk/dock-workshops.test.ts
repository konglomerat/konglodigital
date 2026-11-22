import { describe, expect, it } from "vitest";
import site from "./site.json";
import { toLocal, toMapItem } from "./geometry";
import {
  factoryPoint,
  registerDockItem,
  dockWallSpans,
} from "./dock-workshops";

describe.each([
  ["Holzwerkstatt", site.interiors.Holzwerkstatt, site.timberWorkshop],
  ["Metallwerkstatt", site.interiors.Metallwerkstatt, site.metalWorkshop],
] as const)("%s an der Laderampe", (name, roomId, plan) => {
  it("aligns the inventory facade with the loading platform and cuts a clear doorway in either wall direction", () => {
    const room = toMapItem({
      id: roomId,
      name,
      type: "place",
      map_features: [
        { geometryType: "Polygon", coordinates: plan.inventoryCorners },
      ],
    })!;
    const polygon = registerDockItem(room).features[0];
    if (polygon.geometryType !== "Polygon") throw Error("Raumumriss fehlt");
    const [a, b] = polygon.coordinates.map(toLocal);
    for (const [start, end] of [
      [a, b],
      [b, a],
    ]) {
      const spans = dockWallSpans(roomId, start, end);
      expect(spans).toHaveLength(2);
      const mid = (spans[0][1] + spans[1][0]) / 2;
      const door = factoryPoint(plan.dockWallU, plan.doorCenterV);
      expect(
        Math.hypot(
          start[0] + mid * (end[0] - start[0]) - door[0],
          start[1] + mid * (end[1] - start[1]) - door[1],
        ),
      ).toBeLessThan(0.08);
      expect(
        (spans[1][0] - spans[0][1]) *
          Math.hypot(end[0] - start[0], end[1] - start[1]),
      ).toBeCloseTo(2 * plan.doorHalfWidth, 2);
    }
  });
});

describe("inventory registration", () => {
  it("keeps the lathe to the left of the incoming aisle and the stacker to the right", () => {
    const { lathe, stacker } = site.metalWorkshop.equipment;
    for (const [item, left] of [
      [lathe, true],
      [stacker, false],
    ] as const) {
      const raw = toMapItem({
        ...item,
        type: "tool",
        map_features: [{ geometryType: "Point", point: item.point }],
      })!;
      const registered = registerDockItem(raw, site.interiors.Metallwerkstatt);
      const p = toLocal(registered.point);
      const doorway = factoryPoint(
        site.metalWorkshop.dockWallU,
        site.metalWorkshop.doorCenterV,
      );
      const leftDistance =
        -(p[0] - doorway[0]) * 0.5 -
        (p[1] - doorway[1]) * Math.cos(Math.PI / 6);
      expect(leftDistance * (left ? 1 : -1)).toBeGreaterThan(1);
      expect(registered.features[0]).toMatchObject({ point: registered.point });
    }
  });
  const plan = site.timberWorkshop;
  it("keeps modeled equipment and picking coordinates together and leaves other workshops in their own frame", () => {
    const saw = site.machines[0];
    const raw = toMapItem({
      ...saw,
      type: "tool",
      map_features: [{ geometryType: "Polygon", coordinates: saw.coordinates }],
    })!;
    const placed = registerDockItem(raw, site.interiors.Holzwerkstatt);
    const polygon = placed.features[0];
    if (polygon.geometryType !== "Polygon")
      throw Error("Maschinenumriss fehlt");
    for (const [i, p] of polygon.coordinates.entries()) {
      const [x, z] = toLocal(p),
        [x0, z0] = toLocal(saw.coordinates[i]);
      expect(Math.hypot(x - x0, z - z0)).toBeCloseTo(plan.inventoryOffsetU, 6);
    }
    expect(registerDockItem(raw, site.interiors.Siebdruckwerkstatt)).toBe(raw);
    expect(registerDockItem({ ...raw, level: 1 }).point).toEqual(raw.point);
  });
});
