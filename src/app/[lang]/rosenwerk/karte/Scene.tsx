"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { firstPerson, walkDoors } from "./FirstPerson";
import { createSiteReflections } from "./SiteReflections";
import context from "@/lib/rosenwerk/site.json";
import {
  toLocal,
  floorHeight,
  pointInPolygon,
  type MapItem,
} from "@/lib/rosenwerk/geometry";
import {
  laserWorkshopId,
  workshopPoint,
  workshopViewpoints,
  workshopWallSpans,
  type WorkshopView,
} from "@/lib/rosenwerk/laser-workshop";
import {
  factoryPoint,
  dockMachineIds,
  isDockWorkshop,
  metalWorkshopId,
  dockViewpoints,
  dockWallSpans,
  type DockView,
} from "@/lib/rosenwerk/dock-workshops";
import { createNeighborhoodLayer } from "./NeighborhoodLayer";
import { walkingRoutes } from "@/lib/rosenwerk/arrival";
import styles from "./map.module.css";

export type SceneState = {
  mode: "site" | "inside" | "arrival";
  routeId: string;
  stationOverview: boolean;
  workshopView: WorkshopView;
  dockView: DockView;
  level: number;
  top: boolean;
  objects: boolean;
  labels: boolean;
  neighbors: boolean;
  selected: string | null;
  focus: string | null;
  revision: number;
};
type Props = {
  items: MapItem[];
  state: SceneState;
  onSelect: (id: string) => void;
};
type Controller = {
  update: (state: SceneState) => void;
  dispose: () => void;
  toggleWalk: () => void;
  useDoor: () => void;
  press: (key: string, on: boolean) => void;
};
const containerId = context.containers[0].resourceId;
const floorFinishes: Record<string, string> = {
  [metalWorkshopId]: "#716f66",
  [context.interiors.Holzwerkstatt]: "#777672",
  [context.interiors.Siebdruckwerkstatt]: "#b09a76",
  [context.interiors["Laser- und 3D-Druckwerkstatt"]]: "#ae9c83",
  [context.interiors["Raum ohne Namen (RON)"]]: "#946e60",
  [context.interiors["Darkroom (Fotolabor)"]]: "#825c50",
};
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        m.dispose();
    }
  });
}
export default function Scene({ items, state, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<Controller | null>(null);
  const current = useRef(state),
    select = useRef(onSelect);
  const [walking, setWalking] = useState(false),
    [door, setDoor] = useState("");
  const [status, setStatus] = useState("Die 3D-Karte wird geladen …");
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    current.current = state;
    controller.current?.update(state);
  }, [state]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false,
      renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // WebGL capability is known only after creating a browser renderer.
      setStatus(
        "3D ist in diesem Browser nicht verfügbar. Alle Orte bleiben in der Liste auswählbar.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#e8e7dd");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    const varianceShadows =
      renderer.extensions.has("EXT_color_buffer_float") &&
      renderer.extensions.has("OES_texture_float_linear");
    renderer.shadowMap.type = varianceShadows
      ? THREE.VSMShadowMap
      : THREE.PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute(
      "aria-label",
      "Interaktive 3D-Geländekarte. Ziehen zum Drehen, mit zwei Fingern verschieben. Orte sind auch über die Liste erreichbar.",
    );
    canvas.tabIndex = 0;
    element.appendChild(canvas);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#e8e7dd", 750, 1700);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.minDistance = 2.5;
    controls.maxDistance = 300;
    controls.maxTargetRadius = 95;
    const ambient = new THREE.HemisphereLight("#edf3fc", "#beb2a1", 1.68);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff0d8", 1.92);
    const sunlight = new THREE.Vector3(-64, 87, 72).normalize();
    sun.position.copy(sunlight).multiplyScalar(155);
    sun.castShadow = true;
    sun.shadow.intensity = 0.9;
    const resolution = Math.min(
      renderer.capabilities.maxTextureSize,
      window.matchMedia("(pointer: coarse)").matches ? 1024 : 2048,
    );
    sun.shadow.mapSize.set(resolution, resolution);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.blurSamples = 8;
    sun.shadow.bias = -0.0001;
    sun.shadow.autoUpdate = false;
    scene.add(sun, sun.target);
    // Keep the light projection on whole shadow texels while the visitor pans.
    const lightRight = new THREE.Vector3()
      .crossVectors(camera.up, sunlight)
      .normalize();
    const lightUp = new THREE.Vector3().crossVectors(sunlight, lightRight);
    const shadowCenter = new THREE.Vector3();
    let shadowRadius = 0;
    function updateSun(arrival: boolean) {
      const radius = arrival
        ? 96
        : THREE.MathUtils.clamp(
            4 *
              Math.ceil(
                (camera.position.distanceTo(controls.target) * 0.63) / 4,
              ),
            12,
            96,
          );
      if (arrival) shadowCenter.set(-17, 5, -5);
      else shadowCenter.copy(controls.target);
      const texel = (2 * radius) / resolution;
      for (const dir of [lightRight, lightUp]) {
        const pos = dir.dot(shadowCenter);
        shadowCenter.addScaledVector(
          dir,
          Math.round(pos / texel) * texel - pos,
        );
      }
      if (
        radius === shadowRadius &&
        sun.target.position.distanceToSquared(shadowCenter) <
          texel * texel * 0.15
      )
        return;
      shadowRadius = radius;
      Object.assign(sun.shadow.camera, {
        left: -radius,
        right: radius,
        top: radius,
        bottom: -radius,
      });
      sun.shadow.camera.updateProjectionMatrix();
      // Keep the blur width in metres as the orthographic shadow frustum changes.
      sun.shadow.radius = THREE.MathUtils.clamp(
        0.32 / texel,
        1.5,
        varianceShadows ? 12 : 4,
      );
      sun.shadow.normalBias = THREE.MathUtils.clamp(texel * 0.32, 0.004, 0.035);
      sun.target.position.copy(shadowCenter);
      sun.position.copy(shadowCenter).addScaledVector(sunlight, 155);
      sun.shadow.needsUpdate = true;
    }
    const reflections = createSiteReflections(scene, ambient, render);
    const workshopLights = new THREE.Group();
    scene.add(workshopLights);
    const timberLights = new THREE.Group();
    const metalLights = new THREE.Group();
    scene.add(timberLights, metalLights);
    let lightsRequested = false;
    function lightWorkshops(laser: boolean, dockRoom: string | null) {
      workshopLights.visible = laser;
      timberLights.visible = dockRoom === context.interiors.Holzwerkstatt;
      metalLights.visible = dockRoom === metalWorkshopId;
      if ((!laser && !dockRoom) || lightsRequested) return;
      lightsRequested = true;
      void import("three/addons/lights/RectAreaLightUniformsLib.js")
        .then(({ RectAreaLightUniformsLib }) => {
          if (cancelled) return;
          RectAreaLightUniformsLib.init();
          const floor = floorHeight(0);
          const [x0, z0] = workshopPoint(0, 0),
            [x1, z1] = workshopPoint(1, 0);
          const right = new THREE.Vector3(x1 - x0, 0, z1 - z0);
          const up = new THREE.Vector3(0, 1, 0);
          const rotation = new THREE.Matrix4().makeBasis(
            right,
            up.clone().cross(right),
            up,
          );
          for (const y of [1.51, 3.97]) {
            const lamp = new THREE.RectAreaLight(0xfff6e9, 5, 3.96, 0.22);
            const [x, z] = workshopPoint(2.89, y);
            lamp.position.set(x, floor + 2.98, z);
            lamp.setRotationFromMatrix(rotation);
            workshopLights.add(lamp);
          }
          const daylight = new THREE.RectAreaLight(0xecf4ff, 3.4, 2.98, 1.92);
          const [x, z] = workshopPoint(1.9, 0.23),
            [tx, tz] = workshopPoint(1.9, 2);
          daylight.position.set(x, floor + 2.05, z);
          daylight.lookAt(tx, floor + 2.05, tz);
          workshopLights.add(daylight);
          // Light travels downwards from the two runs of fluorescent strips.
          for (const [v, group] of [
            [30.42, timberLights],
            [33.54, timberLights],
            [23.64, metalLights],
            [27.57, metalLights],
          ] as const) {
            const [x, z] = factoryPoint(8.85, v);
            const [ex, ez] = factoryPoint(9.85, v);
            const along = new THREE.Vector3(ex - x, 0, ez - z);
            const lamp = new THREE.RectAreaLight(0xfff6e8, 4.5, 11.8, 0.13);
            lamp.position.set(x, floor + 3.35, z);
            lamp.setRotationFromMatrix(
              new THREE.Matrix4().makeBasis(along, up.clone().cross(along), up),
            );
            group.add(lamp);
          }
          render();
        })
        .catch(() => {
          lightsRequested = false;
        });
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshStandardMaterial({ color: "#dddeda", roughness: 1 }),
    );
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);
    const neighborhood = createNeighborhoodLayer();
    neighborhood.group.visible = false;
    scene.add(neighborhood.group);
    // Frame the entire walk corridor, including the building at its southern end.
    for (const point of context.buildings[0].coordinates) {
      const [x, z] = toLocal(point);
      neighborhood.overviewBounds.expandByPoint(new THREE.Vector3(x, 0, z));
    }
    function fitContext(s: SceneState) {
      const overview = s.mode === "site" && s.stationOverview;
      const bounds = overview
        ? neighborhood.overviewBounds
        : neighborhood.paths.find((r) => r.id === s.routeId)?.bounds;
      if (!bounds) return;
      const size = bounds.getSize(new THREE.Vector3());
      const target = bounds.getCenter(new THREE.Vector3());
      const halfFov =
        Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / camera.zoom;
      const distance =
        Math.max(
          (size.x + 20) / (0.7 * camera.aspect),
          (size.z + 22) / (overview ? 0.69 : 0.55),
        ) /
        (2 * halfFov);
      // On a phone the layer controls cover the upper third of the viewport.
      target.z -= size.z * (overview && camera.aspect < 1 ? 0.26 : 0.07);
      camera.position
        .copy(target)
        .addScaledVector(
          s.top
            ? new THREE.Vector3(0, 1, 0.0001)
            : overview
              ? new THREE.Vector3(0, 0.85, 0.53)
              : new THREE.Vector3(0, 0.98, 0.2),
          distance,
        );
      controls.target.copy(target);
      controls.enableRotate = !s.top;
      controls.update();
    }
    const rooms = new THREE.Group(),
      objects = new THREE.Group();
    scene.add(rooms, objects);
    const pickable: THREE.Object3D[] = [];
    const labelLayer = document.createElement("div");
    labelLayer.className = styles.labels;
    element.appendChild(labelLayer);
    const labels: {
      el: HTMLElement;
      position: THREE.Vector3;
      kind: string;
      level: number;
      id: string;
    }[] = [];
    function label(
      text: string,
      point: number[],
      height: number,
      id: string,
      kind: string,
      level = 0,
    ) {
      const el = document.createElement(
        kind === "walk" || kind === "street" ? "span" : "button",
      );
      if (el instanceof HTMLButtonElement) {
        el.type = "button";
        el.onclick = () => select.current(id);
      }
      el.textContent = text;
      el.className = styles.mapLabel;
      if (kind === "walk" || kind === "station")
        el.classList.add(styles.walkLabel);
      if (kind === "station") el.title = "Fußweg zum Rosenwerk anzeigen";
      if (kind === "street") el.classList.add(styles.streetLabel);
      labelLayer.appendChild(el);
      const [x, z] = toLocal(point);
      labels.push({
        el,
        position: new THREE.Vector3(x, height, z),
        kind,
        id,
        level,
      });
    }
    // Put nested room outlines (e.g. CNC inside the woodshop) above their host floor.
    const floors = items
      .filter((item) => item.type === "place")
      .map((item) => {
        const area = item.features.reduce((sum, f) => {
          if (f.geometryType !== "Polygon") return sum;
          const ring = f.coordinates.map(toLocal);
          return (
            sum +
            Math.abs(
              ring.reduce((a, [x, z], i) => {
                const b = ring[(i + 1) % ring.length];
                return a + x * b[1] - z * b[0];
              }, 0),
            ) /
              2
          );
        }, 0);
        return { id: item.id, area };
      })
      .sort((a, b) => b.area - a.area);
    const floorY = new Map(
      floors.map((floor, i) => [floor.id, 0.12 + (0.01 * i) / floors.length]),
    );
    items.forEach((item) => {
      const place = item.type === "place",
        group = place ? rooms : objects;
      const firstChild = group.children.length;
      const inWorkshop =
        !item.outdoor &&
        item.id !== containerId &&
        !context.containers.some((c) =>
          pointInPolygon(item.point, c.coordinates),
        ) &&
        !context.courtyards.some((c) =>
          pointInPolygon(item.point, c.coordinates),
        );
      const lift =
        item.level !== 0
          ? floorHeight(item.level) - 0.29
          : inWorkshop
            ? context.inventoryLift
            : 0;
      const color = place
        ? item.outdoor
          ? "#9ba77e"
          : (floorFinishes[item.id] ?? "#a8a59b")
        : "#525b50";
      let hasPolygon = false;
      for (const feature of item.features) {
        if (feature.geometryType !== "Polygon") continue;
        hasPolygon = true;
        const shape = new THREE.Shape();
        feature.coordinates.forEach((p, i) => {
          const [x, z] = toLocal(p);
          if (i === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: place ? 0.18 : 0.7,
          bevelEnabled: false,
        });
        geometry.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            side: THREE.DoubleSide,
          }),
        );
        mesh.position.y = place ? (floorY.get(item.id) ?? 0.13) : 0.4;
        mesh.userData = {
          id: item.id,
          base: color,
          kind: place ? "room" : "object",
          outdoor: item.outdoor,
        };
        mesh.receiveShadow = true;
        group.add(mesh);
        pickable.push(mesh);
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({
            color: "#596052",
            transparent: true,
            opacity: 0.65,
          }),
        );
        edge.userData.inventoryId = item.id;
        edge.position.copy(mesh.position);
        group.add(edge);
        if (place && !item.outdoor) {
          const pts = feature.coordinates.map(toLocal);
          const outline: THREE.Vector3[] = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i],
              b = pts[(i + 1) % pts.length];
            const dx = b[0] - a[0],
              dz = b[1] - a[1];
            const edgeLength = Math.hypot(dx, dz);
            const spans = isDockWorkshop(item.id)
              ? dockWallSpans(item.id, a, b)
              : workshopWallSpans(item.id, a, b);
            for (const [start, end] of spans) {
              const length = (end - start) * edgeLength;
              if (length < 0.02) continue;
              const midpoint = (start + end) / 2;
              const wall = new THREE.Mesh(
                new THREE.BoxGeometry(length, 0.8, 0.12),
                new THREE.MeshStandardMaterial({
                  color: "#d1ccb7",
                  roughness: 1,
                }),
              );
              wall.position.set(
                a[0] + dx * midpoint,
                0.6,
                a[1] + dz * midpoint,
              );
              wall.rotation.y = -Math.atan2(dz, dx);
              wall.userData.wallOf = item.id;
              group.add(wall);
              for (const t of [start, end])
                outline.push(
                  new THREE.Vector3(a[0] + dx * t, 0.8, a[1] + dz * t),
                );
            }
          }
          const boundary = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(outline),
            new THREE.LineBasicMaterial({ color: "#5e655a" }),
          );
          boundary.userData.wallOf = item.id;
          group.add(boundary);
        }
      }
      const [x, z] = toLocal(item.point);
      if (!hasPolygon) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(
            place ? 1.1 : 0.27,
            place ? 1.1 : 0.27,
            place ? 0.4 : 0.7,
            8,
          ),
          new THREE.MeshStandardMaterial({ color }),
        );
        mesh.position.set(x, place ? 0.5 : 0.65, z);
        mesh.userData = {
          pointOnly: true,
          id: item.id,
          base: color,
          kind: place ? "room" : "object",
          outdoor: item.outdoor,
        };
        group.add(mesh);
        pickable.push(mesh);
      }
      for (const child of group.children.slice(firstChild)) {
        child.position.y += lift;
        child.userData.level = item.level;
        if (child instanceof THREE.Mesh) {
          child.receiveShadow = true;
          child.castShadow = !child.userData.pointOnly;
        }
      }
      if (place && item.id !== containerId)
        label(item.name, item.point, 2.4 + lift, item.id, "room", item.level);
    });
    label(
      "Rosenwerk",
      [13.71538, 51.04628],
      21,
      context.buildings[0].id,
      "site",
    );
    label(
      "KuSS · Kunststoffschmiede",
      context.containers[0].coordinates[0],
      4,
      containerId,
      "container",
    );
    for (const access of context.accessPoints) {
      label(access.name, access.point, 3, access.id, "site");
    }
    for (const route of walkingRoutes)
      label(route.name, route.points[0], 3, route.id, "walk");
    for (const route of walkingRoutes.filter((r) => r.id !== "florastrasse-2"))
      label(
        route.mode === "S-Bahn"
          ? "S-Bahn · Freiberger Straße"
          : "Tram · Florastraße",
        route.points[0],
        3,
        route.id,
        "station",
      );
    const entry = context.accessPoints.find((p) => p.id === "haupteingang")!;
    label("Haupteingang · Jagdweg 1–3", entry.point, 4, entry.id, "walk");
    label("Freiberger Straße", [13.7155, 51.04814], 0, "freiberger", "street");
    label("Jagdweg", [13.71562, 51.04704], 0, "jagdweg", "street");
    const compass = document.createElement("div");
    compass.className = styles.compass;
    compass.textContent = "↑ N";
    compass.setAttribute("aria-label", "Norden");
    element.appendChild(compass);
    const scale = document.createElement("div");
    scale.className = styles.scale;
    element.appendChild(scale);
    let model: THREE.Group | null = null;
    let lastRevision = -1;
    const bakedSurfaces = new Set<THREE.MeshStandardMaterial>();
    let walker: ReturnType<typeof firstPerson> | null = null;
    let doors: ReturnType<typeof walkDoors> = [];
    const oldPosition = new THREE.Vector3(),
      oldTarget = new THREE.Vector3();
    const mapLabel = canvas.getAttribute("aria-label")!;
    function endWalk() {
      if (!walker) return;
      walker.stop();
      walker = null;
      setWalking(false);
      for (const el of [labelLayer, compass, scale]) el.style.display = "";
      canvas.setAttribute("aria-label", mapLabel);
      camera.position.copy(oldPosition);
      controls.target.copy(oldTarget);
      camera.zoom = Math.min(1, camera.aspect / 1.2);
      controls.enabled = true;
      controls.update();
      sun.shadow.needsUpdate = true;
    }
    function toggleWalk() {
      if (walker) {
        endWalk();
        update(current.current);
        return;
      }
      if (!model) return;
      const s = current.current;
      oldPosition.copy(camera.position);
      oldTarget.copy(controls.target);
      let eye = factoryPoint(64.4, -7.0),
        look = factoryPoint(69, -7.0),
        height = 0.16;
      if (s.mode === "inside") {
        const view = isDockWorkshop(s.focus)
          ? dockViewpoints(s.focus, s.dockView)
          : workshopViewpoints(s.workshopView);
        eye = view.eye;
        look = view.target;
        height = floorHeight(0);
      } else {
        const starts: Record<string, [number, number, number, number, number]> =
          {
            haupteingang: [86.45, 26.65, 80.9, 26.65, 0.16],
            "seiteneingang-jagdweg": [88.5, 92.5, 81, 92.5, 0.16],
            "hoftor-rosenstrasse": [-4, -4.4, -4, 5, 0.16],
            geschaeftstreppen: [35.9, -5.7, 35.9, 0, 0.16],
            pflanzcontainer: [78.5, -13, 82, -13, 0.16],
            "lkw-laderampe": [1.35, 25.61, 4, 25.61, 1.23],
            "hintere-laderampe": [3.4, 74.9, 3.4, 68, 0.16],
            rueckseite: [3.4, 74.9, 3.4, 68, 0.16],
          };
        const start = starts[s.focus ?? ""];
        if (start) {
          eye = factoryPoint(start[0], start[1]);
          look = factoryPoint(start[2], start[3]);
          height = start[4];
        }
      }
      // Display the complete shell and ground-floor inventory along the walk.
      update({ ...s, mode: "site", level: 0, revision: lastRevision });
      model.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.kind === "slab")
          o.visible = true;
      });
      rooms.visible = true;
      objects.visible = true;
      for (const o of [...rooms.children, ...objects.children])
        if (o.userData.pointOnly) o.visible = false;
      for (const o of rooms.children) if (o.userData.outdoor) o.visible = false;
      controls.enabled = false;
      camera.fov = 68;
      camera.near = 0.04;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      for (const el of [labelLayer, compass, scale]) el.style.display = "none";
      canvas.setAttribute(
        "aria-label",
        "Rundgang in Ich-Perspektive. WASD zum Gehen, ziehen zum Umsehen, E für Türen und Escape zum Beenden.",
      );
      walker = firstPerson(
        camera,
        canvas,
        [model, ground, neighborhood.buildings, rooms, objects],
        doors,
        [eye[0], height, eye[1]],
        look,
        (doorsMoved) => {
          if (doorsMoved) sun.shadow.needsUpdate = true;
          renderer.render(scene, camera);
        },
        () => {
          endWalk();
          update(current.current);
        },
        setDoor,
      );
      setWalking(true);
    }
    function render() {
      if (walker) {
        renderer.render(scene, camera);
        return;
      }
      const s = current.current;
      const distance = camera.position.distanceTo(controls.target);
      // Retain depth precision between pavement, road and rails when zooming out.
      const near =
        s.mode === "inside"
          ? 0.1
          : THREE.MathUtils.clamp(distance / 160, 0.1, 6);
      if (camera.near !== near) {
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      updateSun(s.mode === "arrival");
      const occupied: { x: number; y: number; w: number }[] = [];
      for (const l of [...labels].sort(
        (a, b) => Number(b.id === s.selected) - Number(a.id === s.selected),
      )) {
        const p = l.position.clone().project(camera);
        let inMode: boolean;
        switch (s.mode) {
          case "arrival":
            inMode =
              l.kind === "street" ||
              (l.kind === "walk" &&
                (l.id === s.routeId || l.id === "haupteingang"));
            break;
          case "site":
            inMode =
              l.kind === "station" ||
              (l.kind === "street" && distance > 165) ||
              l.id === context.buildings[0].id ||
              (distance < 260 && (l.kind === "site" || l.kind === "container"));
            break;
          case "inside":
            inMode =
              (l.kind === "room" || l.kind === "container") &&
              l.level === s.level;
            break;
        }
        let visible =
          s.labels &&
          inMode &&
          p.z < 1 &&
          p.z > -1 &&
          Math.abs(p.x) < 0.95 &&
          Math.abs(p.y) < 0.93 &&
          (!s.focus || (l.id !== s.selected && distance > 48));
        const w = l.el.offsetWidth || 130;
        const rawX = ((p.x + 1) * element!.clientWidth) / 2;
        const px =
          s.mode === "arrival"
            ? THREE.MathUtils.clamp(
                rawX,
                w / 2 + 5,
                element!.clientWidth - w / 2 - 5,
              )
            : rawX;
        const py =
          ((1 - p.y) * element!.clientHeight) / 2 +
          (l.kind === "walk"
            ? -18
            : l.kind === "station" && element!.clientWidth < 420
              ? l.id === "florastrasse"
                ? 25
                : 9
              : 0);
        if (
          visible &&
          occupied.some(
            (r) =>
              Math.abs(r.x - px) < (r.w + w) / 2 + 6 && Math.abs(r.y - py) < 32,
          )
        )
          visible = false;
        if (visible) occupied.push({ x: px, y: py, w });
        l.el.hidden = !visible;
        if (visible)
          l.el.style.transform = `translate(-50%,-50%) translate(${px}px,${py}px)`;
      }
      compass.style.transform = `rotate(${Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z)}rad)`;
      const metres = distance < 12 ? 1 : distance > 300 ? 100 : 10;
      const a = controls.target.clone().project(camera),
        b = controls.target
          .clone()
          .add(
            new THREE.Vector3()
              .setFromMatrixColumn(camera.matrixWorld, 0)
              .multiplyScalar(metres),
          )
          .project(camera);
      scale.style.width = `${Math.max(10, (Math.abs(b.x - a.x) * element!.clientWidth) / 2)}px`;
      scale.textContent = `${metres} m`;
      renderer.render(scene, camera);
    }
    function update(s: SceneState) {
      if (walker) endWalk();
      const arrival = s.mode === "arrival";
      const outside = s.mode !== "inside";
      reflections.update(s.mode === "site", s.neighbors);
      for (const material of bakedSurfaces)
        material.aoMapIntensity = outside ? 1 : 0;
      const workshop =
        s.mode === "inside" && s.level === 0 && s.focus === laserWorkshopId;

      const dockInterior =
        s.mode === "inside" && s.level === 0 && isDockWorkshop(s.focus);
      lightWorkshops(workshop, dockInterior && !s.top ? s.focus : null);
      camera.fov = !s.top && dockInterior ? 68 : workshop && !s.top ? 56 : 42;
      camera.updateProjectionMatrix();
      neighborhood.setView(s.mode, s.neighbors, s.routeId, model !== null);
      controls.maxDistance = outside ? 1900 : 300;
      controls.maxTargetRadius = outside ? 1050 : 95;
      sun.shadow.needsUpdate = true;
      const basement =
        s.mode === "inside" && s.level === context.basement.level;
      ground.position.y = basement
        ? context.basement.height - 0.2
        : model
          ? -1.3
          : -0.1;
      model?.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        switch (o.userData.kind) {
          case "access":
            o.visible = outside ? !o.userData.sectionOnly : s.level === 0;
            break;
          case "upper_support":
            o.visible = s.mode === "inside" && s.level > 0;
            break;
          case "neighbor":
            o.visible = outside && s.neighbors;
            break;
          case "surround":
            o.visible = !basement;
            break;
          case "ground":
          case "platform":
            o.visible = !basement;
            break;
          case "slab":
            o.visible = s.mode === "inside" && !basement;
            break;
          case "building":
          case "exterior":
          case "container":
            o.visible = outside;
            break;
          case "upper":
            o.visible = s.mode === "inside" && o.userData.level <= s.level;
            break;
          case "interior":
            o.visible = outside
              ? !o.userData.sectionOnly &&
                o.userData.id !== context.courtyards[0].sourceResourceId
              : (o.userData.level ?? 0) === s.level &&
                (!o.userData.workshopOverhead ||
                  (dockInterior && s.focus === o.userData.id && !s.top));
            break;
          case "machine":
            o.visible = outside || s.level === 0;
            break;
        }
      });
      // The detailed model replaces the three footprint blocks only after a successful load.
      for (const o of rooms.children) {
        const id = o.userData.id ?? o.userData.inventoryId;
        o.visible =
          o.userData.level === s.level &&
          !(
            model &&
            (id === context.courtyards[0].sourceResourceId ||
              o.userData.wallOf === laserWorkshopId ||
              isDockWorkshop(o.userData.wallOf) ||
              o.userData.wallOf === context.timberWorkshop.cncRoomId)
          );
      }
      for (const o of objects.children) {
        const id = o.userData.id ?? o.userData.inventoryId;
        o.visible =
          o.userData.level === s.level &&
          !(
            model &&
            (dockMachineIds.has(id) ||
              context.machines.some((m) => m.id === id))
          );
      }
      rooms.visible = s.mode === "inside";
      objects.visible = rooms.visible && s.objects;
      for (const o of pickable)
        if (o instanceof THREE.Mesh) {
          if (o.userData.pointOnly && o.userData.kind === "room") {
            o.visible =
              o.userData.level === s.level &&
              (!s.focus || o.userData.id === s.focus);
          }
          const m = o.material as THREE.MeshStandardMaterial;
          m.color.set(
            o.userData.id === s.selected
              ? "#d9bb80"
              : (o.userData.base ?? "#aaa"),
          );
        }
      if (s.revision !== lastRevision) {
        lastRevision = s.revision;
        const target = new THREE.Vector3(-17, 2, -5);
        let distance = 115;

        const item = items.find((i) => i.id === s.focus),
          building = context.buildings.find((i) => i.id === s.focus);
        const access = context.accessPoints.find(
          (entry) => entry.id === s.focus,
        );
        if (access) {
          const [x, z] =
            access.id === "rollstuhlrampe"
              ? factoryPoint(69.8, -4.8)
              : toLocal(access.point);
          target.set(x, access.viewHeight ?? 1.8, z);
          distance = access.distance;
        } else if (s.focus === containerId) {
          const corners = context.containers.flatMap((c) =>
            c.coordinates.map(toLocal),
          );
          target.set(
            corners.reduce((sum, p) => sum + p[0], 0) / corners.length,
            1.0,
            corners.reduce((sum, p) => sum + p[1], 0) / corners.length,
          );
          distance = 16;
        } else if (item) {
          const [x, z] = toLocal(item.point);
          target.set(x, floorHeight(item.level) + 0.65, z);
          const coords = item.features.flatMap((f) =>
            f.geometryType === "Polygon" ? f.coordinates.map(toLocal) : [],
          );
          const extent = coords.length
            ? Math.max(
                Math.max(...coords.map((p) => p[0])) -
                  Math.min(...coords.map((p) => p[0])),
                Math.max(...coords.map((p) => p[1])) -
                  Math.min(...coords.map((p) => p[1])),
              )
            : 12;
          distance =
            item.type !== "place"
              ? 9
              : item.level !== 0
                ? Math.max(7, extent * 1.12)
                : Math.max(10, extent * 1.55);
        } else if (building) {
          const ring = building.coordinates;
          const [x, z] = toLocal([
            ring.reduce((a, p) => a + p[0], 0) / ring.length,
            ring.reduce((a, p) => a + p[1], 0) / ring.length,
          ]);
          target.set(x, 0, z);
          distance = 100;
        }
        if (basement && !item) {
          const lab = items.find(
            (entry) => entry.id === context.interiors["Darkroom (Fotolabor)"],
          );
          const [x, z] = toLocal(lab?.point ?? context.basement.center);
          target.set(x, context.basement.height + 0.8, z);
          distance = 15;
        } else if (!item && s.mode === "inside" && s.level > 0) {
          target.y = floorHeight(s.level);
          distance = 96;
        }
        if (arrival || (s.mode === "site" && s.stationOverview)) fitContext(s);
        else {
          camera.position
            .copy(target)
            .add(
              s.top
                ? new THREE.Vector3(0, distance, 0.01)
                : access
                  ? new THREE.Vector3(...access.camera).multiplyScalar(distance)
                  : s.mode === "site" && s.focus !== containerId
                    ? new THREE.Vector3(
                        distance * 0.36,
                        distance * 0.72,
                        -distance * 0.97,
                      )
                    : new THREE.Vector3(
                        distance * 0.76,
                        distance * 0.7,
                        distance * 0.62,
                      ),
            );
          if ((workshop || dockInterior) && !s.top) {
            const view = dockInterior
              ? dockViewpoints(s.focus, s.dockView)
              : workshopViewpoints(s.workshopView);
            const floor = floorHeight(0);
            camera.position.set(
              view.eye[0],
              floor + view.eyeHeight,
              view.eye[1],
            );
            target.set(
              view.target[0],
              floor + view.targetHeight,
              view.target[1],
            );
          }
          controls.target.copy(target);
          controls.enableRotate = !s.top;
          controls.update();
        }
      }
      render();
    }
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.zoom = walker ? 1 : Math.min(1, camera.aspect / 1.2);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const s = current.current;
      if (
        !walker &&
        (s.mode === "arrival" || (s.mode === "site" && s.stationOverview))
      )
        fitContext(s);
      render();
    });
    resize.observe(element);
    controls.addEventListener("change", render);
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = [0, 0];
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (walker) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const targets = [
        ...(rooms.visible ? rooms.children : []),
        ...(objects.visible ? objects.children : []),
        ...(model?.children ?? []),
      ];
      const hit = ray
        .intersectObjects(targets, true)
        .find(
          (h) =>
            h.object instanceof THREE.Mesh &&
            h.object.visible &&
            ![
              "slab",
              "upper",
              "upper_support",
              "ground",
              "surround",
              "neighbor",
            ].includes(h.object.userData.kind) &&
            h.object.userData.id,
        );
      if (hit) {
        const { id, outsideDestination } = hit.object.userData;
        select.current(
          String(
            current.current.mode === "inside" && outsideDestination
              ? outsideDestination
              : id,
          ),
        );
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (walker) return;
      if (e.key === "+" || e.key === "=") {
        camera.position
          .sub(controls.target)
          .multiplyScalar(0.8)
          .add(controls.target);
        e.preventDefault();
      } else if (e.key === "-") {
        camera.position
          .sub(controls.target)
          .multiplyScalar(1.2)
          .add(controls.target);
        e.preventDefault();
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        const d = new THREE.Vector3(
          e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0,
          0,
          e.key === "ArrowUp" ? -5 : e.key === "ArrowDown" ? 5 : 0,
        );
        controls.target.add(d);
        camera.position.add(d);
        e.preventDefault();
      }
      controls.update();
      render();
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      setStatus(
        "Die 3D-Darstellung wurde unterbrochen. Bitte lade die Seite neu; die Ortsliste bleibt verfügbar.",
      );
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onLost);
    controller.current = {
      update,
      toggleWalk,
      useDoor: () => walker?.use(),
      press: (key, on) => walker?.press(key, on),
      dispose: () => {
        walker?.stop();
        resize.disconnect();
        controls.dispose();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("keydown", onKey);
        canvas.removeEventListener("webglcontextlost", onLost);
        disposeTree(scene);
        reflections.dispose();
        sun.shadow.dispose();
        renderer.dispose();
        canvas.remove();
        labelLayer.remove();
        compass.remove();
        scale.remove();
      },
    };
    update(current.current);
    new GLTFLoader().load(
      "/models/rosenwerk/context.glb",
      (gltf) => {
        if (cancelled) {
          disposeTree(gltf.scene);
          return;
        }
        model = gltf.scene;
        // glTF nodes with multiple materials load as groups of primitive meshes.
        model.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          let part: THREE.Object3D | null = o;
          while (part && !part.userData.kind) part = part.parent;
          if (part)
            Object.assign(o.userData, {
              id: part.userData.id,
              kind: part.userData.kind,
              level: part.userData.level,
              sectionOnly: part.userData.sectionOnly,
              outsideDestination: part.userData.outsideDestination,
              soffit: part.userData.soffit,
              workshopOverhead: part.userData.workshopOverhead,
            });
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          for (const material of materials) {
            if (!(material instanceof THREE.MeshStandardMaterial)) continue;
            reflections.register(material);
            if (material.aoMap) bakedSurfaces.add(material);
            if (material.map)
              material.map.anisotropy = Math.min(
                8,
                renderer.capabilities.getMaxAnisotropy(),
              );
          }
          const glazed = materials.every((material) => material.transparent);
          o.castShadow =
            o.userData.kind !== "surround" && !o.userData.soffit && !glazed;
          // Three's variance pass also draws receivers into its shadow map.
          o.receiveShadow = !varianceShadows || (!glazed && !o.userData.soffit);
        });
        scene.add(model);
        model.updateMatrixWorld(true);
        doors = walkDoors(model);
        ground.position.y = -1.3;
        update(current.current);
        setStatus("");
      },
      undefined,
      () => {
        if (!cancelled)
          setStatus(
            "Das Rosenwerk-Modell konnte nicht geladen werden. Die Inventaransicht und Ortsliste bleiben verfügbar.",
          );
      },
    );
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
    };
  }, [items]);
  return (
    <div className={styles.scene}>
      <div className={styles.scene} ref={host} />
      {!status &&
        (state.mode === "site" ||
          (state.mode === "inside" &&
            state.level === 0 &&
            (state.focus === laserWorkshopId ||
              isDockWorkshop(state.focus)))) && (
          <div className={walking ? styles.walkActive : styles.walkStart}>
            <button
              type="button"
              onClick={() => controller.current?.toggleWalk()}
            >
              {walking ? "Rundgang beenden" : "Rundgang starten"}
            </button>
            {walking && (
              <>
                <span className={styles.walkHelp}>
                  WASD zum Gehen · Ziehen zum Umsehen · E für Türen
                </span>
                {door && (
                  <button
                    type="button"
                    onClick={() => controller.current?.useDoor()}
                  >
                    {door}
                  </button>
                )}
                <div className={styles.walkPad}>
                  {(
                    [
                      ["KeyA", "←", "Nach links gehen"],
                      ["KeyW", "↑", "Vorwärts gehen"],
                      ["KeyS", "↓", "Rückwärts gehen"],
                      ["KeyD", "→", "Nach rechts gehen"],
                    ] as const
                  ).map(([code, symbol, label]) => (
                    <button
                      type="button"
                      key={code}
                      aria-label={label}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        controller.current?.press(code, true);
                      }}
                      onLostPointerCapture={() =>
                        controller.current?.press(code, false)
                      }
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      {status && (
        <div className={styles.sceneStatus} role="status">
          {status}
        </div>
      )}
    </div>
  );
}
