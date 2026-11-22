import * as THREE from "three";
import { toLocal } from "@/lib/rosenwerk/geometry";
import { walkingRoutes } from "@/lib/rosenwerk/arrival";
import site from "@/lib/rosenwerk/site.json";
import survey from "@/lib/rosenwerk/survey.json";
import neighborhood from "@/lib/rosenwerk/arrival-context.json";

function strip(
  vertices: number[],
  points: number[][],
  width: number,
  y: number,
  offset = 0,
) {
  const path = points.map((p) => new THREE.Vector2(...toLocal(p)));
  let previous: THREE.Vector2[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const incoming = p
      .clone()
      .sub(path[Math.max(0, i - 1)])
      .normalize();
    const outgoing = path[Math.min(i + 1, path.length - 1)]
      .clone()
      .sub(p)
      .normalize();
    const tangent = incoming.clone().add(outgoing).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    // Miter at the corner, with a limit for the switchback at the station stairs.
    normal.divideScalar(
      Math.max(0.5, tangent.dot(i === 0 ? outgoing : incoming)),
    );
    const pair = [
      p.clone().addScaledVector(normal, offset - width / 2),
      p.clone().addScaledVector(normal, offset + width / 2),
    ];
    if (previous.length)
      for (const v of [
        previous[0],
        previous[1],
        pair[0],
        pair[0],
        previous[1],
        pair[1],
      ])
        vertices.push(v.x, y, v.y);
    previous = pair;
  }
}

function surface(vertices: number[], color: string, order = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthTest: order === 0,
      depthWrite: order === 0,
    }),
  );
  mesh.renderOrder = order;
  return mesh;
}

function neighborhoodBuildings() {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
  });
  const roofEdges: number[] = [];
  const solids = new Map<
    string,
    { base: number; depth: number; shapes: THREE.Shape[] }
  >();
  const ring = (points: number[][]) =>
    points.map((p) => {
      const [x, z] = toLocal(p);
      return new THREE.Vector2(x, -z);
    });
  for (const building of neighborhood.buildings) {
    const shape = new THREE.Shape(ring(building.outline));
    shape.holes = building.holes.map((hole) => new THREE.Path(ring(hole)));
    for (const contour of [shape, ...shape.holes]) {
      const pts = contour.getPoints();
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          b = pts[(i + 1) % pts.length];
        roofEdges.push(
          a.x,
          building.height - 0.07,
          -a.y,
          b.x,
          building.height - 0.07,
          -b.y,
        );
      }
    }
    const base = building.baseHeight ?? 0;
    const key = `${base}/${building.height}`;
    let batch = solids.get(key);
    if (!batch) {
      batch = { base, depth: building.height - base, shapes: [] };
      solids.set(key, batch);
    }
    batch.shapes.push(shape);
  }
  for (const { base, depth, shapes } of solids.values()) {
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, white);
    mesh.position.y = base - 0.1;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const edges = new THREE.BufferGeometry();
  edges.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(roofEdges, 3),
  );
  group.add(
    new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: "#858c83",
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    ),
  );
  return group;
}

// Keep the immediate neighborhood legible while its detailed GLB is loading.
function surveyedFootprints() {
  const shapes = survey.neighbors.map((b) => {
    const points = (ring: number[][]) =>
      ring.map(([u, v]) => new THREE.Vector2(u, v));
    const s = new THREE.Shape(points(b.outline));
    s.holes = b.holes.map((h) => new THREE.Path(points(h)));
    return s;
  });
  const geometry = new THREE.ShapeGeometry(shapes);
  geometry.rotateZ(Math.PI / 6);
  geometry.rotateX(-Math.PI / 2);
  const [x, z] = toLocal(site.frame.anchor);
  geometry.translate(x, -0.04, z);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
}

export function createNeighborhoodLayer() {
  const group = new THREE.Group();
  const road: number[] = [],
    rail: number[] = [],
    beds: number[] = [],
    tram: number[] = [],
    tramBeds: number[] = [];
  // The surrounding pavement is at -0.10 m, the detailed yard starts at -0.025 m.
  for (const s of neighborhood.streets) strip(road, s.points, s.width, -0.065);
  for (const track of neighborhood.rails) {
    strip(beds, track, 3.7, -0.02);
    for (const offset of [-0.72, 0.72]) strip(rail, track, 0.28, 0.026, offset);
  }
  for (const track of neighborhood.trams) {
    strip(tramBeds, track, 2.3, -0.02);
    for (const offset of [-0.72, 0.72]) strip(tram, track, 0.24, 0.026, offset);
  }
  const buildings = neighborhoodBuildings();
  const localFootprints = surveyedFootprints();
  buildings.add(localFootprints);
  group.add(
    buildings,
    surface(road, "#b4b4b4"),
    surface(beds, "#c8c5be"),
    surface(rail, "#8e928b"),
    surface(tramBeds, "#a4a4a4"),
    surface(tram, "#797979"),
  );
  const stationMarkers = new THREE.Group();
  group.add(stationMarkers);
  const paths = walkingRoutes.map((route) => {
    const path = new THREE.Group();
    const bounds = new THREE.Box3();
    const line: number[] = [],
      edge: number[] = [];
    strip(edge, route.points, 5.6, 0.4);
    strip(line, route.points, 3.1, 0.45);
    path.add(surface(edge, "#fcfcf7", 4), surface(line, "#176251", 5));
    for (const [which, p] of [
      route.points[0],
      route.points[route.points.length - 1],
    ].entries()) {
      const [x, z] = toLocal(p);
      for (const [radius, color, order] of [
        [5.3, "#ffffff", 6],
        [3.75, which === 0 ? "#176251" : "#26382e", 7],
      ] as const) {
        const marker = new THREE.Mesh(
          new THREE.CircleGeometry(radius, 28),
          new THREE.MeshBasicMaterial({
            color,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 1, z);
        marker.renderOrder = order;
        path.add(marker);
        if (which === 0 && route.id !== "florastrasse-2") {
          const stop = marker.clone();
          stop.material = marker.material.clone();
          stop.material.depthTest = true;
          stop.scale.setScalar(0.72);
          stationMarkers.add(stop);
        }
      }
    }
    for (const p of route.points) {
      const [x, z] = toLocal(p);
      bounds.expandByPoint(new THREE.Vector3(x, 0, z));
    }
    group.add(path);
    return { id: route.id, path, bounds };
  });
  const overviewBounds = new THREE.Box3();
  for (const { bounds } of paths) overviewBounds.union(bounds);
  function setView(
    mode: "site" | "arrival" | "inside",
    neighbors: boolean,
    routeId: string,
    hasModel: boolean,
  ) {
    group.visible = mode !== "inside";
    stationMarkers.visible = mode === "site";
    buildings.visible = neighbors;
    localFootprints.visible = !hasModel;
    for (const route of paths)
      route.path.visible = mode === "arrival" && route.id === routeId;
  }
  return { group, paths, buildings, overviewBounds, setView };
}
