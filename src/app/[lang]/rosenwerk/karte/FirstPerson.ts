import * as T from "three";
import { factoryPoint } from "@/lib/rosenwerk/dock-workshops";
import { WalkWorld } from "./WalkWorld";

export function walkDoors(model: T.Object3D) {
  const leaves: T.Object3D[] = [];
  model.traverse((o) => {
    if (o.userData.doorPivot) leaves.push(o);
  });
  return leaves.map((leaf) => {
    const [u, v] = leaf.userData.doorPivot;
    const [x, z] = factoryPoint(u, v);
    const pivot = new T.Group();
    pivot.position.set(x, 0, z);
    leaf.parent!.add(pivot);
    pivot.attach(leaf);
    return {
      pivot,
      noun: leaf.userData.doorNoun ?? "Tür",
      angle: (leaf.userData.doorTurn * Math.PI) / 180,
      initial: !!leaf.userData.doorOpen,
      open: !!leaf.userData.doorOpen,
      target: 0,
    };
  });
}
export function firstPerson(
  camera: T.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  roots: T.Object3D[],
  doors: ReturnType<typeof walkDoors>,
  spawn: number[],
  look: number[],
  draw: (doorsMoved: boolean) => void,
  leave: () => void,
  onDoor: (s: string) => void,
) {
  const world = new WalkWorld(roots);
  const feet = new T.Vector3(spawn[0], spawn[1], spawn[2]);
  // Inventory items may move into a saved viewpoint. Use a clear spot at the same level.
  const candidate = feet.clone();
  function place(x: number, z: number) {
    candidate.set(x, world.floor(x, z, spawn[1] + 0.23, 4), z);
    if (!Number.isFinite(candidate.y) || world.blocked(candidate)) return false;
    feet.copy(candidate);
    return true;
  }
  if (!place(spawn[0], spawn[2])) {
    search: for (const radius of [0.35, 0.7, 1.4, 2.1, 3]) {
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI) / 6;
        if (
          place(
            spawn[0] + radius * Math.cos(angle),
            spawn[2] + radius * Math.sin(angle),
          )
        )
          break search;
      }
    }
  }
  let yaw = Math.atan2(feet.x - look[0], feet.z - look[1]),
    pitch = -0.035;
  const keys = new Set<string>(),
    abort = new AbortController(),
    opts = { signal: abort.signal };
  const movable = doors.map((d) => {
    const meshes = new Set<T.Object3D>();
    d.pivot.traverse((m) => meshes.add(m));
    return { ...d, parts: world.colliders.filter((c) => meshes.has(c.mesh)) };
  });
  let active: (typeof movable)[number] | undefined,
    lastLabel = "",
    frame = 0,
    last = 0,
    dirty = true,
    falling = false;
  function use() {
    if (active) {
      active.target = active.target === 0 ? active.angle : 0;
      active.open = active.target === 0 ? active.initial : !active.initial;
      dirty = true;
    }
  }
  function tick(now: number) {
    const dt = Math.min(0.08, (now - last) / 1000);
    last = now;
    let doorsMoved = false;
    let forward =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    let side = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const turn = Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"));
    yaw += turn * dt * 1.85;
    const speed = (2.7 * dt) / Math.max(1, Math.hypot(forward, side));
    forward *= speed;
    side *= speed;
    const previousHeight = feet.y;
    if (forward || side || falling)
      world.move(
        feet,
        -Math.sin(yaw) * forward + Math.cos(yaw) * side,
        -Math.cos(yaw) * forward - Math.sin(yaw) * side,
        dt,
      );
    falling = feet.y < previousHeight - 0.001;
    let nearest = 2.15;
    active = undefined;
    for (const d of movable) {
      const dist = Math.min(
        ...d.parts.map((c) => c.bounds.distanceToPoint(camera.position)),
      );
      if (dist < nearest) {
        nearest = dist;
        active = d;
      }
      const a = d.pivot.rotation.y,
        delta = d.target - a;
      if (Math.abs(delta) < 0.0001) continue;
      const travel = Math.sign(delta) * Math.min(Math.abs(delta), dt * 2.6);
      const steps = Math.ceil(Math.abs(travel) / 0.045);
      for (let j = 0; j < steps; j++) {
        const before = d.pivot.rotation.y;
        d.pivot.rotation.y += travel / steps;
        d.parts.forEach((c) => c.refresh());
        if (world.blocked(feet, d.parts)) {
          d.pivot.rotation.y = before;
          d.parts.forEach((c) => c.refresh());
          break;
        }
        doorsMoved = true;
      }
    }
    const label = active
      ? active.noun + (active.open ? " schließen" : " öffnen")
      : "";
    if (label !== lastLabel) {
      lastLabel = label;
      onDoor(label);
    }
    if (
      dirty ||
      turn ||
      side ||
      forward ||
      doorsMoved ||
      feet.y !== previousHeight
    ) {
      camera.position.set(feet.x, feet.y + 1.63, feet.z);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      camera.updateMatrixWorld();
      draw(doorsMoved);
      dirty = false;
    }
    frame = requestAnimationFrame(tick);
  }
  const movements = [
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ];
  canvas.tabIndex = 0;
  canvas.focus({ preventScroll: true });
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target instanceof HTMLElement &&
        /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
      )
        return;
      if (e.code === "Escape") {
        leave();
        return;
      }
      if (movements.includes(e.code)) {
        keys.add(e.code);
        e.preventDefault();
      }
      if (e.code === "KeyE" && !e.repeat) {
        use();
        e.preventDefault();
      }
    },
    opts,
  );
  window.addEventListener("keyup", (e) => keys.delete(e.code), opts);
  window.addEventListener("blur", () => keys.clear(), opts);
  let dragging: number | null = null,
    lastX = 0,
    lastY = 0;
  canvas.addEventListener(
    "pointerdown",
    (e) => {
      dragging = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
    },
    opts,
  );
  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (dragging !== e.pointerId) return;
      yaw -= (e.clientX - lastX) * 0.004;
      pitch = T.MathUtils.clamp(
        pitch - (e.clientY - lastY) * 0.004,
        -1.35,
        1.35,
      );
      lastX = e.clientX;
      lastY = e.clientY;
      dirty = true;
    },
    opts,
  );
  canvas.addEventListener(
    "lostpointercapture",
    () => {
      dragging = null;
    },
    opts,
  );
  frame = requestAnimationFrame(tick);
  return {
    use,
    press: (key: string, on: boolean) => {
      if (on) keys.add(key);
      else keys.delete(key);
    },
    stop() {
      abort.abort();
      cancelAnimationFrame(frame);
      for (const d of movable) d.pivot.rotation.y = 0;
      onDoor("");
    },
  };
}
