// src/app/[lang]/workshops/gruppen/[slug]/page.tsx — ein Workshop für Gruppen.
//
// Nach dem Entwurf „Workshop Detail“: Titel mit Marke, Eckdaten, Bilder,
// Ablauf, Anfrageformular und die anderen Workshops. Alle Workshops nutzen
// diese eine Vorlage; die Inhalte liefert getGroupWorkshop().
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { getGroupWorkshop, listGroupWorkshops } from "@/lib/group-workshops";
import PageTitle from "../../../components/PageTitle";
import GroupRequestForm from "../GroupRequestForm";
import GroupWorkshopFacts from "../GroupWorkshopFacts";
import GroupWorkshopGallery from "../GroupWorkshopGallery";
import GroupWorkshopSchedule from "../GroupWorkshopSchedule";
import OtherGroupWorkshops from "../OtherGroupWorkshops";
import RequestMailAside from "../RequestMailAside";

type Params = { params: Promise<{ slug: string }> };

// Gleiche Breiten wie die Übersicht: Streifen über die volle Breite, Inhalt
// auf 1120px.
const BLEED = "knglmrt-full-bleed";
const INNER = "mx-auto w-full max-w-[1120px] px-6";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const workshop = await getGroupWorkshop(slug);
  if (!workshop) return { title: "Workshop" };
  return {
    title: `${workshop.title} · Workshop für Gruppen`,
    description: workshop.summary,
  };
}

export default async function GroupWorkshopPage({ params }: Params) {
  const { slug } = await params;
  const [{ tx, locale }, workshop, all] = await Promise.all([
    getServerI18n(),
    getGroupWorkshop(slug),
    listGroupWorkshops(),
  ]);
  if (!workshop) notFound();

  const others = all.filter((entry) => entry.slug !== workshop.slug);
  const overviewHref = `${localizePathname("/workshops", locale)}#gruppen`;
  const mailSubject = `Anfrage ${workshop.title}`;

  return (
    <div className="-mb-4 -mt-4 md:-mb-10 md:-mt-10">
      <section className={`${INNER} pb-14 pt-8`}>
        <PageTitle
          backLink={{ href: overviewHref, label: tx("Alle Workshops für Gruppen", "de") }}
          title={<span className="break-words">{workshop.title}</span>}
          links={[
            {
              href: "#anfrage",
              label: tx("Workshop anfragen", "de"),
              kind: "primary",
              size: "medium",
            },
          ]}
          className="[&>div]:items-end"
        />

        <p className="mb-0 mt-[18px] max-w-[680px] text-pretty">{workshop.intro}</p>

        <div className="mt-7">
          <GroupWorkshopFacts workshop={workshop} />
        </div>
        <div className="mt-8">
          <GroupWorkshopGallery workshop={workshop} />
        </div>
      </section>

      <GroupWorkshopSchedule workshop={workshop} className={BLEED} innerClassName={INNER} />

      <section
        id="anfrage"
        aria-labelledby="anfrage-titel"
        className={`${INNER} scroll-mt-[90px] pb-[72px] pt-16 lg:scroll-mt-[100px]`}
      >
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <h2 id="anfrage-titel" className="m-0">
              {tx("Diesen Workshop anfragen", "de")}
            </h2>
            <p className="mb-0 mt-3 max-w-[560px] text-muted-foreground">
              {tx(
                "Sag uns, wer ihr seid und wann es passen würde. Wir melden uns innerhalb einer Woche mit einem Terminvorschlag.",
                "de",
              )}
            </p>
            <GroupRequestForm
              workshop={{ slug: workshop.slug, title: workshop.title }}
              minPeople={workshop.groupSize.min}
              maxPeople={workshop.groupSize.max}
              messageLabel="Noch etwas?"
              sentText={`Danke! Deine Anfrage für „${workshop.title}“ ist bei uns. Die vielen Gesichter melden sich innerhalb einer Woche.`}
              mailSubject={mailSubject}
            />
          </div>
          <RequestMailAside mailSubject={mailSubject} />
        </div>
      </section>

      <OtherGroupWorkshops workshops={others} className={BLEED} innerClassName={INNER} />
    </div>
  );
}
