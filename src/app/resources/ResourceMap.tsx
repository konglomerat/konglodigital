"use client";

import { useEffect, useRef, useState } from "react";
import type { Map } from "mapbox-gl";
import {
  DEFAULT_INDOOR_TILESET_ID,
  MAPBOX_STYLE,
  MAPBOX_SATELLITE_STYLE,
  addIndoorOverlay,
} from "./mapbox-basemap";

type ResourceMapProps = {
  gps: {
    latitude: number;
    longitude: number;
  };
  zoom?: number;
  className?: string;
  tilesetId?: string;
  sourceLayer?: string;
};

export default function ResourceMap({
  gps,
  zoom = 20,
  className = "w-full aspect-[4/3]",
  tilesetId = DEFAULT_INDOOR_TILESET_ID,
  sourceLayer,
}: ResourceMapProps) {
  const [mapboxError, setMapboxError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const indoorLayerRef = useRef<string[] | null>(null);
  const mapStyle = isSatellite ? MAPBOX_SATELLITE_STYLE : MAPBOX_STYLE;

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapboxError("Missing Mapbox token.");
      return;
    }
    if (!mapContainerRef.current) {
      return;
    }

    let active = true;
    const applyOverlay = (map: Map) =>
      addIndoorOverlay({
        map,
        token,
        tilesetId,
        sourceLayer,
        cacheRef: indoorLayerRef,
        onError: setMapboxError,
      });

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      if (!active || !mapContainerRef.current) {
        return;
      }

      if (mapRef.current) {
        mapRef.current.setCenter([gps.longitude, gps.latitude]);
        mapRef.current.setZoom(zoom);
        mapRef.current.setStyle(mapStyle);
        void applyOverlay(mapRef.current);
        return;
      }

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [gps.longitude, gps.latitude],
        zoom,
        attributionControl: false,
      });
      map.on("load", () => {
        void applyOverlay(map);
      });
      map.on("style.load", () => {
        void applyOverlay(map);
      });
      map.scrollZoom.disable();
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      new mapboxgl.Marker({ color: "#2563eb" })
        .setLngLat([gps.longitude, gps.latitude])
        .addTo(map);
      mapRef.current = map;
    };

    initMap();

    return () => {
      active = false;
    };
  }, [gps, mapStyle, tilesetId, zoom, sourceLayer]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (mapboxError) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-50 text-xs text-zinc-500 ${className}`}
      >
        {mapboxError}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} aria-label="Resource location">
      <div ref={mapContainerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() => setIsSatellite((prev) => !prev)}
        className="absolute left-3 top-3 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
      >
        {isSatellite ? "Karte" : "Satellit"}
      </button>
    </div>
  );
}
