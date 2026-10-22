// src/app/[lang]/workshops/page.tsx — Workshops & Kurse.
//
// Nach dem Entwurf „Events Scroll“: Titel „Workshop buchen“ mit den
// kommenden Terminen aus Campai als waagerechte Kartenreihe, Workshops für
// Gruppen mit Anfrageformular und die häufigen Fragen. Gebucht wird auf
// der Seite des einzelnen Termins (/workshops/[eventId]).
import type { Metadata } from "next";

import Face from "@/components/knglmrt/Face";
import Notice from "@/components/knglmrt/Notice";
import { getServerI18n } from "@/i18n/server";
import { listUpcomingWorkshops } from "@/lib/campai-events";
import { listGroupWorkshops } from "@/lib/group-workshops";
import type { WorkshopEvent } from "@/lib/workshops";
import { FAQS } from "./content";
import WorkshopDates from "./WorkshopDates";
import WorkshopGroups from "./WorkshopGroups";

export const metadata: Metadata = {
  title: "Workshops & Kurse",
  description:
    "Schweißen, Löten, Drucken, Nähen: Kurse und Workshops im Konglomerat e.V. in Dresden – offen für alle, auch für Schulklassen, Vereine und Teams.",
};

// Die Termine sind eine Minute zwischengespeichert (campai-events.ts).
export const dynamic = "force-dynamic";

// Farbige Abschnitte laufen über die volle Breite; der Inhalt sitzt wie im
// Entwurf auf 1120px.
const BLEED = "knglmrt-full-bleed";
const INNER = "mx-auto w-full max-w-[1120px] px-6";
// Unter der klebenden Topnav (61px mobil, 71px ab lg).
const SCROLL_MARGIN = "scroll-mt-[70px] lg:scroll-mt-[80px]";

export default async function WorkshopsPage() {
  const { tx } = await getServerI18n();

  let events: WorkshopEvent[] = [];
  let loadError = false;
  try {
    events = await listUpcomingWorkshops();
  } catch (error) {
    console.error("[workshops] could not load Campai events", error);
    loadError = true;
  }

  const groupWorkshops = await listGroupWorkshops();

  return (
    <div className="-mb-4 -mt-4 md:-mb-10 md:-mt-10">
      {/* Termine */}
      <section
        id="termine"
        aria-labelledby="termine-titel"
        className={`${INNER} ${SCROLL_MARGIN} pb-14 pt-10 md:pt-12`}
      >
        {loadError ? (
          <Notice tone="gelb" className="mt-0">
            <h1 id="termine-titel" className="sr-only">
              {tx("Workshop buchen", "de")}
            </h1>
            <div className="flex items-center gap-4">
              <Face number={8} size={56} title="" className="flex-none" />
              <p className="m-0">
                {tx(
                  "Die Termine lassen sich gerade nicht laden. Versuch es gleich noch einmal.",
                  "de",
                )}
              </p>
            </div>
          </Notice>
        ) : (
          <WorkshopDates
            events={events}
            title={
              <h1 id="termine-titel" className="m-0">
                {tx("Workshop buchen", "de")}
              </h1>
            }
            intro={
              <p className="m-0 text-muted-foreground">
                {tx("Offen für alle. Mitglieder zahlen weniger.", "de")}{" "}
                <a
                  href="#gruppen"
                  className="text-primary hover:text-[var(--link-color-hover)]"
                >
                  {tx("Für Gruppen auf Anfrage.", "de")}
                </a>
              </p>
            }
          />
        )}
      </section>

      {/* Für Gruppen */}
      <section
        id="gruppen"
        aria-labelledby="gruppen-titel"
        className={`${BLEED} ${SCROLL_MARGIN} bg-[var(--knglmrt-paper-pink)] dark:bg-primary-soft`}
      >
        <div className={`${INNER} py-16 md:py-[72px]`}>
          <div className="flex flex-wrap items-end gap-x-1 gap-y-3">
            <h2 id="gruppen-titel" className="m-0 text-[40px] leading-[1.05]">
              {tx("Workshop anfragen", "de")}
            </h2>
            {/* Handschriftliche Notiz mit Pfeil, wie im Entwurf. Ab md steht sie
                rechts neben dem Titel und ist so weit angehoben, dass der Pfeil
                auf das Wortende zeigt; darunter steht sie über dem Titel. */}
            <span className="order-first flex min-w-0 max-w-full items-start gap-0.5 pl-6 text-primary md:order-none md:-translate-y-[34px] md:pl-0">
              <svg
                aria-hidden="true"
                width="56"
                height="30"
                viewBox="0 0 56 30"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-2.5 flex-none"
              >
                <path d="M54 6 C 40 2, 22 6, 9 22" />
                <path d="M4 14 L 8 23 L 17 21" />
              </svg>
              <span className="min-w-0 -rotate-[4deg] font-[family-name:var(--font-hand)] md:whitespace-nowrap text-[20px] leading-6 tracking-[0.04em]">
                {tx("für Schulen, Vereine & Teams", "de")}
              </span>
            </span>
          </div>
          <p className="mb-0 mt-3 max-w-[680px] text-pretty">
            {tx(
              "Eine Auswahl von Workshop-Formaten, die schon gut funktioniert haben. Weiter unten könnt ihr aber auch individuelle Workshops anfragen, falls nichts dabei ist oder ihr selbst eine gute Idee habt.",
              "de",
            )}
          </p>
          <WorkshopGroups workshops={groupWorkshops} />
        </div>
      </section>

      {/* Häufige Fragen */}
      <section
        id="faq"
        aria-labelledby="faq-titel"
        className={`${BLEED} ${SCROLL_MARGIN} bg-muted`}
      >
        <div
          className={`${INNER} grid grid-cols-1 gap-10 py-16 md:py-20 lg:grid-cols-3`}
        >
          <div>
            <h2 id="faq-titel" className="m-0 text-[40px] leading-none">
              {tx("Häufige Fragen", "de")}
            </h2>
            <div className="mt-6">
              <Face number={22} size={96} title="" />
            </div>
          </div>
          <div className="min-w-0 border-t border-foreground lg:col-span-2">
            {FAQS.map((faq, index) => (
              <details
                key={faq.q}
                name="workshop-faq"
                open={index === 0}
                className="group border-b border-[var(--knglmrt-dark-60)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-semibold hover:text-primary focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] [&::-webkit-details-marker]:hidden">
                  <span>{tx(faq.q, "de")}</span>
                  <span
                    aria-hidden="true"
                    className="w-5 flex-none text-center font-[family-name:var(--font-num)] text-[22px] font-normal text-primary"
                  >
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                </summary>
                <p className="-mt-1.5 mb-0 pb-[22px] pr-11 text-pretty">
                  {tx(faq.a, "de")}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
