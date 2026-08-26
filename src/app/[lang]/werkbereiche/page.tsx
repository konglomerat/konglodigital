// src/app/[lang]/werkbereiche/page.tsx — Übersicht: eine Karte je Werkbereich,
// Kontur 1px Schwarz, Radius 0, Hover paper-pink. Muster aus dem Prototyp:
// Brotkrumen → Titel → Lead-Zeile → Kartenraster.
import Link from "next/link";

import Breadcrumbs from "@/components/knglmrt/Breadcrumbs";
import { WERKBEREICHE } from "@/lib/werkbereiche";
import WerkbereichMark from "../components/WerkbereichMark";

export default function WerkbereichePage() {
  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Start", href: "/" }, { label: "Werkbereiche" }]}
      />
      <h1 className="mb-2.5">Werkbereiche</h1>
      <p className="knglmrt-lead mb-6 max-w-[620px]">
        {WERKBEREICHE.length} Werkstätten, alle nach dem gleichen Schema
        aufgebaut: Einleitung, Projekte &amp; News, Ressourcen, Einweisungen,
        Fragen.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {WERKBEREICHE.map((werkbereich) => (
          <Link
            key={werkbereich.slug}
            href={`/werkbereiche/${werkbereich.slug}`}
            className="flex min-h-[9.5rem] flex-col gap-2.5 border border-foreground bg-card p-[18px] transition hover:bg-primary-soft"
          >
            <WerkbereichMark werkbereich={werkbereich} height={40} />
            <div className="knglmrt-card-title">{werkbereich.name}</div>
            <div className="text-muted-foreground">
              {werkbereich.description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
