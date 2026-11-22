import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import site from "./site.json";
import survey from "./survey.json";
import { walkingRoutes } from "./arrival";
import { floorHeight, toLocal, toMapItem } from "./geometry";

type Node = {
  name: string;
  mesh?: number;
  translation?: number[];
  extras?: { id: string; kind: string; level?: number };
};
const file = readFileSync(
  new URL("../../../public/models/rosenwerk/context.glb", import.meta.url),
);
const model = JSON.parse(
  file.toString("utf8", 20, 20 + file.readUInt32LE(12)),
) as {
  nodes: Node[];
  meshes: {
    primitives: {
      material: number;
      attributes: { POSITION: number; TEXCOORD_1?: number };
    }[];
  }[];
  accessors: { min: number[]; max: number[] }[];
  materials: {
    name: string;
    alphaMode?: string;
    extras?: { reflectionZone?: string; windowGlass?: boolean };
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicRoughnessTexture?: unknown;
      baseColorTexture?: unknown;
    };
    normalTexture?: unknown;
    occlusionTexture?: { index: number; texCoord?: number };
  }[];
};
const meshes = model.nodes.filter((node) => node.mesh !== undefined);

describe("Rosenwerk model and viewer", () => {
  it("exports a selectable mesh for every access point in the viewer", () => {
    const coords = Object.fromEntries(
      site.accessPoints.map((entry) => [entry.id, toLocal(entry.point)]),
    );
    for (const { id } of site.accessPoints) {
      expect(
        meshes.some((n) => n.extras?.kind === "access" && n.extras.id === id),
      ).toBe(true);
    }
    // x points east, z points south: the dock is in the west yard and the ramp is south of the main door.
    expect(coords["lkw-laderampe"][0]).toBeLessThan(
      coords.haupteingang[0] - 50,
    );
    expect(coords.rollstuhlrampe[1]).toBeGreaterThan(
      coords.haupteingang[1] + 20,
    );
    expect(coords["seiteneingang-jagdweg"][1]).toBeLessThan(
      coords.haupteingang[1],
    );
  });

  it("exports individually selectable dock workshop machinery above the shared loading level", () => {
    for (const item of [
      ...Object.values(site.timberWorkshop.equipment),
      ...Object.values(site.metalWorkshop.equipment),
    ]) {
      const parts = meshes.filter(
        (n) => n.extras?.kind === "machine" && n.extras.id === item.id,
      );
      expect(parts, item.name).toHaveLength(1);
      const node = parts[0];
      const bottom = Math.min(
        ...model.meshes[node.mesh!].primitives.map(
          (p) => model.accessors[p.attributes.POSITION].min[1],
        ),
      );
      expect(bottom + (node.translation?.[1] ?? 0)).toBeGreaterThanOrEqual(
        floorHeight(0) - 0.015,
      );
      expect(node.extras?.level).toBe(0);
    }
  });

  it("places the swap-body underframe directly on the paved yard", () => {
    const bodies = meshes.find(
      (node) =>
        node.extras?.id === "pflanzcontainer" &&
        node.name.startsWith("Wechselbrücken"),
    );
    expect(bodies?.mesh).toBeDefined();
    const primitives = model.meshes[bodies!.mesh!].primitives;
    const bases = primitives.map(
      (p) => model.accessors[p.attributes.POSITION].min[1],
    );
    expect(Math.min(...bases)).toBeCloseTo(0.028, 3);
  });

  it("preserves all three floor numbers in the exported geometry", () => {
    expect(site.upperFloors.map((f) => f.level)).toEqual([1, 2, 3]);
    expect(
      meshes
        .filter((n) => n.extras?.kind === "upper")
        .map((n) => n.extras?.level)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(meshes.some((n) => n.extras?.kind === "ground")).toBe(true);
  });

  it("keeps the corrected rooms, equipment and viewer floor at the same elevation", () => {
    for (const [id, level] of Object.entries(site.roomLevels)) {
      const row = {
        id,
        name: "Raum",
        gps_longitude: site.origin[0],
        gps_latitude: site.origin[1],
      };
      expect(toMapItem(row)?.level).toBe(level);
      expect(
        toMapItem({ ...row, id: "equipment", workshop_resource_id: id })?.level,
      ).toBe(level);
      const node = meshes.find(
        (n) => n.extras?.id === id && n.extras.kind === "interior",
      )!;
      expect(node.extras?.level).toBe(level);
      const minY = Math.min(
        ...model.meshes[node.mesh!].primitives.map(
          (p) => model.accessors[p.attributes.POSITION].min[1],
        ),
      );
      expect((node.translation?.[1] ?? 0) + minY).toBeCloseTo(
        floorHeight(level),
        3,
      );
    }
    expect(floorHeight(-1)).toBeLessThan(0);
    expect(floorHeight(1)).toBeGreaterThan(floorHeight(0));
  });

  it("preserves the context footprints separately from selectable inventory", () => {
    expect(survey.neighbors.length).toBeGreaterThan(0);
    const exported = meshes
      .filter((n) => n.extras?.kind === "neighbor")
      .map((n) => n.extras!.id);
    expect(exported.sort()).toEqual(
      survey.neighbors.map((n) => "osm-" + n.osm).sort(),
    );
    expect(exported).not.toContain(site.buildings[0].id);
  });

  it("uses the same white material on every neighbor wall and roof", () => {
    const index = model.materials.findIndex(
      (m) => m.name === "Nachbarhäuser | mattweiß",
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const material = model.materials[index].pbrMetallicRoughness;
    expect(material?.baseColorFactor ?? [1, 1, 1, 1]).toEqual([1, 1, 1, 1]);
    expect(material?.baseColorTexture).toBeUndefined();
    for (const n of meshes.filter((n) => n.extras?.kind === "neighbor")) {
      expect(
        model.meshes[n.mesh!].primitives.every((p) => p.material === index),
      ).toBe(true);
    }
    for (const name of [
      "Putz | warmgrau",
      "Stahl | verzinkt",
      "Zugänge | Betonpflaster mit Fugen",
    ]) {
      const m = model.materials.find((m) => m.name === name);
      expect(m?.normalTexture).toBeDefined();
      expect(m?.pbrMetallicRoughness?.metallicRoughnessTexture).toBeDefined();
    }
  });

  it("measures every platform walk along its full route to the main entrance", () => {
    expect(new Set(walkingRoutes.map((r) => r.id)).size).toBe(3);
    const door = site.accessPoints.find((p) => p.id === "haupteingang")!;
    for (const route of walkingRoutes) {
      expect(route.points.at(-1)).toEqual(door.point);
      const pts = route.points.map(toLocal);
      const distance = pts
        .slice(1)
        .reduce(
          (n, [x, z], i) => n + Math.hypot(x - pts[i][0], z - pts[i][1]),
          0,
        );
      expect(Math.abs(distance - route.meters)).toBeLessThan(2);
      expect(Math.round(route.seconds / 60)).toBe(
        route.mode === "S-Bahn" ? 8 : 5,
      );
    }
  });

  it("keeps baked daylight on its own UV set for both ground and roofs", () => {
    for (const name of [
      "Werkhof | Asphalt",
      "Rasen",
      "Dach | Bitumen",
      "Dach | verwittertes Blech",
    ]) {
      const index = model.materials.findIndex((mat) => mat.name === name);
      expect(model.materials[index]?.occlusionTexture?.texCoord).toBe(1);
      const primitives = model.meshes
        .flatMap((mesh) => mesh.primitives)
        .filter((primitive) => primitive.material === index);
      expect(primitives.length).toBeGreaterThan(0);
      for (const p of primitives) expect(p.attributes.TEXCOORD_1).toBeDefined();
    }
    const edge = model.materials.find(
      (mat) => mat.name === "Rasen | auslaufende Trittkante",
    );
    expect(edge?.alphaMode).toBe("MASK");
    expect(
      model.materials.find((m) => m.name === "Nachbarhäuser | mattweiß")
        ?.occlusionTexture,
    ).toBeUndefined();
  });

  it("ships the local HDR panoramas used by exterior glass, including the neighbor toggle", () => {
    const glass = model.materials.filter((m) => m.extras?.windowGlass);
    const zones = new Set(glass.map((m) => m.extras!.reflectionZone));
    expect(zones).toEqual(
      new Set(["jagdweg", "rosenstrasse", "laderampe", "nordhof", "innenhof"]),
    );
    const files = ["himmel"];
    for (const zone of zones) {
      files.push(zone!);
      if (zone !== "innenhof") files.push(zone + "-offen");
    }
    for (const name of files) {
      const data = readFileSync(
        new URL(
          `../../../public/models/rosenwerk/licht/${name}.hdr`,
          import.meta.url,
        ),
      );
      expect(data.toString("ascii", 0, 100)).toContain(
        "FORMAT=32-bit_rle_rgbe",
      );
    }
    const verge = model.materials.find(
      (m) => m.name === "Jagdweg | Rasen, Erde und Pflaster",
    );
    expect(verge?.normalTexture).toBeDefined();
    expect(verge?.pbrMetallicRoughness?.metallicRoughnessTexture).toBeDefined();
    expect(verge?.occlusionTexture?.texCoord).toBe(1);
  });

  it("exports translucent window glazing and relief on the roof materials", () => {
    const glass = model.materials.find((m) => m.name.startsWith("Fensterglas"));
    expect(glass?.alphaMode).toBe("BLEND");
    const alpha = glass?.pbrMetallicRoughness?.baseColorFactor?.[3];
    expect(alpha).toBeGreaterThan(0.2);
    expect(alpha).toBeLessThan(0.7);
    expect(
      model.materials.find((m) => m.name === "Dach | Bitumen")?.normalTexture,
    ).toBeDefined();
  });
});
