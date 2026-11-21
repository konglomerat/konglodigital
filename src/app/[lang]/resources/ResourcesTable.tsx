"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { ResourcePayload } from "@/lib/campai-resources";
import type { ResourceRentalState } from "@/lib/campai-resource-rentals";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { localizePathname, type Locale } from "@/i18n/config";
import Badge from "@/components/knglmrt/Badge";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/knglmrt/Table";
import { RESOURCE_TYPES } from "./resource-types";
import {
  getPointFeatures,
  getPolygonFeatures,
  type MapPolygonPoint,
} from "./map-features";

type Resource = ResourcePayload;

type ResourcesTableProps = {
  resources: Resource[];
  /** Räume und Möbel mit Umriss — daraus ergibt sich der Standort. */
  placeResources: Resource[];
  locale: Locale;
  tx: (key: string, sourceLocale?: Locale) => string;
  highlight: (text: string) => ReactNode;
  onNavigate: () => void;
};

const MAX_VISIBLE_TAGS = 3;
const RENTAL_STATUS_BATCH_SIZE = 200;

type RentalStateEntry = ResourceRentalState | { state: "error" };

// Lädt den Ausleihstatus nur für Zeilen, die noch keinen haben — „Mehr laden"
// fragt also nur die neuen ab.
const useRentalStates = (resourceIds: string[]) => {
  const [states, setStates] = useState<Record<string, RentalStateEntry>>({});
  const requestedRef = useRef(new Set<string>());

  useEffect(() => {
    const missing = resourceIds.filter((id) => !requestedRef.current.has(id));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((id) => requestedRef.current.add(id));

    for (
      let index = 0;
      index < missing.length;
      index += RENTAL_STATUS_BATCH_SIZE
    ) {
      const batch = missing.slice(index, index + RENTAL_STATUS_BATCH_SIZE);
      void (async () => {
        try {
          const response = await fetch("/api/campai/resources/rental-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
          const payload = (await response.json()) as {
            states?: Record<string, ResourceRentalState>;
          };
          if (!response.ok || !payload.states) {
            throw new Error("rental status unavailable");
          }
          setStates((previous) => ({ ...previous, ...payload.states }));
        } catch {
          setStates((previous) => ({
            ...previous,
            ...Object.fromEntries(
              batch.map((id) => [id, { state: "error" as const }]),
            ),
          }));
        }
      })();
    }
  }, [resourceIds]);

  return states;
};

// Strahl-Test: liegt der Punkt im Umriss?
const isPointInPolygon = (
  [x, y]: MapPolygonPoint,
  polygon: MapPolygonPoint[],
) => {
  let inside = false;
  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i, i += 1
  ) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const polygonArea = (polygon: MapPolygonPoint[]) =>
  Math.abs(
    polygon.reduce((sum, [x1, y1], index) => {
      const [x2, y2] = polygon[(index + 1) % polygon.length];
      return sum + x1 * y2 - x2 * y1;
    }, 0) / 2,
  );

type Place = {
  id: string;
  name: string;
  polygons: MapPolygonPoint[][];
  area: number;
};

// Kleinster Umriss zuerst: „Regal 3" ist genauer als „Werkstatt".
const toPlaces = (resources: Resource[]): Place[] =>
  resources
    .map((resource) => {
      const polygons = getPolygonFeatures(resource.mapFeatures ?? [])
        .map((feature) => feature.coordinates)
        .filter((polygon) => polygon.length >= 3);
      return {
        id: resource.id,
        name: resource.name,
        polygons,
        area: polygons.reduce(
          (sum, polygon) => sum + polygonArea(polygon),
          0,
        ),
      };
    })
    .filter((place) => place.polygons.length > 0)
    .sort((left, right) => left.area - right.area);

// „Werkstatt › Regal 3" — höchstens zwei Ebenen.
const getLocationLabel = (resource: Resource, places: Place[]) => {
  const point = getPointFeatures(resource.mapFeatures ?? [])[0]?.point;
  if (!point) {
    return null;
  }
  const containing = places.filter(
    (place) =>
      place.id !== resource.id &&
      place.polygons.some((polygon) => isPointInPolygon(point, polygon)),
  );
  if (containing.length === 0) {
    return null;
  }
  return containing
    .slice(0, 2)
    .reverse()
    .map((place) => place.name)
    .join(" › ");
};

export default function ResourcesTable({
  resources,
  placeResources,
  locale,
  tx,
  highlight,
  onNavigate,
}: ResourcesTableProps) {
  const resourceIds = useMemo(
    () => resources.map((resource) => resource.id),
    [resources],
  );
  const rentalStates = useRentalStates(resourceIds);
  const places = useMemo(() => toPlaces(placeResources), [placeResources]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [locale],
  );
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
      }),
    [locale],
  );
  const formatDate = (value: string | null | undefined, short = false) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return (short ? dayFormatter : dateFormatter).format(date);
  };

  const dash = <span className="text-muted-foreground">—</span>;

  const renderRentalState = (resourceId: string) => {
    const entry = rentalStates[resourceId];
    if (!entry) {
      return <span className="text-muted-foreground">…</span>;
    }
    switch (entry.state) {
      case "free":
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge tone="gebucht">{tx("Frei", "de")}</Badge>
            {entry.nextFrom ? (
              <span className="knglmrt-num text-muted-foreground">
                {tx("vergeben ab", "de")} {formatDate(entry.nextFrom, true)}
              </span>
            ) : null}
          </span>
        );
      case "out":
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge tone="wartet">{tx("Ausgeliehen", "de")}</Badge>
            <span className="knglmrt-num text-muted-foreground">
              {tx("bis", "de")} {formatDate(entry.until, true)}
            </span>
          </span>
        );
      case "blocked":
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge tone="offen">{tx("Gesperrt", "de")}</Badge>
            <span className="knglmrt-num text-muted-foreground">
              {tx("bis", "de")} {formatDate(entry.until, true)}
            </span>
          </span>
        );
      case "none":
        return (
          <span className="text-muted-foreground">
            {tx("nicht verbunden", "de")}
          </span>
        );
      default:
        return (
          <span className="text-muted-foreground">
            {tx("unbekannt", "de")}
          </span>
        );
    }
  };

  return (
    <Table>
      <THead>
        <Th>{tx("Name", "de")}</Th>
        <Th>{tx("Typ", "de")}</Th>
        <Th>{tx("Standort", "de")}</Th>
        <Th>{tx("Ausleihstatus", "de")}</Th>
        <Th>{tx("Tags", "de")}</Th>
        <Th className="text-right">{tx("Geändert", "de")}</Th>
      </THead>
      <TBody>
        {resources.map((resource) => {
          const typeKey = resource.type?.trim().toLowerCase() ?? "";
          const typeConfig =
            RESOURCE_TYPES[typeKey as keyof typeof RESOURCE_TYPES];
          const tags = resource.tags ?? [];
          const location = getLocationLabel(resource, places);
          const updated = formatDate(resource.updatedAt);

          return (
            <Tr key={resource.id} interactive>
              <Td className="min-w-[240px] font-semibold">
                <Link
                  href={localizePathname(buildResourcePath(resource), locale)}
                  onClick={onNavigate}
                  className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {highlight(resource.name)}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">
                {typeConfig ? (
                  <span className="inline-flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={typeConfig.icon}
                      className={`h-4 w-4 ${typeConfig.color}`}
                    />
                    {typeConfig.label}
                  </span>
                ) : (
                  resource.type || dash
                )}
              </Td>
              <Td className="min-w-[160px]">{location ?? dash}</Td>
              <Td className="whitespace-nowrap">
                {renderRentalState(resource.id)}
              </Td>
              <Td className="min-w-[180px]">
                {tags.length === 0 ? (
                  dash
                ) : (
                  <span className="text-muted-foreground">
                    {tags.slice(0, MAX_VISIBLE_TAGS).join(", ")}
                    {tags.length > MAX_VISIBLE_TAGS
                      ? ` +${tags.length - MAX_VISIBLE_TAGS}`
                      : ""}
                  </span>
                )}
              </Td>
              <Td className="knglmrt-num whitespace-nowrap text-right">
                {updated ?? dash}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}

export const ResourcesTableSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <div className="flex animate-pulse flex-col knglmrt-border bg-card">
    <div className="h-10 knglmrt-border-b" />
    {Array.from({ length: rows }).map((_, index) => (
      <div
        key={index}
        className="flex items-center gap-6 border-t border-border px-3.5 py-3 first:border-t-0"
      >
        <div className="h-4 w-1/3 bg-muted" />
        <div className="h-4 w-20 bg-muted" />
        <div className="h-4 w-24 bg-muted" />
        <div className="ml-auto h-4 w-20 bg-muted" />
      </div>
    ))}
  </div>
);
