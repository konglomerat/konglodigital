"use client";

// Ausleihen nach dem Entwurf „Ressource mit Ausleihe": aufklappbare
// Abschnitte in der Seitenleiste und ein Zwei-Monats-Kalender, in dem man
// ganze Tage wählt (höchstens MAX_RENTAL_DAYS).
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import Button from "@/components/knglmrt/Button";
import Notice from "@/components/knglmrt/Notice";
import { MAX_RENTAL_DAYS } from "@/lib/rental-limits";

type Tx = (key: string, sourceLocale?: "de" | "en") => string;

type RentalStatusItem = {
  id: string;
  type: "booking" | "custom" | "event";
  status: string;
  from: string;
  to: string;
  who: string | null;
  mine: boolean;
};

export type RentalSnapshot = {
  synced: boolean;
  syncError: string | null;
  viewer: {
    authenticated: boolean;
    hasConnectedCampaiAccount: boolean;
    displayName: string | null;
  };
  activeReservations: RentalStatusItem[];
  upcomingReservations: RentalStatusItem[];
  previousRents: RentalStatusItem[];
};

const DAY_MS = 864e5;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());
const addDays = (value: Date, days: number) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
const dayDiff = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
const formatDay = (value: Date) =>
  `${String(value.getDate()).padStart(2, "0")}.${String(value.getMonth() + 1).padStart(2, "0")}.`;

// Reservierungen enden auf einem Zeitpunkt; der letzte belegte Tag ist der,
// in dem die letzte Millisekunde liegt.
const firstDayOf = (item: RentalStatusItem) => startOfDay(new Date(item.from));
const lastDayOf = (item: RentalStatusItem) =>
  startOfDay(new Date(new Date(item.to).getTime() - 1));

export const useRentalSnapshot = (resourceId: string) => {
  const [snapshot, setSnapshot] = useState<RentalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/campai/resources/${resourceId}/rent`, {
        cache: "no-store",
      });
      const data = (await response.json()) as RentalSnapshot & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load rental status.");
      }
      setSnapshot(data);
    } catch (error) {
      setSnapshot(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load rental status.",
      );
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { snapshot, loading, errorMessage, reload };
};

type LoanStatus = {
  tone: "rosa" | "gelb" | "blau";
  mapNoteEyebrow: string | null;
  mapNote: string | null;
  sub: string;
  mine: boolean;
};

export const deriveLoanStatus = (
  snapshot: RentalSnapshot | null,
  tx: Tx,
): LoanStatus | null => {
  if (!snapshot?.synced) {
    return null;
  }
  const maxDays = `${tx("max.", "de")} ${MAX_RENTAL_DAYS} ${tx("Tage", "de")}`;
  // Ausgeliehen wird tageweise: Belegt ist, was den heutigen Tag abdeckt —
  // auch eine Buchung, die erst ab der nächsten vollen Stunde läuft.
  const today = startOfDay(new Date());
  const coversToday = (item: RentalStatusItem) =>
    dayDiff(firstDayOf(item), today) >= 0 &&
    dayDiff(today, lastDayOf(item)) >= 0;
  const reservations = [
    ...snapshot.activeReservations,
    ...snapshot.upcomingReservations,
  ];
  const mine = reservations.find((item) => item.mine);

  if (mine) {
    const from = formatDay(firstDayOf(mine));
    const to = formatDay(lastDayOf(mine));
    return {
      tone: "rosa",
      mapNote: `${tx("Ab", "de")} ${from} ${tx("bei dir – bitte bis", "de")} ${to} ${tx("hierher zurück.", "de")}`,
      mapNoteEyebrow: null,
      sub: `${tx("bei dir bis", "de")} ${to}`,
      mine: true,
    };
  }

  const current = reservations.find(coversToday);
  if (current) {
    const from = formatDay(firstDayOf(current));
    const to = formatDay(lastDayOf(current));
    const freeFrom = formatDay(addDays(lastDayOf(current), 1));
    return {
      tone: "gelb",
      mapNoteEyebrow: tx("Unterwegs", "de"),
      mapNote: current.who
        ? `${current.who} ${tx("hat diese Ressource ausgeliehen von", "de")} ${from} ${tx("bis", "de")} ${to}`
        : `${tx("Diese Ressource ist ausgeliehen von", "de")} ${from} ${tx("bis", "de")} ${to}`,
      sub: `${tx("Momentan nicht verfügbar", "de")} · ${tx("ab", "de")} ${freeFrom} ${tx("wieder frei", "de")}`,
      mine: false,
    };
  }

  return {
    tone: "blau",
    mapNoteEyebrow: null,
    mapNote: null,
    sub: `${tx("frei", "de")} · ${maxDays}`,
    mine: false,
  };
};

export function SidebarSection({
  title,
  sub,
  open,
  onToggle,
  id,
  children,
}: {
  title: string;
  sub?: string | null;
  open: boolean;
  onToggle: () => void;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col knglmrt-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-3 px-[18px] py-3.5 text-left transition-colors hover:bg-primary-soft"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-[family-name:var(--font-display)] text-[length:var(--ui-size-section)] leading-[var(--ui-line-section)] text-foreground">
            {title}
          </span>
          {sub ? (
            <span className="text-[length:var(--ui-size-body)] leading-[var(--ui-line-body)] text-foreground">
              {sub}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none border-b-2 border-r-2 border-[var(--knglmrt-ink)] transition-transform duration-200 ease-[cubic-bezier(.2,0,0,1)]"
          style={{
            transform: open
              ? "rotate(-135deg) translate(-3px,-3px)"
              : "rotate(45deg)",
          }}
        />
      </button>
      {open ? <div className="knglmrt-border-t">{children}</div> : null}
    </section>
  );
}

type LoanSectionProps = {
  resourceId: string;
  snapshot: RentalSnapshot | null;
  status: LoanStatus | null;
  loading: boolean;
  errorMessage: string | null;
  reload: () => Promise<void>;
  tx: Tx;
};

export function LoanSectionBody({
  resourceId,
  snapshot,
  status,
  loading,
  errorMessage,
  reload,
  tx,
}: LoanSectionProps) {
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ start: Date; end: Date } | null>(
    null,
  );

  const today = useMemo(() => startOfDay(new Date()), []);
  const canRent = Boolean(
    snapshot?.synced &&
      snapshot.viewer.authenticated &&
      snapshot.viewer.hasConnectedCampaiAccount,
  );

  const blocking = useMemo(
    () => [
      ...(snapshot?.activeReservations ?? []),
      ...(snapshot?.upcomingReservations ?? []),
    ],
    [snapshot],
  );
  const bookedBy = useCallback(
    (day: Date) =>
      blocking.find(
        (item) =>
          dayDiff(firstDayOf(item), day) >= 0 &&
          dayDiff(day, lastDayOf(item)) >= 0,
      ),
    [blocking],
  );

  const pick = (day: Date) => {
    if (!start || end || dayDiff(start, day) < 0) {
      setStart(day);
      setEnd(null);
      setPickError(null);
      return;
    }
    if (dayDiff(start, day) + 1 > MAX_RENTAL_DAYS) {
      setPickError(
        `${tx("Maximaldauer ist", "de")} ${MAX_RENTAL_DAYS} ${tx("Tage", "de")}`,
      );
      return;
    }
    for (let x = start; dayDiff(x, day) >= 0; x = addDays(x, 1)) {
      if (bookedBy(x)) {
        setPickError(tx("Dazwischen ist sie schon vergeben.", "de"));
        return;
      }
    }
    setEnd(day);
    setPickError(null);
  };

  const confirm = async () => {
    if (!start || !end) {
      return;
    }
    setSaving(true);
    setBookingError(null);
    // Ganze Tage: ab Tagesbeginn (heute ab der nächsten vollen Stunde) bis
    // zum Beginn des Tages nach dem Rückgabetag.
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const from = start.getTime() < now.getTime() ? nextHour : start;
    const to = addDays(end, 1);
    try {
      const response = await fetch(`/api/campai/resources/${resourceId}/rent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: from.toISOString(),
          end: to.toISOString(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create booking.");
      }
      setBooked({ start, end });
      setStart(null);
      setEnd(null);
      await reload();
    } catch (error) {
      setBookingError(
        error instanceof Error ? error.message : "Unable to create booking.",
      );
    } finally {
      setSaving(false);
    }
  };

  const months = [0, 1].map((offset) => {
    const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return {
      key: `${first.getFullYear()}-${first.getMonth()}`,
      label: `${tx(MONTHS[first.getMonth()], "de")} ${first.getFullYear()}`,
      leading: (first.getDay() + 6) % 7,
      days: Array.from(
        { length: days },
        (_, index) =>
          new Date(first.getFullYear(), first.getMonth(), index + 1),
      ),
    };
  });

  let summary = tx("Tippe im Kalender auf den ersten Tag.", "de");
  let summaryClassName = "text-foreground";
  if (start && !end) {
    summary = `${tx("Ab", "de")} ${formatDay(start)} ${tx("– jetzt den Rückgabetag wählen.", "de")}`;
  }
  if (start && end) {
    const count = dayDiff(start, end) + 1;
    summary = `${formatDay(start)} ${tx("bis", "de")} ${formatDay(end)} · ${count} ${
      count === 1 ? tx("Tag", "de") : tx("Tage", "de")
    }`;
    summaryClassName = "text-[var(--knglmrt-ink)]";
  }
  if (pickError) {
    summary = pickError;
    summaryClassName = "text-primary";
  }

  const history = snapshot?.viewer.authenticated
    ? [
        ...(snapshot.activeReservations ?? []).filter(
          (item) => item.type === "booking",
        ),
        ...(snapshot.previousRents ?? []),
      ]
        .filter((item) => item.who)
        .slice(0, 5)
    : [];

  if (loading) {
    return (
      <div className="px-[18px] py-4 text-foreground">{tx("Loading…")}</div>
    );
  }

  if (errorMessage || !snapshot) {
    return (
      <div className="px-[18px] py-4">
        <Notice tone="rosa">{errorMessage ?? tx("Loading…")}</Notice>
      </div>
    );
  }

  if (!snapshot.synced) {
    return (
      <div className="px-[18px] py-4">
        <Notice tone="gelb">
          {snapshot.syncError ||
            tx("This resource is not synced to Campai yet.", "en")}
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 px-[18px] py-4">
      <div className="grid grid-cols-2 gap-4">
        {months.map((month) => (
          <div key={month.key} className="flex min-w-0 flex-col gap-1.5">
            <span className="font-bold text-[length:var(--ui-size-body)] leading-[var(--ui-line-body)] text-[var(--knglmrt-ink)]">
              {month.label}
            </span>
            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((weekday) => (
                <span
                  key={weekday}
                  className="text-center text-[length:var(--ui-size-label)] text-muted-foreground"
                >
                  {tx(weekday, "de")}
                </span>
              ))}
              {Array.from({ length: month.leading }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {month.days.map((day) => {
                const past = dayDiff(day, today) > 0;
                const reservation = bookedBy(day);
                const selected =
                  start &&
                  (end
                    ? dayDiff(start, day) >= 0 && dayDiff(day, end) >= 0
                    : dayDiff(day, start) === 0);
                const selectable = canRent && !past && !reservation;
                const isToday = dayDiff(day, today) === 0;
                return (
                  <button
                    key={day.getDate()}
                    type="button"
                    disabled={!selectable}
                    onClick={() => pick(day)}
                    title={
                      reservation
                        ? reservation.who
                          ? `${tx("vergeben:", "de")} ${reservation.who}`
                          : tx("vergeben", "de")
                        : undefined
                    }
                    className={`flex h-[30px] items-center justify-center knglmrt-num ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : reservation
                          ? "bg-[var(--knglmrt-pink-30)]"
                          : ""
                    } ${
                      selected
                        ? ""
                        : past
                          ? "text-border"
                          : "text-[var(--knglmrt-ink)]"
                    } ${selectable ? "cursor-pointer" : "cursor-default"}`}
                    style={
                      isToday
                        ? {
                            outline: "1px solid var(--knglmrt-ink)",
                            outlineOffset: -1,
                          }
                        : undefined
                    }
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3.5 text-[length:var(--ui-size-label)] text-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-[var(--knglmrt-pink-30)]" />
          {tx("schon vergeben", "de")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 bg-primary" />
          {tx("dein Zeitraum", "de")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 outline outline-1 -outline-offset-1 outline-[var(--knglmrt-ink)]" />
          {tx("heute", "de")}
        </span>
      </div>

      <div className="flex flex-col gap-1 bg-muted px-3.5 py-3">
        <span className="knglmrt-label text-[var(--knglmrt-ink)]">
          {tx("Dein Zeitraum", "de")}
        </span>
        <span
          className={`text-[length:var(--ui-size-body)] leading-[var(--ui-line-body)] ${summaryClassName}`}
        >
          {summary}
        </span>
        {start ? (
          <button
            type="button"
            onClick={() => {
              setStart(null);
              setEnd(null);
              setPickError(null);
            }}
            className="cursor-pointer self-start text-[length:var(--ui-size-body)] text-primary"
          >
            {tx("Auswahl löschen", "de")}
          </button>
        ) : null}
      </div>

      {booked ? (
        <Notice tone="rosa" faceNumber={9}>
          {tx("Eingetragen. Abholen ab", "de")} {formatDay(booked.start)} –{" "}
          {tx("zurück bis", "de")} {formatDay(booked.end)}.
        </Notice>
      ) : null}

      {!snapshot.viewer.authenticated ? (
        <p className="text-foreground">
          {tx("Sign in to rent this resource.", "en")}
        </p>
      ) : !snapshot.viewer.hasConnectedCampaiAccount ? (
        <p className="text-foreground">
          {tx(
            "Your account needs a connected Campai profile before you can rent resources.",
            "en",
          )}
        </p>
      ) : !booked && !status?.mine ? (
        <Button
          kind="primary"
          size="small"
          fullWidth
          disabled={!start || !end}
          loading={saving}
          onClick={confirm}
        >
          {tx("Eintragen", "de")}
        </Button>
      ) : null}

      {bookingError ? <p className="text-primary">{bookingError}</p> : null}

      {history.length > 0 ? (
        <div className="flex flex-col">
          <span className="knglmrt-caption pb-1.5 text-[var(--knglmrt-ink)]">
            {tx("Zuletzt ausgeliehen von", "de")}
          </span>
          {history.map((item) => (
            <div
              key={item.id}
              className="flex justify-between gap-3 border-b-[0.5px] border-border py-1.5 text-foreground"
            >
              <span>
                {item.who}
                {item.mine ? ` (${tx("du", "de")})` : ""}
              </span>
              <span className="knglmrt-num whitespace-nowrap">
                {formatDay(firstDayOf(item))} – {formatDay(lastDayOf(item))}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
