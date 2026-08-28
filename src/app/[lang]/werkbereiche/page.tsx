// src/app/[lang]/werkbereiche/page.tsx — Übersicht: freistehende Kacheln mit
// zarter Rosa-Kontur, dazwischen Luft. Die Fläche bleibt Papier; Farbe kommt
// erst beim Überfahren, dann als Terrazzo — je Kachel eine andere Variante.
// Muster: Titel → Sektionskopf mit Zähler und Wellenlinie → Kartenraster.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { VEREINSPROJEKTE, WERKBEREICHE } from "@/lib/werkbereiche";
import PageTitle from "../components/PageTitle";
import WerkbereichMark from "../components/WerkbereichMark";

// Die Terrazzo-Platten der Bibliothek — alle im hellen Ende der Palette, damit
// die Schrift schwarz bleiben kann. Beim Überfahren wird eine davon sichtbar.
const TERRAZZO = [
  "/branding/backgrounds/terrazzo-fein-rosa.svg",
  "/branding/backgrounds/terrazzo-grob-blau.svg",
  "/branding/backgrounds/terrazzo-hellgelb.svg",
  "/branding/backgrounds/terrazzo-grob-grau.svg",
  "/branding/backgrounds/terrazzo-grob-rosa.svg",
];

// Ausschnitt und Zoom je Kachel verschieben, sonst wiederholt sich der
// Steinschnitt sichtbar über das Raster hinweg.
const TERRAZZO_POSITIONS = [
  "0 0",
  "-120px -60px",
  "-40px -180px",
  "-210px -30px",
  "-90px -140px",
  "-170px -200px",
  "-260px -110px",
];
const TERRAZZO_SIZES = ["320px 320px", "260px 260px", "400px 400px"];

function terrazzoStyle(index: number): CSSProperties {
  return {
    "--terrazzo": `url("${TERRAZZO[index % TERRAZZO.length]}")`,
    "--terrazzo-pos": TERRAZZO_POSITIONS[index % TERRAZZO_POSITIONS.length],
    "--terrazzo-size": TERRAZZO_SIZES[index % TERRAZZO_SIZES.length],
  } as CSSProperties;
}

function TileGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

// Wellenlinie (Lines_03) als Trenner zwischen den beiden Rastern. Gestreckt
// geht nicht — die Datei hat keine viewBox und behielte ihr Seitenverhältnis;
// gekachelt steuert die Höhe die Wellenlänge, deshalb inline. Die Abstände
// sitzen auf dem Wrapper: .knglmrt-line setzt margin: 0 und ist ungelayert,
// schlägt also jede Tailwind-Margin auf dem span selbst.
function WaveRule({ className }: Readonly<{ className?: string }>) {
  return (
    <div aria-hidden="true" className={className}>
      <span
        style={{ height: 14 }}
        className="knglmrt-line knglmrt-line-3 knglmrt-line-repeat text-primary"
      />
    </div>
  );
}

// Kachel: 2px Kontur in Papier-Rosa, beim Überfahren zieht die Kontur auf
// pink-60 nach, während der Terrazzo darunter aufblendet.
const tileClassName =
  "knglmrt-terrazzo-hover flex min-h-20 items-center gap-4 border-2 border-[var(--primary-hairline)] bg-card px-5 py-3 transition-colors duration-300 ease-out hover:border-[var(--knglmrt-pink-60)] focus-visible:border-[var(--knglmrt-pink-60)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export default function WerkbereichePage() {
  return (
    <div>
      <PageTitle title="Werkbereiche" className="mb-8" />

      <section aria-label="Werkbereiche" className="mb-10">
        <TileGrid>
          {WERKBEREICHE.map((werkbereich, index) => (
            <Link
              key={werkbereich.slug}
              href={`/werkbereiche/${werkbereich.slug}`}
              className={tileClassName}
              style={terrazzoStyle(index)}
            >
              <WerkbereichMark
                werkbereich={werkbereich}
                height={40}
                className="self-center"
              />
              <span className="knglmrt-card-title min-w-0">
                {werkbereich.name}
              </span>
            </Link>
          ))}
        </TileGrid>
      </section>

      <section aria-labelledby="projekte-heading">
        <WaveRule className="mb-6" />
        <div className="mb-6 flex items-baseline gap-3">
          <h2 id="projekte-heading">Projekte</h2>
          <span className="knglmrt-num text-muted-foreground">
            {VEREINSPROJEKTE.length}
          </span>
        </div>
        <TileGrid>
          {VEREINSPROJEKTE.map((projekt, index) => (
            <Link
              key={projekt.slug}
              href={`/werkbereiche/${projekt.slug}`}
              className={tileClassName}
              // Versetzt gestartet, damit Projekte nicht dieselbe Reihenfolge
              // der Platten zeigen wie die Werkbereiche darüber.
              style={terrazzoStyle(index + 2)}
            >
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center border border-foreground font-display text-2xl leading-none"
              >
                {projekt.name.charAt(0)}
              </span>
              <span className="knglmrt-card-title min-w-0">{projekt.name}</span>
            </Link>
          ))}
        </TileGrid>
      </section>
    </div>
  );
}
