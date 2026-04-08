"use client";

import { useEffect, useRef, useState } from "react";
import type { Map } from "mapbox-gl";
import {
  DEFAULT_INDOOR_TILESET_ID,
  MAPBOX_STYLE,
  MAPBOX_SATELLITE_STYLE,
  addIndoorOverlay,
} from "./mapbox-basemap";
import type { ImageGps } from "./resource-form-utils";
import { useI18n } from "@/i18n/client";
import { RESOURCES_NAMESPACE } from "@/i18n/config";

type ResourceMapCrosshairProps = {
  gps?: ImageGps | null;
  onChange: (gps: ImageGps) => void;
  className?: string;
  zoom?: number;
};

const GPS_EPSILON = 1e-6;

const isClose = (a: ImageGps, b: ImageGps) =>
  Math.abs(a.latitude - b.latitude) < GPS_EPSILON &&
  Math.abs(a.longitude - b.longitude) < GPS_EPSILON;

const defaultCenter = {
  latitude: 51.04602573697031,
  longitude: 13.716125054140463,
};

export default function ResourceMapCrosshair({
  gps,
  onChange,
  className = "w-full aspect-[4/3]",
  zoom = 19,
}: ResourceMapCrosshairProps) {
  const { tx } = useI18n(RESOURCES_NAMESPACE);
  const [mapboxError, setMapboxError] = useState<string | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const indoorLayerRef = useRef<string[] | null>(null);
  const lastEmitRef = useRef<ImageGps | null>(null);
  const mapStyle = isSatellite ? MAPBOX_SATELLITE_STYLE : MAPBOX_STYLE;

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setMapboxError(tx("Missing Mapbox token."));
      return;
    }
    if (!mapContainerRef.current) {
      return;
    }

    const applyOverlay = (map: Map) =>
      addIndoorOverlay({
        map,
        token,
        tilesetId: DEFAULT_INDOOR_TILESET_ID,
        cacheRef: indoorLayerRef,
        onError: setMapboxError,
      });

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      mapboxgl.accessToken = token;
      if (!mapContainerRef.current) {
        return;
      }

      const startLng = gps?.longitude ?? defaultCenter.longitude;
      const startLat = gps?.latitude ?? defaultCenter.latitude;

      if (mapRef.current) {
        const current = mapRef.current.getCenter();
        const target = { latitude: startLat, longitude: startLng };
        const currentGps = {
          latitude: current.lat,
          longitude: current.lng,
        };
        if (!isClose(currentGps, target)) {
          mapRef.current.setCenter([startLng, startLat]);
        }
        if (mapRef.current.getZoom() !== zoom) {
          mapRef.current.setZoom(zoom);
        }
        return;
      }

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: [startLng, startLat],
        zoom,
        attributionControl: false,
      });

      map.on("load", () => {
        map.resize();
        void applyOverlay(map);
        const center = map.getCenter();
        const nextGps = { latitude: center.lat, longitude: center.lng };
        lastEmitRef.current = nextGps;
        onChange(nextGps);
      });
      map.on("style.load", () => void applyOverlay(map));
      map.scrollZoom.disable();
      map.dragPan.enable();
      map.touchZoomRotate.enable();
      map.touchZoomRotate.disableRotation();
      map.addControl(new mapboxgl.NavigationControl(), "bottom-left");

      map.on("moveend", () => {
        const center = map.getCenter();
        const nextGps = { latitude: center.lat, longitude: center.lng };
        if (lastEmitRef.current && isClose(lastEmitRef.current, nextGps)) {
          return;
        }
        lastEmitRef.current = nextGps;
        onChange(nextGps);
      });

      mapRef.current = map;
    };

    void initMap();
  }, [gps, mapStyle, onChange, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    map.setStyle(mapStyle);
  }, [mapStyle]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

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
    <div
      className={`relative ${className}`}
      aria-label={tx("Location selector")}
    >
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_2px_rgba(37,99,235,0.8)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 shadow" />
      {/*<button
        type="button"
        onClick={() => setIsSatellite((prev) => !prev)}
        className="absolute left-3 top-3 rounded-full border border-zinc-900/80 bg-zinc-900/90 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-900"
      >
        {isSatellite ? "Karte" : "Satellit"}
      </button> */}
    </div>
  );
}
