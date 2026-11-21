// src/app/[lang]/werkbereiche/page.tsx — Übersicht (Variante 6c aus Claude
// Design): drei Kachelgruppen Werkbereiche, Projekte und, hinter einer
// gezeichneten Linie, Inaktiv. Die Gruppen kommen aus src/lib/werkbereiche.ts
// (`inaktiv`), das Verhalten beim Überfahren steckt in knglmrt-theme.css.
import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";

import Divider from "@/components/knglmrt/Divider";
import Face from "@/components/knglmrt/Face";
import { loadPayloadPage } from "@/lib/payload-cms";
import {
  VEREINSPROJEKTE,
  WERKBEREICHE,
  type Werkbereich,
} from "@/lib/werkbereiche";
import PayloadPageContent, {
  payloadPageMetadata,
} from "../components/PayloadPageContent";

// Jede Kachel hat ihr festes Gesicht. Das Design nennt 3,7,12,17,…; im Repo
// liegen nur zehn der dreißig Faces, deshalb wird aus diesen reihum gewählt.
const FACES = [3, 6, 17, 21, 5, 8, 2, 11, 19, 22];

// Kontrast-Terrazzo der Projekt-Kacheln, reihum — außer wo ein Projekt
// seine eigene Platte hat (Änderei: die mit den braunen Steinen).
const TERRAZZO = [
  "/branding/backgrounds/terrazzo-fein-rosa.svg",
  "/branding/backgrounds/terrazzo-hellgelb.svg",
  "/branding/backgrounds/terrazzo-grob-blau.svg",
];
const PROJEKT_TERRAZZO: Record<string, string> = {
  aenderei: "/branding/backgrounds/terrazzo-grob-grau.svg",
};

// Lange Namen dürfen in der schmalen Kachel an der Wortfuge umbrechen.
const SOFT_HYPHENATED: Record<string, string> = {
  kunststoffschmiede: "Kunststoff­schmiede",
  materialvermittlung: "Material­vermittlung",
};

type Tile = Pick<Werkbereich, "slug" | "name" | "mark" | "markExt">;

const activeWerkbereiche = WERKBEREICHE.filter((entry) => !entry.inaktiv);
const activeProjekte = VEREINSPROJEKTE.filter((entry) => !entry.inaktiv);
const inactiveTiles: Tile[] = [
  ...WERKBEREICHE.filter((entry) => entry.inaktiv),
  ...VEREINSPROJEKTE.filter((entry) => entry.inaktiv),
];

const displayName = (tile: Tile) => SOFT_HYPHENATED[tile.slug] ?? tile.name;
const initial = (name: string) => name.trim().charAt(0).toUpperCase();
const formatCount = (count: number) => String(count).padStart(2, "0");

function GroupHeading({
  id,
  title,
  count,
  quiet = false,
}: Readonly<{ id: string; title: string; count: number; quiet?: boolean }>) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h2
        id={id}
        className={`werk-group-title${quiet ? " werk-group-title-quiet" : ""}`}
      >
        {title}
      </h2>
      <span
        className={`werk-group-count${quiet ? " werk-group-count-quiet" : ""}`}
      >
        {formatCount(count)}
      </span>
    </div>
  );
}

function TileGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid grid-cols-2 gap-2.5 min-[560px]:gap-3.5 min-[900px]:grid-cols-3">
      {children}
    </div>
  );
}

// Werkbereich-Logo oder, ohne eigenes Logo, die Initiale im Quadrat.
function TileMark({ tile }: Readonly<{ tile: Tile }>) {
  if (!tile.mark) {
    return (
      <span aria-hidden="true" className="werk-tile-letter">
        {initial(tile.name)}
      </span>
    );
  }
  const markExt = tile.markExt ?? "svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/branding/werkbereiche/${tile.mark}.${markExt}`}
      alt=""
      className={`werk-tile-logo werkbereich-mark-image${
        tile.mark === "laser" ? " werkbereich-mark-image-fine" : ""
      }${markExt === "png" ? " werk-tile-logo-bitmap" : ""}`}
    />
  );
}

function WerkbereicheGrid() {
  return (
    <div className="flex flex-col gap-11">
      <section aria-labelledby="werkbereiche-heading">
        <GroupHeading
          id="werkbereiche-heading"
          title="Werkbereiche"
          count={activeWerkbereiche.length}
        />
        <TileGrid>
          {activeWerkbereiche.map((werkbereich, index) => (
            <Link
              key={werkbereich.slug}
              href={`/werkbereiche/${werkbereich.slug}`}
              className="werk-tile"
            >
              <TileMark tile={werkbereich} />
              <span className="werk-tile-name">
                {displayName(werkbereich)}
              </span>
              <span aria-hidden="true" className="werk-tile-face">
                <Face number={FACES[index % FACES.length]} size={76} />
              </span>
            </Link>
          ))}
        </TileGrid>
      </section>

      <section aria-labelledby="projekte-heading">
        <GroupHeading
          id="projekte-heading"
          title="Projekte"
          count={activeProjekte.length}
        />
        <TileGrid>
          {activeProjekte.map((projekt, index) => (
            <Link
              key={projekt.slug}
              href={`/werkbereiche/${projekt.slug}`}
              className="projekt-tile"
              style={
                {
                  "--terrazzo": `url("${
                    PROJEKT_TERRAZZO[projekt.slug] ??
                    TERRAZZO[index % TERRAZZO.length]
                  }")`,
                  "--terrazzo-pos": `${(index * 67) % 400}px ${
                    (index * 131) % 400
                  }px`,
                } as CSSProperties
              }
            >
              <span aria-hidden="true" className="projekt-tile-mark">
                {initial(projekt.name)}
              </span>
              <span className="projekt-tile-name">{projekt.name}</span>
            </Link>
          ))}
        </TileGrid>
      </section>

      {inactiveTiles.length > 0 ? (
        <>
          <Divider number={2} height={12} color="#6b6f76" />
          <section aria-labelledby="inaktiv-heading">
            <GroupHeading
              id="inaktiv-heading"
              title="Inaktiv"
              count={inactiveTiles.length}
              quiet
            />
            <TileGrid>
              {inactiveTiles.map((tile) => (
                <Link
                  key={tile.slug}
                  href={`/werkbereiche/${tile.slug}`}
                  className="inaktiv-tile"
                >
                  <TileMark tile={tile} />
                  <span className="werk-tile-name">{displayName(tile)}</span>
                </Link>
              ))}
            </TileGrid>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StaticWerkbereichePage() {
  return (
    <div>
      {/* Die erste Gruppe trägt den sichtbaren Titel. */}
      <h1 className="sr-only">Werkbereiche</h1>
      <WerkbereicheGrid />
    </div>
  );
}

const loadWerkbereichePage = () =>
  loadPayloadPage("werkbereiche", "werkstattbereiche");

export async function generateMetadata(): Promise<Metadata> {
  return payloadPageMetadata(await loadWerkbereichePage(), {
    title: "Werkbereiche",
    description: "Werkbereiche und Projekte des Konglomerat e.V.",
  });
}

export default async function WerkbereichePage() {
  const page = await loadWerkbereichePage();
  if (!page) return <StaticWerkbereichePage />;

  return (
    <div>
      <PayloadPageContent page={page} />
      {/* Die Kacheln bleiben aus der zentralen Werkbereichsliste generiert;
          Einleitung, Hero und ergänzende Inhalte kommen aus Payload. */}
      <div className="mt-8">
        <WerkbereicheGrid />
      </div>
    </div>
  );
}
