"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "../../components/Button";

type RentalStatusItem = {
  id: string;
  type: "booking" | "custom" | "event";
  status: string;
  from: string;
  to: string;
  description: string | null;
  quantity: number | null;
  bookingRecordNumber: string | null;
};

type RentalSnapshot = {
  synced: boolean;
  syncStatus: "pending" | "synced" | "failed" | "skipped";
  syncError: string | null;
  viewer: {
    authenticated: boolean;
    hasConnectedCampaiAccount: boolean;
    displayName: string | null;
  };
  sessionMinutes: number;
  siteName: string | null;
  siteId: string | null;
  currentStatus: {
    label: string;
    activeReservationCount: number;
    nextChangeAt: string | null;
  };
  activeReservations: RentalStatusItem[];
  previousRents: RentalStatusItem[];
};

type CampaiRentalPanelProps = {
  resourceId: string;
  tx: (key: string, sourceLocale?: "de" | "en") => string;
};

const toLocalInputValue = (value: Date) => {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatReservationStatus = (value: string) => {
  switch (value) {
    case "confirmed":
      return "Confirmed";
    case "pending":
      return "Pending";
    case "reserved":
      return "Reserved";
    case "maintenance":
      return "Maintenance";
    case "blocked":
      return "Blocked";
    case "outOfOrder":
      return "Out of order";
    case "closed":
      return "Closed";
    case "canceled":
      return "Canceled";
    default:
      return value || "Unknown";
  }
};

export default function CampaiRentalPanel({
  resourceId,
  tx,
}: CampaiRentalPanelProps) {
  const [snapshot, setSnapshot] = useState<RentalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const defaultStart = useMemo(() => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    return start;
  }, []);
  const [start, setStart] = useState(toLocalInputValue(defaultStart));
  const [end, setEnd] = useState(() => {
    const next = new Date(defaultStart);
    next.setHours(next.getHours() + 1);
    return toLocalInputValue(next);
  });

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/campai/resources/${resourceId}/rent`, {
        cache: "no-store",
      });
      const data = (await response.json()) as RentalSnapshot & { error?: string };
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
    void loadSnapshot();
  }, [loadSnapshot]);

  const canRent =
    snapshot?.synced &&
    snapshot.viewer.authenticated &&
    snapshot.viewer.hasConnectedCampaiAccount;

  const handleBook = async () => {
    setSaving(true);
    setBookingError(null);
    setBookingMessage(null);
    try {
      const response = await fetch(`/api/campai/resources/${resourceId}/rent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ start, end }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Unable to create booking.");
      }
      setBookingMessage(tx("Rental created.", "en"));
      await loadSnapshot();
    } catch (error) {
      setBookingError(
        error instanceof Error ? error.message : "Unable to create booking.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-foreground">
          {tx("Rent resource", "en")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tx("Live Campai availability, current status and previous rents.", "en")}
        </p>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{tx("Loading…")}</p>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {snapshot ? (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
              {tx("Status", "en")}: {snapshot.currentStatus.label}
            </span>
            {snapshot.siteName ? (
              <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
                {tx("Site", "en")}: {snapshot.siteName}
              </span>
            ) : null}
            {snapshot.currentStatus.nextChangeAt ? (
              <span className="rounded-full border border-border bg-background px-3 py-1 text-foreground">
                {tx("Next change", "en")}:{" "}
                {formatDateTime(snapshot.currentStatus.nextChangeAt)}
              </span>
            ) : null}
          </div>

          {!snapshot.synced ? (
            <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
              {snapshot.syncError
                ? snapshot.syncError
                : tx("This resource is not synced to Campai yet.", "en")}
            </div>
          ) : null}

          {snapshot.activeReservations.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {tx("Current status", "en")}
              </p>
              <ul className="mt-2 flex flex-col gap-3">
                {snapshot.activeReservations.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="rounded-2xl border border-border bg-background p-4 text-sm"
                  >
                    <p className="font-semibold text-foreground">
                      {formatReservationStatus(reservation.status)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDateTime(reservation.from)} -{" "}
                      {formatDateTime(reservation.to)}
                    </p>
                    {reservation.bookingRecordNumber ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tx("Record", "en")}: {reservation.bookingRecordNumber}
                      </p>
                    ) : null}
                    {reservation.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reservation.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">
              {tx("No active reservation right now. The resource appears available.", "en")}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {tx("Rent this resource", "en")}
            </p>
            {!snapshot.viewer.authenticated ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {tx("Sign in to rent this resource.", "en")}
              </p>
            ) : null}
            {snapshot.viewer.authenticated &&
            !snapshot.viewer.hasConnectedCampaiAccount ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {tx("Your account needs a connected Campai profile before you can rent resources.", "en")}
              </p>
            ) : null}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{tx("Start", "en")}</span>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  disabled={!canRent || saving}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{tx("End", "en")}</span>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2"
                  disabled={!canRent || saving}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                kind="primary"
                disabled={!canRent || saving}
                onClick={handleBook}
              >
                {saving ? tx("Saving…") : tx("Rent now", "en")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {tx("Bookings use the synced Campai resource offer.", "en")}
              </p>
            </div>
            {bookingError ? (
              <p className="mt-2 text-sm text-destructive">{bookingError}</p>
            ) : null}
            {bookingMessage ? (
              <p className="mt-2 text-sm text-success">{bookingMessage}</p>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {tx("Previous rents", "en")}
            </p>
            {snapshot.previousRents.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-3">
                {snapshot.previousRents.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="rounded-2xl border border-border bg-background p-4 text-sm"
                  >
                    <p className="font-semibold text-foreground">
                      {reservation.bookingRecordNumber
                        ? `${tx("Record", "en")} ${reservation.bookingRecordNumber}`
                        : formatReservationStatus(reservation.status)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {formatDateTime(reservation.from)} -{" "}
                      {formatDateTime(reservation.to)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatReservationStatus(reservation.status)}
                    </p>
                    {reservation.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reservation.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {tx("No previous rents found in Campai yet.", "en")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
