// src/app/[lang]/werkbereiche/page.tsx — Übersicht: eine Karte je Werkbereich,
// Kontur 1px Schwarz, Radius 0, Hover im vollen Farbton der Kachel. Muster:
// Brotkrumen → Titel → Lead-Zeile → Kartenraster.
import Link from "next/link";
import type { ReactNode } from "react";

import { VEREINSPROJEKTE, WERKBEREICHE } from "@/lib/werkbereiche";
import PageTitle from "../components/PageTitle";
import WerkbereichMark from "../components/WerkbereichMark";

// Je Kachel der weiche Grundton plus derselbe Farbton voll gesättigt im Hover
// bzw. Fokus - Schrift dort immer weiss.
const TILE_STYLES = [
  "bg-primary-soft shadow-[7px_7px_0_var(--primary)] hover:bg-primary focus-visible:bg-primary",
  "bg-warning-soft shadow-[7px_7px_0_var(--warning)] hover:bg-[var(--knglmrt-yellow-120)] focus-visible:bg-[var(--knglmrt-yellow-120)]",
  "bg-success-soft shadow-[7px_7px_0_var(--success)] hover:bg-success focus-visible:bg-success",
  "bg-secondary shadow-[7px_7px_0_var(--knglmrt-brown-100)] hover:bg-[var(--knglmrt-brown-100)] focus-visible:bg-[var(--knglmrt-brown-100)]",
  "bg-card shadow-[7px_7px_0_var(--info)] hover:bg-info focus-visible:bg-info",
];

const TILE_ROTATIONS = [
  "-rotate-1",
  "rotate-1",
  "-rotate-[0.5deg]",
  "rotate-[0.5deg]",
  "-rotate-[0.25deg]",
];

function TileGrid({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

export default function WerkbereichePage() {
  return (
    <div>
      <PageTitle
        title="Werkbereiche"
        subTitle={`Unsere ${WERKBEREICHE.length} Werkbereiche im Überblick.`}
        className="mb-8"
      />

      <section className="mb-10">
        <TileGrid>
          {WERKBEREICHE.map((werkbereich, index) => (
            <Link
              key={werkbereich.slug}
              href={`/werkbereiche/${werkbereich.slug}`}
              className={`group flex min-h-20 items-center gap-4 border border-foreground px-5 py-4 transition-[background-color,color,rotate] duration-300 ease-out hover:rotate-0 hover:text-white focus-visible:rotate-0 focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground motion-reduce:transform-none ${TILE_STYLES[index % TILE_STYLES.length]} ${TILE_ROTATIONS[index % TILE_ROTATIONS.length]}`}
            >
              <WerkbereichMark
                werkbereich={werkbereich}
                height={40}
                className="group-hover:invert group-focus-visible:invert"
              />
              <span className="knglmrt-card-title">{werkbereich.name}</span>
            </Link>
          ))}
        </TileGrid>
      </section>

      <section aria-labelledby="projekte-heading">
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
              className={`group flex min-h-20 items-center gap-4 border border-foreground px-5 py-4 transition-[background-color,color,rotate] duration-300 ease-out hover:rotate-0 hover:text-white focus-visible:rotate-0 focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground motion-reduce:transform-none ${TILE_STYLES[index % TILE_STYLES.length]} ${TILE_ROTATIONS[index % TILE_ROTATIONS.length]}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 flex-none items-center justify-center border border-foreground font-display text-2xl leading-none group-hover:border-white group-hover:text-white group-focus-visible:border-white group-focus-visible:text-white"
              >
                {projekt.name.charAt(0)}
              </span>
              <span className="knglmrt-card-title">{projekt.name}</span>
            </Link>
          ))}
        </TileGrid>
      </section>
    </div>
  );
}
