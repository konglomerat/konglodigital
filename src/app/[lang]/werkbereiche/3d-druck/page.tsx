// src/app/[lang]/werkbereiche/3d-druck/page.tsx — Detailseite des Werkbereichs
// 3D Druck. Sie sammelt die bestehenden Drucker-Werkzeuge, die bisher nur über
// das mobile Menü erreichbar waren, als Navigationskacheln an einem Ort.
import Link from "next/link";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import Divider from "@/components/knglmrt/Divider";
import Badge from "@/components/knglmrt/Badge";
import { findWerkbereich } from "@/lib/werkbereiche";
import PageTitle from "../../components/PageTitle";
import WerkbereichSideNav from "../WerkbereichSideNav";

const WERKBEREICH = findWerkbereich("3d-druck");

// Gleiche Kachel-Sprache wie die Werkbereichs-Übersicht: 1px Kontur, Radius 0,
// weicher Grundton mit vollem Farbton im Hover.
const TILES = [
  {
    href: "/printers",
    title: "Druckerstatus",
    description:
      "Live-Status aller Bambu-Lab-Drucker, laufende Jobs und Druckzeiten.",
    style:
      "bg-primary-soft shadow-[7px_7px_0_var(--primary)] hover:bg-primary focus-visible:bg-primary",
    rotation: "-rotate-1",
  },
  {
    href: "/printers/emptying",
    title: "Drucker entleeren",
    description:
      "Fertige Drucke, die abgeräumt werden müssen — Entleerung hier bestätigen.",
    style:
      "bg-warning-soft shadow-[7px_7px_0_var(--warning)] hover:bg-[var(--knglmrt-yellow-120)] focus-visible:bg-[var(--knglmrt-yellow-120)]",
    rotation: "rotate-1",
  },
  {
    href: "/printers/access-codes",
    title: "Drucker Zugang",
    description:
      "Zugangscodes aus den weitergeleiteten Bambu-Lab-Mails, laufend aktualisiert.",
    style:
      "bg-success-soft shadow-[7px_7px_0_var(--success)] hover:bg-success focus-visible:bg-success",
    rotation: "-rotate-[0.5deg]",
  },
];

export default function DreiDDruckPage() {
  return (
    <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)]">
      <WerkbereichSideNav />
      <div className="flex min-w-0 flex-col">
        <PageTitle
          backLink={{
            href: "/werkbereiche",
            label: "Zur Übersicht",
            icon: faArrowLeft,
          }}
          title="3D Druck"
          subTitle="FDM- und Resin-Drucker, Abrechnung pro Druckjob im Self-Service."
        />

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone="neutral">Halle 1 Erdgeschoss</Badge>
          <Badge tone="wartet">Einweisung erforderlich</Badge>
        </div>

        <section className="mt-6 knglmrt-border-t pt-6 pb-7">
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h2>Self-Service</h2>
            <Badge tone="wartet">nur für Mitglieder</Badge>
          </div>
          <p className="mb-6 max-w-[560px] text-muted-foreground">
            Angemeldete Mitglieder erledigen das hier selbst — ohne Umweg über
            das Team.
          </p>

          <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2">
            {TILES.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className={`group flex min-h-20 flex-col justify-center gap-1 knglmrt-border px-5 py-4 transition-[background-color,color,rotate] duration-300 ease-out hover:rotate-0 hover:text-white focus-visible:rotate-0 focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground motion-reduce:transform-none ${tile.style} ${tile.rotation}`}
              >
                <span className="knglmrt-card-title">{tile.title}</span>
                <span className="text-muted-foreground group-hover:text-white group-focus-visible:text-white">
                  {tile.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
