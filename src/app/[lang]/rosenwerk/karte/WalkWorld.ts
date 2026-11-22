import * as T from "three";
import { MeshBVH } from "three-mesh-bvh";

const radius = 0.23;
const step = 0.225;
const down = new T.Vector3(0, -1, 0);
const trees = new WeakMap<T.BufferGeometry, MeshBVH>();
function tree(g: T.BufferGeometry) {
  let b = trees.get(g);
  if (!b) {
    b = new MeshBVH(g, { indirect: true });
    trees.set(g, b);
  }
  return b;
}

export class WalkCollider {
  bounds = new T.Box3();
  inverse = new T.Matrix4();
  scale = 1;
  constructor(readonly mesh: T.Mesh) {
    this.refresh();
  }
  refresh() {
    this.mesh.updateWorldMatrix(true, false);
    const geometry = this.mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    this.bounds.copy(geometry.boundingBox!).applyMatrix4(this.mesh.matrixWorld);
    this.inverse.copy(this.mesh.matrixWorld).invert();
    this.scale = this.inverse.getMaxScaleOnAxis();
  }
}

export class WalkWorld {
  readonly colliders: WalkCollider[] = [];
  private volume = new T.Box3();
  private box = new T.Box3();
  private segment = new T.Line3();
  private ray = new T.Ray();
  private localRay = new T.Ray();
  private point = new T.Vector3();
  constructor(roots: T.Object3D[]) {
    for (const root of roots)
      root.traverseVisible((o) => {
        if (o instanceof T.Mesh && !o.userData.pointOnly)
          this.colliders.push(new WalkCollider(o));
      });
  }
  blocked(p: T.Vector3, candidates = this.colliders) {
    // Reserve the bottom riser for steps. The remaining body extends up to head height.
    this.volume.min.set(p.x - radius, p.y + step + 0.01, p.z - radius);
    this.volume.max.set(p.x + radius, p.y + 1.78, p.z + radius);
    return candidates.some((c) => {
      if (!this.volume.intersectsBox(c.bounds)) return false;
      const r = radius * c.scale;
      this.segment.start
        .set(p.x, p.y + step + radius + 0.01, p.z)
        .applyMatrix4(c.inverse);
      this.segment.end
        .set(p.x, p.y + 1.78 - radius, p.z)
        .applyMatrix4(c.inverse);
      this.box.copy(this.volume).applyMatrix4(c.inverse);
      return tree(c.mesh.geometry).shapecast({
        intersectsBounds: (b) => b.intersectsBox(this.box),
        intersectsTriangle: (t) =>
          t.closestPointToSegment(this.segment) < r - 0.001,
      });
    });
  }
  floor(x: number, z: number, from: number, depth: number) {
    let top = -Infinity;
    // Five sole samples bridge grate openings and acquire the next stair tread.
    for (const [dx, dz] of [
      [0, 0],
      [-0.16, 0],
      [0.16, 0],
      [0, -0.16],
      [0, 0.16],
    ]) {
      this.ray.origin.set(x + dx, from, z + dz);
      this.ray.direction.copy(down);
      for (const c of this.colliders) {
        const { min, max } = c.bounds;
        const q = this.ray.origin;
        if (
          q.x < min.x ||
          q.x > max.x ||
          q.z < min.z ||
          q.z > max.z ||
          min.y > from ||
          max.y < Math.max(top, from - depth)
        )
          continue;
        this.localRay.copy(this.ray).applyMatrix4(c.inverse);
        const hit = tree(c.mesh.geometry).raycastFirst(
          this.localRay,
          T.DoubleSide,
          0,
          depth * c.scale,
        );
        if (
          hit &&
          hit.face &&
          Math.abs(
            this.point
              .copy(hit.face.normal)
              .transformDirection(c.mesh.matrixWorld).y,
          ) > 0.6
        ) {
          top = Math.max(
            top,
            this.point.copy(hit.point).applyMatrix4(c.mesh.matrixWorld).y,
          );
        }
      }
    }
    return top;
  }
  move(p: T.Vector3, dx: number, dz: number, dt: number) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.075)),
      next = p.clone();
    for (let i = 0; i < n; i++) {
      for (const [x, z] of [
        [dx / n, 0],
        [0, dz / n],
      ]) {
        if (!x && !z) continue;
        next.set(p.x + x, p.y, p.z + z);
        const h = this.floor(next.x, next.z, p.y + step, 3);
        if (!Number.isFinite(h)) continue;
        next.y = Math.max(p.y, h);
        if (!this.blocked(next)) p.copy(next);
      }
      const h = this.floor(p.x, p.z, p.y + step, 4);
      if (Number.isFinite(h)) p.y = Math.max(h, p.y - (3.2 * dt) / n);
    }
  }
}
