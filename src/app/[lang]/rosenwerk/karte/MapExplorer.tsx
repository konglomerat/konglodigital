"use client";
/* eslint-disable @next/next/no-img-element */
import {
  laserWorkshopId,
  type WorkshopView,
} from "@/lib/rosenwerk/laser-workshop";
import {
  isDockWorkshop,
  metalWorkshopId,
  type DockView,
} from "@/lib/rosenwerk/dock-workshops";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";
import {
  type MapItem,
  pointInPolygon,
  floorLabel,
} from "@/lib/rosenwerk/geometry";
import context from "@/lib/rosenwerk/site.json";
import {
  walkingRoutes,
  walkingRoute,
  walkSummary,
  walkDirections,
} from "@/lib/rosenwerk/arrival";
import type { SceneState } from "./Scene";
import styles from "./map.module.css";
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => (
    <div className={styles.sceneStatus}>Die 3D-Karte wird geladen …</div>
  ),
});
const references = [
  {
    name: "Google Earth",
    url: "https://earth.google.com/web/search/Rosenwerk+Dresden",
  },
  {
    name: "Apple Karten",
    url: "https://maps.apple.com/place?place-id=IA01024A2363CF5EA",
  },
  {
    name: "Google Maps",
    url: "https://www.google.com/maps/search/Rosenwerk+Dresden/",
  },
  { name: "Dresden Geo", url: "https://stadtplan.dresden.de/?q=Jagdweg%201" },
];
export default function MapExplorer({
  items,
  unavailable,
}: {
  items: MapItem[];
  unavailable: boolean;
}) {
  const { locale } = useI18n();
  const [state, setState] = useState<SceneState>({
    mode: "site",
    routeId: walkingRoutes[0].id,
    stationOverview: false,
    level: 0,
    top: false,
    workshopView: "from-screen-printing",
    dockView: "from-dock",
    objects: false,
    labels: true,
    neighbors: true,
    selected: null,
    focus: null,
    revision: 0,
  });
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("places"),
    [share, setShare] = useState("");
  const places = useMemo(
    () => items.filter((i) => i.type === "place"),
    [items],
  );
  const route = walkingRoute(state.routeId);
  const selected = items.find((i) => i.id === state.selected);
  const access = context.accessPoints.find((p) => p.id === state.selected);
  const building = context.buildings.find((b) => b.id === state.selected);
  const select = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      setState((s) => ({
        ...s,
        selected: id,
        stationOverview: false,
        workshopView: "from-screen-printing",
        dockView: "from-dock",
        level: item?.level ?? 0,
        focus: id,
        mode:
          item && id !== context.containers[0].resourceId ? "inside" : "site",
        objects: item && item.type !== "place" ? true : s.objects,
        revision: s.revision + 1,
      }));
      const url = new URL(window.location.href);
      url.searchParams.delete("anreise");
      url.searchParams.set("ort", id);
      url.searchParams.delete("umgebung");
      url.searchParams.delete("geschoss");
      window.history.replaceState(null, "", url);
      setShare("");
    },
    [items],
  );
  const showWalk = useCallback((id: string) => {
    const route = walkingRoute(id);
    setState((s) => ({
      ...s,
      mode: "arrival",
      routeId: route.id,
      stationOverview: false,
      level: 0,
      selected: null,
      focus: null,
      revision: s.revision + 1,
    }));
    const url = new URL(window.location.href);
    url.searchParams.delete("ort");
    url.searchParams.delete("geschoss");
    url.searchParams.set("anreise", route.id);
    url.searchParams.delete("umgebung");
    window.history.replaceState(null, "", url);
    setShare("");
  }, []);
  const changeMode = useCallback(
    (mode: "site" | "inside", level = 0, stationOverview = false) => {
      setState((s) => ({
        ...s,
        mode,
        stationOverview,
        level,
        selected: null,
        focus: null,
        revision: s.revision + 1,
      }));
      const url = new URL(window.location.href);
      url.searchParams.delete("ort");
      url.searchParams.delete("anreise");
      if (stationOverview) url.searchParams.set("umgebung", "1");
      else url.searchParams.delete("umgebung");
      if (mode === "inside") url.searchParams.set("geschoss", String(level));
      else url.searchParams.delete("geschoss");
      window.history.replaceState(null, "", url);
    },
    [],
  );
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("ort");
      if (
        id &&
        (items.some((i) => i.id === id) ||
          context.buildings.some((i) => i.id === id) ||
          context.accessPoints.some((p) => p.id === id) ||
          id === context.containers[0].resourceId)
      )
        select(id);
      else if (params.has("anreise")) showWalk(params.get("anreise") ?? "");
      else if (params.get("umgebung") === "1") changeMode("site", 0, true);
      else if (params.has("geschoss")) {
        const value = Number(params.get("geschoss"));
        if (
          [
            context.basement.level,
            0,
            ...context.upperFloors.map((f) => f.level),
          ].includes(value)
        ) {
          setState((s) => ({
            ...s,
            mode: "inside",
            stationOverview: false,
            level: value,
            selected: null,
            focus: null,
            revision: s.revision + 1,
          }));
        }
      } else changeMode("site");
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [items, select, showWalk, changeMode]);
  const visible = items.filter(
    (i) =>
      (filter === "all" || i.type === "place") &&
      i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const visibleAccess = context.accessPoints.filter((p) =>
    (p.name + " " + p.side + " " + p.description)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const contained = building
    ? places.filter((p) => pointInPolygon(p.point, building.coordinates))
    : [];
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShare("Link kopiert");
    } catch {
      setShare("Bitte kopiere die Adresse aus der Browserleiste.");
    }
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>KONGLOMERAT · JAGDWEG 1–3 · DRESDEN</p>
          <h1>
            Rosenwerk<span> entdecken.</span>
          </h1>
          <p className={styles.intro}>
            Werkstätten, Innenhof und die Container der Kunststoffschmiede.
          </p>
        </div>
        <Link
          className={styles.inventoryLink}
          href={localizePathname("/resources", locale)}
        >
          Zum Inventar ↗
        </Link>
      </header>
      <div className={styles.explorer}>
        <aside
          className={styles.sidebar}
          aria-label={
            state.mode === "arrival"
              ? "Fußweg zum Rosenwerk"
              : "Orte auf dem Gelände"
          }
        >
          {state.mode === "arrival" ? (
            <div className={styles.walkPanel} aria-live="polite">
              <span className={styles.eyebrow}>{route.mode}</span>
              <h2>{route.name}</h2>
              <p className={styles.walkTime}>{walkSummary(route)}</p>
              <p>Zum Haupteingang am Jagdweg 1–3</p>
              <ol>
                {walkDirections(route.id).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <small>
                Geschätzte Gehzeit bei normalem Tempo. Der Weg zum Haupteingang
                enthält Stufen.
              </small>
              <button className={styles.share} onClick={copyLink}>
                Fußweg teilen ↗
              </button>
              {share && <small role="status">{share}</small>}
            </div>
          ) : (
            <>
              <div className={styles.sideTop}>
                <span className={styles.eyebrow}>DEIN WEG INS ROSENWERK</span>
                <h2>Was suchst du?</h2>
                <label className={styles.search}>
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Raum oder Gegenstand suchen"
                    placeholder="Werkstatt, Raum, Maschine …"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      if (e.target.value) setFilter("all");
                    }}
                  />
                  {query && (
                    <button
                      aria-label="Suche löschen"
                      onClick={() => setQuery("")}
                    >
                      ×
                    </button>
                  )}
                </label>
                <div className={styles.filters}>
                  <button
                    aria-pressed={filter === "places"}
                    onClick={() => setFilter("places")}
                  >
                    Orte{" "}
                    <span>{places.length + context.accessPoints.length}</span>
                  </button>
                  <button
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    Gesamtes Inventar
                  </button>
                </div>
              </div>
              {unavailable && (
                <p className={styles.notice} role="status">
                  Das Inventar ist gerade nicht erreichbar. Das Geländemodell
                  bleibt sichtbar.
                </p>
              )}
              <div className={styles.results}>
                {visibleAccess.map((p) => (
                  <button
                    key={p.id}
                    className={styles.result}
                    aria-pressed={state.selected === p.id}
                    onClick={() => select(p.id)}
                  >
                    <span className={styles.number} aria-hidden="true">
                      ↳
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.side}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
                {!visible.length && !visibleAccess.length && (
                  <p className={styles.notice}>
                    {query
                      ? "Kein passender Ort gefunden."
                      : "Noch keine verorteten Einträge vorhanden."}
                  </p>
                )}
                {visible.slice(0, 100).map((item, index) => (
                  <button
                    className={styles.result}
                    key={item.id}
                    aria-pressed={state.selected === item.id}
                    onClick={() => select(item.id)}
                  >
                    <span className={styles.number}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {item.type === "place"
                          ? item.outdoor
                            ? "Außenbereich"
                            : item.features.some(
                                  (f) => f.geometryType === "Polygon",
                                )
                              ? floorLabel(item.level)
                              : "Ort · Umriss noch offen"
                          : "Inventargegenstand"}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
                {visible.length > 100 && (
                  <p className={styles.notice}>
                    {visible.length} Treffer – grenze die Suche ein, um weitere
                    Gegenstände zu finden.
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
        <section className={styles.viewport} aria-label="Geländekarte">
          <Scene
            items={items}
            state={state}
            onSelect={(id) =>
              walkingRoutes.some((route) => route.id === id)
                ? showWalk(id)
                : select(id)
            }
          />
          <div className={styles.toolbar} aria-label="Kartenansicht">
            {(
              [
                ["site", "Gelände"],
                ["inside", "Innenräume"],
                ["arrival", "Anreise"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                aria-pressed={state.mode === mode}
                onClick={() =>
                  mode === "arrival"
                    ? showWalk(state.routeId)
                    : changeMode(mode)
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.viewControls}>
            <button
              title="Draufsicht / räumliche Ansicht"
              aria-label="Draufsicht umschalten"
              aria-pressed={state.top}
              onClick={() =>
                setState((s) => ({
                  ...s,
                  top: !s.top,
                  revision: s.revision + 1,
                }))
              }
            >
              {state.top ? "3D" : "2D"}
            </button>
            <button
              title="Gesamte Ansicht"
              aria-label="Ansicht zurücksetzen"
              onClick={() =>
                state.mode === "arrival"
                  ? showWalk(state.routeId)
                  : changeMode(state.mode, state.level, state.stationOverview)
              }
            >
              ⌖
            </button>
            <button
              title="Beschriftungen"
              aria-label="Beschriftungen umschalten"
              aria-pressed={state.labels}
              onClick={() => setState((s) => ({ ...s, labels: !s.labels }))}
            >
              Aa
            </button>
          </div>
          {state.mode !== "inside" && (
            <div className={styles.indoorTools}>
              {state.mode === "arrival" ? (
                <label>
                  Ab{" "}
                  <select
                    aria-label="Starthaltestelle und Bahnsteig"
                    value={route.id}
                    onChange={(e) => showWalk(e.target.value)}
                  >
                    {walkingRoutes.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.mode === "Straßenbahn" ? "Tram" : "S-Bahn"} ·{" "}
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Ausschnitt
                  <select
                    aria-label="Kartenausschnitt"
                    value={state.stationOverview ? "stations" : "site"}
                    onChange={(e) =>
                      changeMode("site", 0, e.target.value === "stations")
                    }
                  >
                    <option value="site">Rosenwerk</option>
                    <option value="stations">Bis zu den Haltestellen</option>
                  </select>
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={state.neighbors}
                  onChange={(e) =>
                    setState((s) => ({ ...s, neighbors: e.target.checked }))
                  }
                />{" "}
                Nachbargebäude
              </label>
            </div>
          )}
          {state.mode === "inside" && (
            <div className={styles.indoorTools}>
              <label>
                Ansicht
                <select
                  aria-label="Geschoss wählen"
                  value={state.level}
                  onChange={(e) => changeMode("inside", Number(e.target.value))}
                >
                  <option value={-1}>Keller</option>
                  <option value={0}>Erdgeschoss</option>
                  {context.upperFloors.map(({ level }) => (
                    <option key={level} value={level}>
                      {level}. Obergeschoss
                    </option>
                  ))}
                </select>
              </label>
              {state.focus === laserWorkshopId && !state.top && (
                <label>
                  Blickrichtung
                  <select
                    aria-label="Blickrichtung in der Laserwerkstatt"
                    value={state.workshopView}
                    onChange={(e) => {
                      const workshopView = e.target.value as WorkshopView;
                      setState((s) => ({
                        ...s,
                        workshopView,
                        revision: s.revision + 1,
                      }));
                    }}
                  >
                    <option value="from-screen-printing">Vom Siebdruck</option>
                    <option value="printer-racks">Zur RON-Tür</option>
                  </select>
                </label>
              )}
              {isDockWorkshop(state.focus) && !state.top && (
                <label>
                  Blickrichtung
                  <select
                    aria-label={
                      state.focus === metalWorkshopId
                        ? "Blickrichtung in der Metallwerkstatt"
                        : "Blickrichtung in der Holzwerkstatt"
                    }
                    value={state.dockView}
                    onChange={(e) => {
                      const dockView = e.target.value as DockView;
                      setState((s) => ({
                        ...s,
                        dockView,
                        revision: s.revision + 1,
                      }));
                    }}
                  >
                    <option value="from-dock">Vom Ladetor</option>
                    <option value="towards-dock">Zur Laderampe</option>
                    {state.focus === metalWorkshopId ? (
                      <option value="bicycle-area">Zum Fahrradbereich</option>
                    ) : (
                      <option value="cnc">Zur CNC-Fräse</option>
                    )}
                  </select>
                </label>
              )}
              {state.level <= 1 ? (
                <label>
                  <input
                    type="checkbox"
                    checked={state.objects}
                    onChange={(e) =>
                      setState((s) => ({ ...s, objects: e.target.checked }))
                    }
                  />{" "}
                  Weitere Inventarmarker
                </label>
              ) : (
                <small>Geschossumriss · Raumaufteilung offen</small>
              )}
            </div>
          )}
          {(selected || building || access) && (
            <div
              className={
                access
                  ? `${styles.detail} ${styles.accessDetail}`
                  : styles.detail
              }
              aria-live="polite"
            >
              <button
                className={styles.close}
                aria-label="Details schließen"
                onClick={() => {
                  setState((s) => ({ ...s, selected: null }));
                  const u = new URL(window.location.href);
                  u.searchParams.delete("ort");
                  if (state.mode === "inside")
                    u.searchParams.set("geschoss", String(state.level));
                  window.history.replaceState(null, "", u);
                }}
              >
                ×
              </button>
              <span className={styles.eyebrow}>
                {selected
                  ? selected.outdoor
                    ? "AUSSENBEREICH"
                    : floorLabel(selected.level).toLocaleUpperCase("de")
                  : access
                    ? "ZUGANG"
                    : "GEBÄUDE"}
              </span>
              <h2>{selected?.name ?? access?.name ?? building?.name}</h2>
              {access && (
                <>
                  <p className={styles.accessCopy}>
                    <strong>{access.side}</strong>
                    <br />
                    {access.description}
                  </p>
                  <details className={styles.accessDirections} key={access.id}>
                    <summary>{access.side}</summary>
                    <p>{access.description}</p>
                  </details>
                </>
              )}
              {selected?.image && /^https?:\/\//.test(selected.image) && (
                <img
                  src={selected.image}
                  alt={selected.name}
                  loading="lazy"
                  className={styles.preview}
                />
              )}
              {selected && (
                <>
                  <p>
                    {selected.features.some((f) => f.geometryType === "Polygon")
                      ? "Umriss aus dem Inventar."
                      : "Position aus dem Inventar. Der Umriss ist noch offen."}
                  </p>
                  <Link
                    className={styles.action}
                    href={localizePathname(
                      `/resources/${encodeURIComponent(selected.slug ?? selected.id)}`,
                      locale,
                    )}
                  >
                    Details im Inventar ↗
                  </Link>
                </>
              )}
              {building && (
                <>
                  <p>
                    {building.heightEstimated
                      ? "Der Hochbau reicht bis ins 3. Obergeschoss. Seine Dachfläche liegt etwa 19–20 m über dem Hof. Der Flügel am Jagdweg hat zwei volle Fensterreihen über den Sockelfenstern."
                      : "Vereinfachter Baukörper aus Kartendaten."}
                  </p>
                  {contained.length > 0 ? (
                    <>
                      <button
                        className={styles.action}
                        onClick={() => changeMode("inside")}
                      >
                        Gebäude öffnen ↓
                      </button>
                      <div className={styles.roomLinks}>
                        {contained.map((p) => (
                          <button key={p.id} onClick={() => select(p.id)}>
                            {p.name} ↗
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>Hier sind noch keine Innenräume zugeordnet.</p>
                  )}
                </>
              )}

              <button className={styles.share} onClick={copyLink}>
                Ort teilen ↗
              </button>
              {share && <small role="status">{share}</small>}
            </div>
          )}
          <div className={styles.mapFooter}>
            <span>
              <i />{" "}
              {state.mode === "inside"
                ? floorLabel(state.level)
                : state.mode === "arrival"
                  ? walkSummary(route)
                  : "Rosenwerk · Gelände"}
            </span>
            <span>Ziehen: drehen · Scrollen: zoomen</span>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <p>
          Dachhöhen aus Geländedaten · Deckenhöhen und Rampenmaße angenähert ·
          Raumumrisse aus dem Inventar.
        </p>
        <div>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap-Mitwirkende · ODbL
          </a>
          <a
            href="https://www.govdata.de/dl-de/by-2-0"
            target="_blank"
            rel="noreferrer"
          >
            GeoSN · dl-de/by-2-0
          </a>
          <span>Referenzen</span>
          {references.map((r) => (
            <a key={r.name} href={r.url} target="_blank" rel="noreferrer">
              {r.name} ↗
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
