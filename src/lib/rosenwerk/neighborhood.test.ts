import { expect, it } from "vitest";
import { createNeighborhoodLayer } from "@/app/[lang]/rosenwerk/karte/NeighborhoodLayer";
import neighborhood from "./arrival-context.json";
import survey from "./survey.json";
import site from "./site.json";
import { toLocal } from "./geometry";
import { walkingRoutes } from "./arrival";

it("keeps the district on the grounds and approach maps and shows only the selected walk", () => {
  const layer = createNeighborhoodLayer();
  const route = walkingRoutes[2];
  layer.setView("site", true, route.id, true);
  expect(layer.group.visible && layer.buildings.visible).toBe(true);
  expect(layer.paths.some((p) => p.path.visible)).toBe(false);
  layer.setView("arrival", false, route.id, true);
  expect(layer.group.visible).toBe(true);
  expect(layer.buildings.visible).toBe(false);
  expect(layer.paths.filter((p) => p.path.visible).map((p) => p.id)).toEqual([
    route.id,
  ]);
  layer.setView("inside", true, route.id, true);
  expect(layer.group.visible).toBe(false);
});

it("covers the stops with buildings and the correct tracks, without doubling the surveyed site", () => {
  const ids = new Set(neighborhood.buildings.map((b) => b.id));
  expect(ids.size).toBe(neighborhood.buildings.length);
  for (const id of Object.keys(survey.modeledEntranceFootprints)) {
    expect(ids.has(id)).toBe(false);
    expect(survey.neighbors.some((n) => n.osm === id)).toBe(false);
  }
  for (const n of survey.neighbors) expect(ids.has(n.osm)).toBe(false);
  for (const b of site.buildings)
    expect(ids.has(b.id.replace("osm-", "w"))).toBe(false);
  for (const route of walkingRoutes) {
    const [x, z] = toLocal(route.points[0]);
    const distance = (p: number[]) => {
      const [px, pz] = toLocal(p);
      return Math.hypot(x - px, z - pz);
    };
    const tracks =
      route.mode === "S-Bahn" ? neighborhood.rails : neighborhood.trams;
    expect(tracks.some((line) => line.some((p) => distance(p) < 40))).toBe(
      true,
    );
    expect(
      neighborhood.buildings.some((b) =>
        b.outline.some((p) => distance(p) < 100),
      ),
    ).toBe(true);
    expect(
      neighborhood.streets.some((line) =>
        line.points.some((p) => distance(p) < 70),
      ),
    ).toBe(true);
  }
  expect(
    neighborhood.buildings.find((b) => b.id === "r5847")?.holes,
  ).toHaveLength(2);
});
