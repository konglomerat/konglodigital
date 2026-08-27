// src/app/[lang]/werkbereiche/[slug]/page.tsx — Platzhalter für die spätere
// CMS-basierte Detailseite.
import { notFound } from "next/navigation";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

import { findVereinsprojekt, findWerkbereich } from "@/lib/werkbereiche";
import PageTitle from "../../components/PageTitle";
import WerkbereichSideNav from "../WerkbereichSideNav";

export default async function WerkbereichPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const werkbereich = findWerkbereich(slug);
  const projekt = findVereinsprojekt(slug);
  const entry = werkbereich ?? projekt;
  if (!entry) notFound();

  return (
    <div className="grid items-start gap-8 md:grid-cols-[212px_minmax(0,1fr)]">
      <WerkbereichSideNav />
      <div className="min-w-0">
        <PageTitle
          backLink={{
            href: "/werkbereiche",
            label: "Zur Übersicht",
            icon: faArrowLeft,
          }}
          title={entry.name}
          subTitle={werkbereich?.description}
        />
      </div>
    </div>
  );
}
