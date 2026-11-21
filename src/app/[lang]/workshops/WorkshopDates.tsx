"use client";

// „Anstehende Termine“: Filter nach Campai-Kategorie (Dropdown neben dem
// Einleitungssatz) und eine waagerecht
// scrollende Reihe Karten („Kartenstil D · Ruhig mit Bild“ aus dem Entwurf),
// mit dem Bild aus Campai.
// Jede Karte führt auf die Buchungsseite. Pfeiltasten links und rechts
// blättern für alle, die nicht waagerecht scrollen können.
import Link from "next/link";
import { LinkPendingOverlay } from "@/components/LinkPending";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Face from "@/components/knglmrt/Face";
import Notice from "@/components/knglmrt/Notice";
import Select from "@/components/knglmrt/Select";
import { localizePathname } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import {
  bookingAction,
  cardPrice,
  categoryFilters,
  collapseSeries,
  formatDayMonth,
  formatEuro,
  formatPrice,
  formatTimeRange,
  formatWeekdayShort,
  isDateFarOff,
  matchesCategory,
  seatStatus,
  type WorkshopEvent,
} from "@/lib/workshops";

const ALL = "alle";
const MAX_CARD_TAGS = 2;

export default function WorkshopDates({
  events,
  title,
  intro,
}: {
  events: WorkshopEvent[];
  /** Überschrift über allem. */
  title: ReactNode;
  /** Einleitungssatz unter der Überschrift; der Filter steht rechts daneben. */
  intro: ReactNode;
}) {
  const { tx, locale } = useI18n();
  const [filter, setFilter] = useState<string>(ALL);

  const filters = useMemo(
    // „Alle Kategorien“ statt „Alle“: Das Dropdown hat keine sichtbare
    // Beschriftung, der Wert muss für sich sprechen.
    () => [{ value: ALL, label: tx("Alle Kategorien", "de") }, ...categoryFilters(events)],
    [events, tx],
  );
  const entries = useMemo(() => {
    const visible =
      filter === ALL ? events : events.filter((event) => matchesCategory(event, filter));
    return collapseSeries(visible);
  }, [events, filter]);

  // Pfeile nur zeigen, wenn es in die Richtung noch etwas zu sehen gibt.
  const rowRef = useRef<HTMLUListElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });
  const updateScroll = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const back = row.scrollLeft > 4;
    const forward = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
    setCanScroll((current) =>
      current.back === back && current.forward === forward ? current : { back, forward },
    );
  }, []);

  // Ohne scroll-px-6 an der Reihe rastet die erste Karte am Rand des
  // Scrollbereichs ein statt am Innenabstand — dann stünde die Reihe schon
  // beim Laden 24 px weit gescrollt und der linke Pfeil wäre sichtbar.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    // Neuer Filter: wieder vorn anfangen.
    row.scrollTo({ left: 0 });
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(row);
    return () => observer.disconnect();
  }, [entries, updateScroll]);

  // Eine Seite weiter, abzüglich des Randes; scroll-snap rastet auf der
  // nächsten Karte ein.
  const page = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * Math.max(row.clientWidth - 96, 288), behavior: "smooth" });
  };

  return (
    <>
      {title}
      {/* Eigene Ebene über der Kartenreihe, sonst läge die offene Liste unter
          dem rechten Pfeil. */}
      <div className="relative z-30 mt-2 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        {intro}
        {filters.length > 2 ? (
          <Select
            value={filter}
            options={filters}
            onChange={setFilter}
            className="w-full sm:w-[240px]"
          />
        ) : null}
      </div>

      {entries.length > 0 ? (
        <div className="relative mt-7">
          <ul
            ref={rowRef}
            onScroll={updateScroll}
            className="-mx-6 flex snap-x snap-mandatory scroll-px-6 list-none gap-4 overflow-x-auto px-6 pb-3"
          >
            {entries.map(({ event }) => {
              const status = seatStatus(event);
              const action = bookingAction(event);
              const href = localizePathname(`/workshops/${event.id}`, locale);
              // Der Entwurf zeigt nur Bild, Datum, Titel und Preis. Knappe Plätze
              // und geschlossene Anmeldung stehen als kleine Zeile darunter, die
              // Warteliste als Marke unten rechts.
              const waitlist = action === "waitlist";
              const note = status.tone !== "offen" && !waitlist ? tx(status.label, "de") : null;
              // Offener Termin oder mehr als ein Jahr hin: Das Datum in Campai
              // ist nur ein Platzhalter.
              const farOff = !event.dateOpen && isDateFarOff(event);
              const when = event.dateOpen
                ? tx("Termin offen", "de")
                : farOff
                  ? tx("Termin noch offen", "de")
                  : `${formatWeekdayShort(event.start)} ${formatDayMonth(event.start)}`;
              // Geschützte Termine: Vorschau in Grautönen, blasser, aber
              // klickbar. Der Hover-Rahmen bleibt farbig wie bei allen Karten.
              const preview = !event.published;
              const muted = preview ? "grayscale opacity-55" : "";
              const price = cardPrice(event);
              const priceLabel = price.from
                ? `${tx("ab", "de")} ${formatEuro(price.cents ?? 0)}`
                : formatPrice(price.cents);
              const waitlistLabel = event.dateOpen
                ? tx("Nur Warteliste", "de")
                : tx("Warteliste", "de");
              return (
                <li key={event.id} className="flex w-[288px] flex-none snap-start">
                  {/* Die ganze Karte ist der Link zur Buchungsseite. Hover wie bei
                      den Ressourcen: ein Rahmen in Primärfarbe. Er liegt als
                      Ebene über der Karte, sonst verdeckt ihn das Bild. */}
                  <Link
                    href={href}
                    aria-label={`${event.title}, ${when}${waitlist ? ` – ${waitlistLabel}` : ""}${
                      preview ? ` – ${tx("Noch nicht buchbar", "de")}` : ""
                    }`}
                    className="relative flex w-full flex-col bg-muted text-foreground no-underline focus-visible:outline-none after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:transition-shadow after:duration-200 after:ease-[cubic-bezier(.2,0,0,1)] hover:after:shadow-[inset_0_0_0_3px_var(--primary)] focus-visible:after:shadow-[inset_0_0_0_3px_var(--primary)]"
                  >
                    <LinkPendingOverlay />
                    {event.imageUrl ? (
                      // Campai liefert signierte S3-Adressen (24 h gültig) —
                      // kein next/image-Proxy.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={event.imageUrl}
                        alt=""
                        loading="lazy"
                        className={`block aspect-[2/1] w-full object-cover ${muted}`}
                      />
                    ) : (
                      // Ohne Bild in Campai: eines der Gesichter.
                      <div
                        className={`flex aspect-[2/1] items-center justify-center bg-[var(--knglmrt-paper-pink)] dark:bg-primary-soft ${muted}`}
                      >
                        <Face number={6} size={64} title="" />
                      </div>
                    )}
                    {/* Die Campai-Kategorien oben rechts, wie bei den Gruppen-
                        Workshops: die ersten zwei, dahinter „+N“ für den Rest. */}
                    {event.categories.length > 0 ? (
                      <div
                        className={`absolute left-3 right-3 top-3 z-10 flex flex-wrap justify-end gap-1.5 ${muted}`}
                      >
                        {event.categories.slice(0, MAX_CARD_TAGS).map((category) => (
                          <Badge key={category.id} tone="kontur" className="bg-card">
                            {category.name}
                          </Badge>
                        ))}
                        {event.categories.length > MAX_CARD_TAGS ? (
                          <Badge tone="kontur" className="bg-card">
                            +{event.categories.length - MAX_CARD_TAGS}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    <div className={`flex flex-1 flex-col gap-1.5 px-[18px] pb-4 pt-4 ${muted}`}>
                      <div className="knglmrt-tag text-primary">
                        {event.dateOpen || farOff
                          ? when
                          : `${when} · ${formatTimeRange(event.start, event.end)}`}
                      </div>
                      <h3 className="knglmrt-card-title m-0 min-h-[54px] text-pretty">
                        {event.title}
                      </h3>
                      {note ? (
                        <p className="knglmrt-num m-0 text-muted-foreground">{note}</p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
                        <span className="knglmrt-num">{priceLabel}</span>
                        {waitlist ? <Badge tone="wartet">{waitlistLabel}</Badge> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Über dem Rand der Reihe, mittig auf Höhe der Karten. */}
          {canScroll.back ? (
            <Button
              kind="primary"
              iconOnly
              icon={faChevronLeft}
              aria-label={tx("Vorherige Workshops", "de")}
              onClick={() => page(-1)}
              className="absolute left-0 top-[calc(50%-6px)] z-20 -translate-x-1/3 -translate-y-1/2 shadow-[0_2px_8px_rgb(0_0_0/0.25)]"
            />
          ) : null}
          {canScroll.forward ? (
            <Button
              kind="primary"
              iconOnly
              icon={faChevronRight}
              aria-label={tx("Weitere Workshops", "de")}
              onClick={() => page(1)}
              className="absolute right-0 top-[calc(50%-6px)] z-20 -translate-y-1/2 translate-x-1/3 shadow-[0_2px_8px_rgb(0_0_0/0.25)]"
            />
          ) : null}
        </div>
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
