"use client";

// „Anstehende Termine“: Filter nach Werkbereich und eine waagerecht
// scrollende Reihe Karten („Kartenstil D · Ruhig mit Bild“ aus dem Entwurf),
// mit dem Bild aus Campai.
// Jede Karte führt auf die Buchungsseite.
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import Badge from "@/components/knglmrt/Badge";
import Face from "@/components/knglmrt/Face";
import Notice from "@/components/knglmrt/Notice";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import { localizePathname } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import {
  OTHER_AREA,
  areaFilters,
  bookingAction,
  collapseSeries,
  formatDayMonth,
  formatPrice,
  formatTimeRange,
  formatWeekdayShort,
  listPriceCents,
  seatStatus,
  type WorkshopEvent,
} from "@/lib/workshops";
import WorkshopAreaMark from "./WorkshopAreaMark";

const ALL = "alle";

export default function WorkshopDates({
  events,
  heading,
}: {
  events: WorkshopEvent[];
  /** Überschrift links, die Filter stehen rechts daneben. */
  heading: ReactNode;
}) {
  const { tx, locale } = useI18n();
  const [filter, setFilter] = useState<string>(ALL);

  const filters = useMemo(
    () => [{ value: ALL, label: tx("Alle", "de") }, ...areaFilters(events)],
    [events, tx],
  );
  const entries = useMemo(() => {
    const visible =
      filter === ALL
        ? events
        : events.filter((event) => (event.area ?? OTHER_AREA) === filter);
    return collapseSeries(visible);
  }, [events, filter]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        {heading}
        {filters.length > 2 ? (
          <div className="-mx-6 max-w-[calc(100%+48px)] overflow-x-auto px-6 pb-1 sm:mx-0 sm:max-w-full sm:px-0">
            <SegmentedControl
              value={filter}
              options={filters}
              onChange={setFilter}
              size="small"
              tone="ink"
              className="whitespace-nowrap"
            />
          </div>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ul className="-mx-6 mt-7 flex snap-x snap-mandatory list-none gap-4 overflow-x-auto px-6 pb-3">
          {entries.map(({ event }) => {
            const status = seatStatus(event);
            const action = bookingAction(event);
            const href = localizePathname(`/workshops/${event.id}`, locale);
            // Der Entwurf zeigt nur Bild, Datum, Titel und Preis. Knappe Plätze
            // und geschlossene Anmeldung stehen als kleine Zeile darunter, die
            // Warteliste als Marke unten rechts.
            const waitlist = action === "waitlist";
            const note = status.tone !== "offen" && !waitlist ? tx(status.label, "de") : null;
            return (
              <li key={event.id} className="flex w-[288px] flex-none snap-start">
                {/* Die ganze Karte ist der Link zur Buchungsseite. Hover wie bei
                    den Ressourcen: ein Rahmen in Primärfarbe. Er liegt als
                    Ebene über der Karte, sonst verdeckt ihn das Bild. */}
                <Link
                  href={href}
                  aria-label={`${event.title}, ${formatWeekdayShort(event.start)} ${formatDayMonth(event.start)}${
                    waitlist ? ` – ${tx("Warteliste", "de")}` : ""
                  }`}
                  className="relative flex w-full flex-col bg-muted text-foreground no-underline focus-visible:outline-none after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:transition-shadow after:duration-200 after:ease-[cubic-bezier(.2,0,0,1)] hover:after:shadow-[inset_0_0_0_3px_var(--primary)] focus-visible:after:shadow-[inset_0_0_0_3px_var(--primary)]"
                >
                  {event.imageUrl ? (
                    // Campai liefert signierte S3-Adressen (24 h gültig) —
                    // kein next/image-Proxy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.imageUrl}
                      alt=""
                      loading="lazy"
                      className="block aspect-[2/1] w-full object-cover"
                    />
                  ) : (
                    // Ohne Bild in Campai: das Zeichen des Werkbereichs.
                    <div className="flex aspect-[2/1] items-center justify-center bg-[var(--knglmrt-paper-pink)] dark:bg-primary-soft">
                      <WorkshopAreaMark area={event.area} height={64} />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-1.5 px-[18px] pb-4 pt-4">
                    <div className="knglmrt-tag text-primary">
                      {formatWeekdayShort(event.start)} {formatDayMonth(event.start)} ·{" "}
                      {formatTimeRange(event.start, event.end)}
                    </div>
                    <h3 className="knglmrt-card-title m-0 min-h-[54px] text-pretty">
                      {event.title}
                    </h3>
                    {note ? (
                      <p className="knglmrt-num m-0 text-muted-foreground">{note}</p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                      <span className="knglmrt-num">
                        {formatPrice(listPriceCents(event))}
                      </span>
                      {waitlist ? <Badge tone="wartet">{tx("Warteliste", "de")}</Badge> : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Notice tone="grau" className="mt-10">
          <div className="flex items-center gap-4">
            <Face number={17} size={56} title="" className="flex-none" />
            <p className="m-0">
              {tx(
                "Gerade nichts geplant in diesem Bereich. Schreib uns, wenn du einen Kurs vermisst.",
                "de",
              )}
            </p>
          </div>
        </Notice>
      )}
    </>
  );
}
