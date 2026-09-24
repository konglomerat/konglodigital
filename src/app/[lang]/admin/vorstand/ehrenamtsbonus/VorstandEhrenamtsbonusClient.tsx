"use client";

// Screen 2 — Verwaltung. Die Anträge stehen als aufklappbare Liste, der erste
// offene Eintrag ist offen: wer hier hereinkommt, will meistens genau den
// entscheiden. Was eine Annahme auslöst, steht hervorgehoben im Detail und
// kommt aus derselben Entscheidungsmatrix wie die Vorschau im Antragsformular.
//
// Es wird nicht abgestimmt: eine Entscheidung genügt, der Name bleibt am
// Antrag stehen.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Notice from "@/components/knglmrt/Notice";
import SegmentedControl from "@/components/knglmrt/SegmentedControl";
import StatTile from "@/components/knglmrt/StatTile";
import Textarea from "@/components/knglmrt/Textarea";
import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import {
  ACCESS_LEVEL_LABELS,
  BONUS_OPTION_LABELS,
  EHRENAMTSBONUS_STATUS_LABELS,
  EHRENAMTSBONUS_STATUS_TONES,
  SYSTEM_TARGET_LABELS,
  formatEuro,
  isOpenStatus,
  quarterLabelForDate,
  resolveDisplayStatus,
  resolveOutcome,
  type EhrenamtsbonusAdminRequest,
  type EhrenamtsbonusDecision,
} from "@/lib/ehrenamtsbonus";
import { findWerkbereich } from "@/lib/werkbereiche";

const FILTERS = [
  { value: "open", label: "Offen" },
  { value: "approved", label: "Angenommen" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "expiring", label: "Läuft bald ab" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const parsed = new Date(
    value.length === 10 ? `${value}T00:00:00` : value,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("de-DE");
};

const werkbereichLabel = (slug: string) => findWerkbereich(slug)?.name ?? slug;

const werkbereicheLabel = (slugs: readonly string[]) =>
  slugs.length === 0 ? "—" : slugs.map(werkbereichLabel).join(", ");

const applicantLabel = (request: EhrenamtsbonusAdminRequest) =>
  request.applicantName ?? `Mitglied ${request.userId.slice(0, 8)}`;

/** Ein Feld im Detailkopf — Beschriftung oben, Wert darunter. */
function DetailItem({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="knglmrt-caption text-muted-foreground">{label}</dt>
      <dd className={mono ? "knglmrt-num" : undefined}>{children}</dd>
    </div>
  );
}

export default function VorstandEhrenamtsbonusClient() {
  const [requests, setRequests] = useState<EhrenamtsbonusAdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/ehrenamtsbonus");
      const payload = (await response.json()) as {
        error?: string;
        requests?: EhrenamtsbonusAdminRequest[];
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Anträge konnten nicht geladen werden.",
        );
      }
      setRequests(payload.requests ?? []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Anträge konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const visibleRequests = useMemo(() => {
    if (filter === "open") {
      return requests.filter((entry) => isOpenStatus(entry.status));
    }
    if (filter === "expiring") {
      return requests.filter(
        (entry) => resolveDisplayStatus(entry) === "expiring",
      );
    }
    return requests.filter((entry) => entry.status === filter);
  }, [filter, requests]);

  // Der erste Eintrag der Liste steht aufgeklappt, solange niemand selbst
  // gewählt hat: `null` heißt „noch nichts angefasst", der leere String heißt
  // „bewusst zugeklappt" — sonst würde sich der erste Eintrag sofort wieder
  // öffnen, wenn man ihn schließt.
  const effectiveExpandedId =
    expandedId === null
      ? (visibleRequests[0]?.id ?? null)
      : visibleRequests.some((entry) => entry.id === expandedId)
        ? expandedId
        : null;

  const openCount = useMemo(
    () => requests.filter((entry) => isOpenStatus(entry.status)).length,
    [requests],
  );

  const expiringCount = useMemo(
    () =>
      requests.filter((entry) => resolveDisplayStatus(entry) === "expiring")
        .length,
    [requests],
  );

  const forgoneOpenCents = useMemo(
    () =>
      requests
        .filter((entry) => isOpenStatus(entry.status))
        .reduce(
          (sum, entry) =>
            sum +
            resolveOutcome(entry.currentAccess, entry.requestedOption)
              .forgoneCents,
          0,
        ),
    [requests],
  );

  const decide = async (
    request: EhrenamtsbonusAdminRequest,
    decision: EhrenamtsbonusDecision,
  ) => {
    const note = (notes[request.id] ?? "").trim();

    if (decision === "reject" && !note) {
      setNoteErrors((current) => ({
        ...current,
        [request.id]: "Eine Ablehnung braucht eine Begründung.",
      }));
      return;
    }

    setNoteErrors((current) => {
      const next = { ...current };
      delete next[request.id];
      return next;
    });
    setSavingId(request.id);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/admin/ehrenamtsbonus/${request.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note: note || null }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        request?: EhrenamtsbonusAdminRequest | null;
        decidedByName?: string | null;
      };
      if (!response.ok || !payload.request) {
        throw new Error(
          payload.error ?? "Entscheidung konnte nicht gespeichert werden.",
        );
      }

      const updated = payload.request;
      setRequests((current) =>
        current.map((entry) =>
          entry.id === updated.id
            ? {
                // Die Antwort kennt nur die Antragsfelder und den Namen der
                // entscheidenden Person — Antragsteller und Kontostand stehen
                // schon in der geladenen Liste.
                ...updated,
                applicantName: entry.applicantName,
                applicantMemberNumber: entry.applicantMemberNumber,
                openBalanceCents: entry.openBalanceCents,
                decidedByName: payload.decidedByName ?? null,
              }
            : entry,
        ),
      );
      setNotes((current) => ({ ...current, [request.id]: "" }));
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Entscheidung konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SubPageTitle
        ressort="vorstand"
        title="Anträge Ehrenamtsbonus"
        subTitle="Mitglieder beantragen für ehrenamtliches Engagement 10 Zugangstage pro Quartal oder uneingeschränkten Zugang. Was eine Zustimmung auslöst, hängt am heutigen Zugang des Mitglieds und steht bei jedem Antrag."
        links={[
          {
            label: loading ? "Wird geladen …" : "Aktualisieren",
            onClick: () => {
              void loadRequests();
            },
            disabled: loading,
          },
        ]}
      />

      <div className="grid gap-3.5 sm:grid-cols-3">
        <StatTile
          label="Offene Anträge"
          value={loading ? "…" : String(openCount)}
          hint="Ein Vorstandsmitglied entscheidet"
          tone={openCount > 0 ? "rosa" : "grau"}
        />
        <StatTile
          label="Entgangener Beitrag"
          value={loading ? "…" : formatEuro(forgoneOpenCents)}
          hint="Wenn allen offenen Anträgen zugestimmt wird"
          tone="grau"
        />
        <StatTile
          label="Läuft bald ab"
          value={loading ? "…" : String(expiringCount)}
          hint="Laufende Boni in den nächsten 30 Tagen"
          tone="grau"
        />
      </div>

      {loadError ? (
        <Notice title="Anträge nicht geladen" tone="gelb">
          {loadError}
        </Notice>
      ) : null}
      {saveError ? (
        <Notice title="Entscheidung nicht gespeichert" tone="gelb">
          {saveError}
        </Notice>
      ) : null}

      <SegmentedControl
        value={filter}
        options={FILTERS}
        onChange={setFilter}
        size="small"
        className="w-fit"
      />

      {loading ? (
        <p className="text-muted-foreground">Anträge werden geladen …</p>
      ) : visibleRequests.length === 0 ? (
        <p className="text-muted-foreground">
          {filter === "open"
            ? "Keine offenen Anträge — alles entschieden."
            : "Keine Anträge in dieser Auswahl."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {visibleRequests.map((entry) => {
            const expanded = entry.id === effectiveExpandedId;
            const displayStatus = resolveDisplayStatus(entry);
            const outcome = resolveOutcome(
              entry.currentAccess,
              entry.requestedOption,
            );
            const busy = savingId === entry.id;
            const decidable = isOpenStatus(entry.status);

            return (
              <li key={entry.id} className="knglmrt-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? "" : entry.id)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-[18px] text-left transition hover:bg-primary-soft"
                >
                  <span className="min-w-0">
                    <span className="knglmrt-card-title block">
                      {applicantLabel(entry)}
                    </span>
                    <span className="knglmrt-num block text-muted-foreground">
                      {werkbereicheLabel(entry.werkbereiche)} ·{" "}
                      {BONUS_OPTION_LABELS[entry.requestedOption]} ·{" "}
                      {formatDate(entry.createdAt)}
                    </span>
                  </span>
                  <Badge tone={EHRENAMTSBONUS_STATUS_TONES[displayStatus]}>
                    {EHRENAMTSBONUS_STATUS_LABELS[displayStatus]}
                  </Badge>
                </button>

                {expanded ? (
                  <div className="flex flex-col gap-4 border-t border-border p-[18px]">
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                      <DetailItem label="Name">
                        {applicantLabel(entry)}
                        {entry.applicantMemberNumber ? (
                          <span className="knglmrt-num block text-muted-foreground">
                            Mitglied {entry.applicantMemberNumber}
                          </span>
                        ) : null}
                      </DetailItem>
                      <DetailItem label="Bereiche">
                        {werkbereicheLabel(entry.werkbereiche)}
                      </DetailItem>
                      <DetailItem label="Eingereicht" mono>
                        {formatDate(entry.createdAt)}
                      </DetailItem>
                      {/* Live aus Campai, nicht aus dem Antrag: der Betrag
                          von heute, nicht der vom Einreichen. */}
                      <DetailItem label="Offene Beiträge" mono>
                        {entry.openBalanceCents === null
                          ? "Nicht abrufbar"
                          : entry.openBalanceCents > 0
                            ? formatEuro(entry.openBalanceCents)
                            : "Nichts offen"}
                      </DetailItem>
                      <DetailItem label="Aktuell gewählter Tarif">
                        {ACCESS_LEVEL_LABELS[entry.currentAccess]}
                      </DetailItem>
                      <DetailItem label="Beantragt">
                        {BONUS_OPTION_LABELS[entry.requestedOption]}
                      </DetailItem>
                      <DetailItem label="Beginn / Laufzeit" mono>
                        {quarterLabelForDate(entry.validFrom)} ·{" "}
                        {formatDate(entry.validFrom)} –{" "}
                        {formatDate(entry.validUntil)}
                      </DetailItem>
                    </dl>

                    <div className="knglmrt-border-section p-3.5">
                      <p className="knglmrt-caption mb-1 text-muted-foreground">
                        Begründung des Mitglieds
                      </p>
                      <p className="whitespace-pre-line">{entry.reason}</p>
                    </div>

                    {/* Aufgelöst aus der Entscheidungsmatrix — dieselbe
                        Funktion, die dem Mitglied die Vorschau gezeigt hat. */}
                    <Notice title="Wird bei Annahme ausgelöst" tone="gelb">
                      {/* „Nur Anerkennung" fasst kein System an — dann steht
                          hier ein Satz statt einer leeren Liste. */}
                      {outcome.actions.length === 0 ? (
                        <p>
                          Keine Systemaktion — Tarif und Zugang bleiben
                          unverändert.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1.5">
                          {outcome.actions.map((action) => (
                            <li
                              key={`${action.target}-${action.label}`}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <Badge tone="kontur">
                                {SYSTEM_TARGET_LABELS[action.target]}
                              </Badge>
                              <span>{action.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="knglmrt-num mt-2.5 font-bold">
                        Entgangener Beitrag: {formatEuro(outcome.forgoneCents)}
                      </p>
                    </Notice>

                    {!decidable ? (
                      <p className="text-muted-foreground">
                        {entry.status === "approved"
                          ? "Angenommen"
                          : "Abgelehnt"}{" "}
                        von {entry.decidedByName ?? "einem Vorstandsmitglied"}{" "}
                        am {formatDate(entry.decidedAt)}
                      </p>
                    ) : null}

                    {entry.decisionNote && !decidable ? (
                      <p>
                        <span className="knglmrt-caption text-muted-foreground">
                          Begründung der Entscheidung
                        </span>
                        <br />
                        {entry.decisionNote}
                      </p>
                    ) : null}

                    {decidable ? (
                      <>
                        <Textarea
                          id={`eab-note-${entry.id}`}
                          label="Begründung"
                          rows={3}
                          counter={2000}
                          value={notes[entry.id] ?? ""}
                          error={noteErrors[entry.id]}
                          hint="Pflicht bei einer Ablehnung — das Mitglied liest sie."
                          onChange={(event) => {
                            const value = event.target.value;
                            setNotes((current) => ({
                              ...current,
                              [entry.id]: value,
                            }));
                          }}
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            kind="primary"
                            size="small"
                            disabled={busy}
                            onClick={() => {
                              void decide(entry, "approve");
                            }}
                          >
                            {busy ? "Wird gespeichert …" : "Annehmen"}
                          </Button>
                          <Button
                            type="button"
                            kind="danger-secondary"
                            size="small"
                            disabled={busy}
                            onClick={() => {
                              void decide(entry, "reject");
                            }}
                          >
                            Ablehnen
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
