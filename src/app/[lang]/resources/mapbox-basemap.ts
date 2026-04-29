import type { Map } from "mapbox-gl";

export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";
export const MAPBOX_SATELLITE_STYLE =
  "mapbox://styles/mapbox/satellite-streets-v12";
export const DEFAULT_INDOOR_TILESET_ID =
  "utzel.cml4aix4s0qwf1nqls72johvd-9gtgu";

const getTilesetSlug = (tilesetId: string) =>
  tilesetId.replace(/^mapbox:\/\//, "");

const getTilesetUrl = (tilesetId: string) =>
  tilesetId.startsWith("mapbox://")
    ? tilesetId
    : `mapbox://${getTilesetSlug(tilesetId)}`;

const resolveIndoorLayer = async ({
  token,
  tilesetSlug,
  sourceLayer,
  cacheRef,
  onError,
}: {
  token: string;
  tilesetSlug: string;
  sourceLayer?: string;
  cacheRef: React.MutableRefObject<string[] | null>;
  onError: (message: string) => void;
}): Promise<string[] | null> => {
  if (sourceLayer) {
    return [sourceLayer];
  }
  if (process.env.NEXT_PUBLIC_MAPBOX_INDOOR_LAYER) {
    return [process.env.NEXT_PUBLIC_MAPBOX_INDOOR_LAYER];
  }
  if (cacheRef.current) {
    return cacheRef.current;
  }
  try {
    const tileJsonUrl = `https://api.mapbox.com/v4/${tilesetSlug}.json?access_token=${token}`;
    const response = await fetch(tileJsonUrl);
    if (!response.ok) {
      throw new Error("Unable to load tileset metadata.");
    }
    const data = (await response.json()) as {
      vector_layers?: { id: string }[];
    };
    const layerIds = data.vector_layers
      ?.map((layer) => layer.id)
      .filter(Boolean);
    if (!layerIds || layerIds.length === 0) {
      throw new Error("Tileset has no vector layers.");
    }
    cacheRef.current = layerIds;
    return layerIds;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read tileset layers.";
    onError(message);
    return null;
  }
};

export const addIndoorOverlay = async ({
  map,
  token,
  tilesetId,
  sourceLayer,
  cacheRef,
  onError,
}: {
  map: Map;
  token: string;
  tilesetId: string;
  sourceLayer?: string;
  cacheRef: React.MutableRefObject<string[] | null>;
  onError: (message: string) => void;
}) => {
  const tilesetSlug = getTilesetSlug(tilesetId);
  const layerNames = await resolveIndoorLayer({
    token,
    tilesetSlug,
    sourceLayer,
    cacheRef,
    onError,
  });
  if (!layerNames || layerNames.length === 0) {
    return;
  }
  const tilesetUrl = getTilesetUrl(tilesetId);
  if (!map.getSource("indoor-overlay")) {
    map.addSource("indoor-overlay", {
      type: "vector",
      url: tilesetUrl,
    });
  }
  layerNames.forEach((layerName) => {
    const fillId = `indoor-fill-${layerName}`;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: "indoor-overlay",
        "source-layer": layerName,
        minzoom: 17,
        filter: [
          "==",
          ["coalesce", ["get", "kind"], ["get", "properties.kind"], ""],
          "furniture",
        ],
        paint: {
          "fill-color": "#313131",
          "fill-opacity": 0.2,
        },
      });
    }

    const outlineId = `indoor-outline-${layerName}`;
    if (!map.getLayer(outlineId)) {
      map.addLayer({
        id: outlineId,
        type: "line",
        source: "indoor-overlay",
        "source-layer": layerName,
        minzoom: 17,
        filter: [
          "all",
          ["!=", ["coalesce", ["get", "kind"], ""], "furniture"],
          ["!=", ["coalesce", ["get", "kind"], ""], "door"],
        ],
        paint: {
          "line-color": "#2563eb",
          "line-width": 7,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      });
    }

    const doorId = `indoor-door-${layerName}`;
    if (!map.getLayer(doorId)) {
      map.addLayer({
        id: doorId,
        type: "line",
        source: "indoor-overlay",
        "source-layer": layerName,
        minzoom: 17,
        filter: [
          "==",
          ["coalesce", ["get", "kind"], ["get", "properties.kind"], ""],
          "door",
        ],
        paint: {
          "line-color": "#ded7d3",
          "line-width": 12,
        },
      });
    }

    const labelIdFurniture = `indoor-label-${layerName}-furniture`;
    if (!map.getLayer(labelIdFurniture)) {
      map.addLayer({
        id: labelIdFurniture,
        type: "symbol",
        source: "indoor-overlay",
        "source-layer": layerName,
        minzoom: 17,
        layout: {
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "bottom",
          "text-allow-overlap": false,
        },
        filter: ["all", ["==", ["coalesce", ["get", "kind"], ""], "furniture"]],
        paint: {
          "text-color": "#000000",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });
    }
    const labelId = `indoor-label-${layerName}`;
    if (!map.getLayer(labelId)) {
      map.addLayer({
        id: labelId,
        type: "symbol",
        source: "indoor-overlay",
        "source-layer": layerName,
        minzoom: 13,
        layout: {
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-size": 16,
          "text-offset": [0, 1.2],
          "text-anchor": "bottom",
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": false,
        },
        filter: [
          "all",
          ["!=", ["coalesce", ["get", "kind"], ""], "furniture"],
          ["!=", ["coalesce", ["get", "kind"], ""], "door"],
        ],
        paint: {
          "text-color": "#1e3a8a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      });
    }
  });
};
