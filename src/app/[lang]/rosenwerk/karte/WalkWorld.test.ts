import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { factoryPoint } from "@/lib/rosenwerk/dock-workshops";
import { WalkWorld } from "./WalkWorld";
import { walkDoors } from "./FirstPerson";

describe("walking through the exported Rosenwerk", () => {
  let world: WalkWorld, doors: ReturnType<typeof walkDoors>;
  beforeAll(async () => {
    // The collision model needs the exact production triangles, without image decoding.
    const bytes = readFileSync("public/models/rosenwerk/context.glb");
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
    delete gltf.textures;
    delete gltf.images;
    gltf.materials = gltf.materials.map(() => ({}));
    const json = Buffer.from(JSON.stringify(gltf));
    bytes.fill(32, 20, 20 + jsonLength);
    json.copy(bytes, 20);
    const model = (
      await new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      )
    ).scene;
    model.traverse((o) => {
      if (o.userData.kind)
        o.visible =
          !["upper", "upper_support"].includes(o.userData.kind) &&
          !o.userData.sectionOnly;
    });
    doors = walkDoors(model);
    world = new WalkWorld([model]);
  }, 30000);
  function at(u: number, v: number, y = 0.15) {
    const [x, z] = factoryPoint(u, v);
    return new T.Vector3(x, world.floor(x, z, y + 0.225, 4), z);
  }
  function go(p: T.Vector3, u: number, v: number) {
    const [x, z] = factoryPoint(u, v);
    const dx = x - p.x,
      dz = z - p.z,
      n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.06));
    for (let i = 0; i < n; i++) world.move(p, dx / n, dz / n, 1 / 45);
    return Math.hypot(p.x - x, p.z - z);
  }
  it("follows both ramp landings to the raised doorway and back", () => {
    const p = at(64.4, -7);
    const route = [
      [67.25, -6.9],
      [74.92, -6.9],
      [74.92, -5.46],
      [65.95, -5.46],
      [65.95, -1.02],
    ];
    for (const [u, v] of route)
      expect(go(p, u, v), JSON.stringify({ u, v, p })).toBeLessThan(0.16);
    expect(p.y).toBeGreaterThan(1.1);
    for (const [u, v] of [...route].reverse().slice(1))
      expect(go(p, u, v)).toBeLessThan(0.16);
    expect(go(p, 64.4, -7)).toBeLessThan(0.16);
    expect(p.y).toBeLessThan(0.2);
  });
  it("climbs the entrance steps and only passes the glass after it swings open", () => {
    const p = at(86.45, 26.22);
    expect(go(p, 81.8, 26.22)).toBeLessThan(0.1);
    expect(p.y).toBeCloseTo(1.36, 1);
    expect(go(p, 80.1, 26.22)).toBeGreaterThan(0.45);
    const door = doors.find(
      (d) => d.pivot.children[0].userData.id === "haupteingang" && d.angle < 0,
    )!;
    door.pivot.rotation.y = door.angle;
    world.colliders.forEach((c) => c.refresh());
    expect(go(p, 79.8, 26.22)).toBeLessThan(0.1);
    door.pivot.rotation.y = 0;
    world.colliders.forEach((c) => c.refresh());
  });
  it("climbs the steel stair from the yard onto the loading dock", () => {
    const p = at(-4.4, 33.24);
    expect(go(p, -1.28, 33.24)).toBeLessThan(0.16);
    expect(p.y).toBeCloseTo(1.2, 1);
    expect(go(p, -4.4, 33.24)).toBeLessThan(0.16);
    expect(p.y).toBeLessThan(0.15);
  });
  it("climbs both shop stairs and passes their open doors", () => {
    for (const u of [5.6, 35.9]) {
      const p = at(u, -4.8);
      expect(go(p, u, -1)).toBeLessThan(0.12);
      expect(p.y).toBeCloseTo(0.91, 1);
      const leaf = doors.find(
        (d) =>
          d.pivot.children[0].userData.id === "geschaeftstreppen" &&
          Math.abs(d.pivot.children[0].userData.doorPivot[0] - u) < 1,
      )!;
      leaf.pivot.rotation.y = leaf.angle;
      world.colliders.forEach((c) => c.refresh());
      expect(go(p, u, 0.8)).toBeLessThan(0.12);
      leaf.pivot.rotation.y = 0;
      world.colliders.forEach((c) => c.refresh());
    }
  });
  it("blocks the facade beside the entrance and the garden cages", () => {
    const p = at(85.8, 32.2);
    expect(go(p, 79, 32.2)).toBeGreaterThan(1);
    const q = at(78.5, -11);
    expect(go(q, 81.7, -11)).toBeGreaterThan(0.8);
  });
  it("blocks the front swap body", () => {
    const p = at(71, -19.6);
    expect(go(p, 71, -14.1)).toBeGreaterThan(1);
  });
});
