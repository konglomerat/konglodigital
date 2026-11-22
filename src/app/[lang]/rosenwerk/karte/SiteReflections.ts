import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

// Each panorama is a Cycles capture looking out from the corresponding facade.
// Three prefilters it by material roughness and samples it along the reflected view ray.
export function createSiteReflections(
  scene: THREE.Scene,
  fill: THREE.HemisphereLight,
  redraw: () => void,
) {
  const loader = new HDRLoader();
  const maps = new Map<string, THREE.DataTexture | null>();
  const surfaces = new Map<THREE.MeshStandardMaterial, string>();
  let exterior = false,
    neighbors = true,
    disposed = false;

  function request(name: string) {
    if (maps.has(name)) return;
    maps.set(name, null);
    loader.load(
      `/models/rosenwerk/licht/${name}.hdr`,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        maps.set(name, texture);
        if (name === "himmel") {
          scene.environment = texture;
          scene.environmentIntensity = 0.52;
          fill.intensity = 0.64;
        }
        apply();
        redraw();
      },
      undefined,
      () => {
        /* The sky and direct lights remain available while a probe is missing. */
      },
    );
  }

  function apply() {
    for (const [material, zone] of surfaces) {
      const name = neighbors || zone === "innenhof" ? zone : zone + "-offen";
      if (exterior) request(name);
      const next = exterior ? (maps.get(name) ?? null) : null;
      if (material.envMap === next) continue;
      material.envMap = next;
      material.needsUpdate = true;
    }
  }

  function register(material: THREE.MeshStandardMaterial) {
    const zone = material.userData.reflectionZone;
    if (typeof zone !== "string" || surfaces.has(material)) return;
    surfaces.set(material, zone);
    material.envMapIntensity = 1.0;
    if (material.userData.windowGlass) {
      // Alpha blending would attenuate reflected light a second time. Keep
      // dielectric highlights and let the pane obscure more at grazing angles.
      material.depthWrite = false;
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <opaque_fragment>",
          `float glassAngle = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
           diffuseColor.a = mix(diffuseColor.a, 0.96, pow(glassAngle, 5.0));
           outgoingLight = totalDiffuse * 0.30 + totalSpecular / max(diffuseColor.a, 0.04);
           #include <opaque_fragment>`,
        );
      };
      material.customProgramCacheKey = () => "rosenwerk-window";
    }
  }

  request("himmel");
  return {
    register,
    update(outside: boolean, showNeighbors: boolean) {
      exterior = outside;
      neighbors = showNeighbors;
      apply();
    },
    dispose() {
      disposed = true;
      scene.environment = null;
      for (const material of surfaces.keys()) material.envMap = null;
      for (const texture of maps.values()) texture?.dispose();
      maps.clear();
      surfaces.clear();
    },
  };
}
