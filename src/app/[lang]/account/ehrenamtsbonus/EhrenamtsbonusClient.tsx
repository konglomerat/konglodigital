"use client";

// Screen 1 — Antragsformular. Der Kopf zeigt dieselben Systemwerte, die auch
// der Vorstand sieht: den aktuellen Tarif (die Zeile der Entscheidungsmatrix)
// und den offenen Beitrag aus Campai. Beide stehen hier nur lesend; die
// Vorschau rechnet live aus der Entscheidungsmatrix, damit niemand einen
// Antrag absendet, ohne zu wissen, was er auslöst.
import { useMemo, useState, type FormEvent } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Choice, { ChoiceGroup } from "@/components/knglmrt/Choice";
import FieldShell from "@/components/knglmrt/FieldShell";
import FormSection from "@/components/knglmrt/FormSection";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Notice from "@/components/knglmrt/Notice";
import Textarea from "@/components/knglmrt/Textarea";
import PageTitle from "@/app/[lang]/components/PageTitle";
import ReactSelect from "@/app/[lang]/components/ui/react-select";
import {
  ACCESS_LEVEL_LABELS,
  BONUS_OPTIONS,
  BONUS_OPTION_HINTS,
  BONUS_OPTION_LABELS,
  EHRENAMTSBONUS_STATUS_LABELS,
  EHRENAMTSBONUS_STATUS_TONES,
  formatEuro,
  listSelectableQuarterStarts,
  quarterEndDate,
  quarterLabelForDate,
  resolveDisplayStatus,
  resolveOutcome,
  type BonusOption,
  type EhrenamtsbonusRequest,
} from "@/lib/ehrenamtsbonus";
import type { EhrenamtsbonusContext } from "@/lib/ehrenamtsbonus-context";
import { WERKBEREICHE, findWerkbereich } from "@/lib/werkbereiche";

const panelClassName = "knglmrt-border bg-card p-[18px]";

const formatDate = (value: string) => {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("de-DE");
};

const werkbereichLabel = (slug: string) => findWerkbereich(slug)?.name ?? slug;

type WerkbereichOption = { value: string; label: string };

const WERKBEREICH_OPTIONS: WerkbereichOption[] = WERKBEREICHE.map((entry) => ({
  value: entry.slug,
  label: entry.name,
}));

/** Gewählte Bereiche als ein Satzteil — leer heißt „noch nichts gewählt". */
const werkbereicheLabel = (slugs: readonly string[]) =>
  slugs.length === 0
    ? "Noch kein Werkbereich gewählt"
    : slugs.map(werkbereichLabel).join(", ");

type EhrenamtsbonusClientProps = {
  context: EhrenamtsbonusContext;
  initialRequests: EhrenamtsbonusRequest[];
};

export default function EhrenamtsbonusClient({
  context,
  initialRequests,
}: EhrenamtsbonusClientProps) {
  const quarterStarts = useMemo(() => listSelectableQuarterStarts(), []);

  const [requests, setRequests] =
    useState<EhrenamtsbonusRequest[]>(initialRequests);
  const [option, setOption] = useState<BonusOption>("tage_10");
  const [werkbereiche, setWerkbereiche] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState(quarterStarts[0].value);
  const [reason, setReason] = useState("");

  const [werkbereicheError, setWerkbereicheError] = useState<string | null>(
    null,
  );
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Der Vorschautext ist keine zweite Wahrheit: dieselbe Funktion liefert dem
  // Vorstand später die Systemaktionen.
  const outcome = useMemo(
    () => resolveOutcome(context.access, option),
    [context.access, option],
  );

  const selectedQuarter = useMemo(
    () =>
      quarterStarts.find((entry) => entry.value === validFrom) ??
      quarterStarts[0],
    [quarterStarts, validFrom],
  );

  const validUntil = quarterEndDate(
    selectedQuarter.year,
    selectedQuarter.quarter,
  );

  const selectedWerkbereichOptions = useMemo(
    () =>
      werkbereiche.map((slug) => ({
        value: slug,
        label: werkbereichLabel(slug),
      })),
    [werkbereiche],
  );

  const handleWerkbereicheChange = (
    selected: readonly WerkbereichOption[],
  ) => {
    setWerkbereiche(selected.map((option) => option.value));
    if (selected.length > 0) {
      setWerkbereicheError(null);
    }
  };

  const resetForm = () => {
    setOption("tage_10");
    setWerkbereiche([]);
    setValidFrom(quarterStarts[0].value);
    setReason("");
    setWerkbereicheError(null);
    setReasonError(null);
    setFormError(null);
    setFormStatus(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFormStatus(null);

    if (werkbereiche.length === 0) {
      setWerkbereicheError("Bitte mindestens einen Werkbereich wählen.");
      return;
    }
    if (reason.trim().length < 20) {
      setReasonError(
        "Bitte beschreibe dein Engagement in mindestens 20 Zeichen.",
      );
      return;
    }
    setReasonError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/ehrenamtsbonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedOption: option,
          werkbereiche,
          validFrom,
          reason,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        request?: EhrenamtsbonusRequest | null;
      };
      if (!response.ok || !payload.request) {
        throw new Error(payload.error ?? "Antrag konnte nicht gesendet werden.");
      }

      const created = payload.request;
      setRequests((current) => [created, ...current]);
      resetForm();
      setFormStatus(
        "Antrag eingereicht. Der Vorstand meldet sich, sobald er entschieden hat.",
      );
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Antrag konnte nicht gesendet werden.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        backLink={{ href: "/account", label: "Zurück" }}
        title="Ehrenamtsbonus"
        subTitle="Für ehrenamtliches Engagement im Verein kannst du einen Bonus beantragen. Der Vorstand entscheidet darüber. Ein Bonus wirkt immer ab Quartalsbeginn und ist befristet."
        titleClassName="text-[length:var(--ui-size-section)]"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_minmax(0,460px)]">
        <FormSection title="Antrag stellen">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <ChoiceGroup label="Was beantragst du?">
              {BONUS_OPTIONS.map((entry) => (
                <Choice
                  key={entry}
                  kind="radio"
                  name="eab-option"
                  value={entry}
                  checked={option === entry}
                  onChange={() => setOption(entry)}
                  label={BONUS_OPTION_LABELS[entry]}
                  hint={BONUS_OPTION_HINTS[entry]}
                />
              ))}
            </ChoiceGroup>

            {/* Mehrfachauswahl über das gemeinsame react-select des Repos:
                Auswahl steht als eckige Marken im Feld, Rest hängt in der
                Liste. */}
            <FieldShell
              as="div"
              label="Wo warst du aktiv?"
              required
              hint="Mehrfachauswahl möglich."
              error={werkbereicheError ?? undefined}
            >
              <ReactSelect<WerkbereichOption, true>
                isMulti
                inputId="eab-werkbereiche"
                options={WERKBEREICH_OPTIONS}
                value={selectedWerkbereichOptions}
                onChange={handleWerkbereicheChange}
                placeholder="Werkbereiche wählen …"
                noOptionsMessage={() => "Alle Bereiche gewählt"}
                classNamePrefix="eab-werkbereiche-select"
                styles={
                  werkbereicheError
                    ? {
                        control: (base) => ({
                          ...base,
                          borderColor: "var(--primary)",
                        }),
                      }
                    : undefined
                }
              />
            </FieldShell>

            <NativeSelect
              id="eab-valid-from"
              label="Beginn"
              required
              className="sm:max-w-[280px]"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              hint="Immer ein Quartalsanfang — nie rückwirkend."
            >
              {quarterStarts.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </NativeSelect>

            <Textarea
              id="eab-reason"
              label="Was hast du ehrenamtlich gemacht?"
              required
              rows={5}
              counter={2000}
              value={reason}
              error={reasonError ?? undefined}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError && event.target.value.trim().length >= 20) {
                  setReasonError(null);
                }
              }}
              placeholder="Ein paar Sätze zu deinem Engagement, damit der Vorstand den Umfang einordnen kann."
            />

            <Notice title="Bei Bewilligung passiert" tone="blau">
              <p>{outcome.summary}</p>
              <p className="knglmrt-num mt-2 text-muted-foreground">
                Gilt vom {formatDate(validFrom)} bis {formatDate(validUntil)} ·{" "}
                {werkbereicheLabel(werkbereiche)}
              </p>
            </Notice>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                kind="primary"
                size="small"
                disabled={submitting}
              >
                {submitting ? "Wird gesendet …" : "Antrag absenden"}
              </Button>
              <Button
                type="button"
                kind="secondary"
                size="small"
                onClick={resetForm}
                disabled={submitting}
              >
                Abbrechen
              </Button>
            </div>

            {formError ? <p className="text-destructive">{formError}</p> : null}
            {formStatus ? <p className="font-bold">{formStatus}</p> : null}
          </form>
        </FormSection>

        <div className="flex flex-col gap-6">
          {/* Beides steht in Campai und ist hier nur lesend. Der Tarif ist die
              Zeile der Entscheidungsmatrix — ob dazu schon eine Karte
              ausgestellt wurde, weiß die App nicht. Der offene Betrag wird bei
              jedem Aufruf frisch geholt, nie gespeichert. */}
          <section className={panelClassName}>
            {/* Gleiche leise Kappe wie über dem Ablauf-Hinweis daneben — die
                Karte trägt Systemwerte, keine Handlung. */}
            <h2 className="knglmrt-caption mb-1 text-[var(--knglmrt-brown-100)]">
              Deine Mitgliedschaft
            </h2>
            <p className="mb-4 text-muted-foreground">
              Letzter Stand aus der Mitgliederverwaltung. Bitte melde dich unter{" "}
              <a
                href="mailto:vorstand@konglomerat.org"
                className="font-bold text-primary"
              >
                vorstand@konglomerat.org
              </a>{" "}
              falls hier etwas nicht stimmt.
            </p>
            <dl className="flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <dt className="text-muted-foreground">Offene Beiträge</dt>
                <dd>
                  {/* Nur ein wirklich offener Betrag soll auffallen. „Nicht
                      abrufbar" ist etwas anderes als „nichts offen" und sagt
                      das auch. */}
                  {context.openBalanceCents === null ? (
                    <Badge tone="neutral">Nicht abrufbar</Badge>
                  ) : context.openBalanceCents > 0 ? (
                    <Badge tone="offen">
                      {formatEuro(context.openBalanceCents)} offen
                    </Badge>
                  ) : (
                    <Badge tone="gebucht">Nichts offen</Badge>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <dt className="text-muted-foreground">
                  Aktuell gewählter Tarif
                </dt>
                <dd className="font-bold">
                  {ACCESS_LEVEL_LABELS[context.access]}
                </dd>
              </div>
            </dl>
          </section>

          <Notice title="Ablauf" tone="rosa">
            <ol className="ml-4 list-decimal space-y-1.5">
              <li>
                Antrag für das kommende Quartal stellen (rückwirkend ist nicht
                möglich)
              </li>
              <li>Der Vorstand entscheidet (Benachrichtigung via Mail)</li>
              <li>
                Bei Zustimmung startet der Bonus automatisch zum nächsten
                Quartalsbeginn und läuft am Quartalsende auch automatisch wieder
                aus
              </li>
            </ol>
          </Notice>
        </div>
      </div>

      <section className={panelClassName}>
        <h2 className="mb-3.5">Meine Anträge</h2>
        {requests.length === 0 ? (
          <p className="text-muted-foreground">
            Du hast noch keinen Ehrenamtsbonus beantragt.
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {requests.map((entry) => {
              const displayStatus = resolveDisplayStatus(entry);
              return (
                <li
                  key={entry.id}
                  className="knglmrt-border-section flex flex-col gap-2 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="knglmrt-card-title">
                      {BONUS_OPTION_LABELS[entry.requestedOption]}
                    </span>
                    <Badge tone={EHRENAMTSBONUS_STATUS_TONES[displayStatus]}>
                      {EHRENAMTSBONUS_STATUS_LABELS[displayStatus]}
                    </Badge>
                  </div>
                  <p className="knglmrt-num text-muted-foreground">
                    {werkbereicheLabel(entry.werkbereiche)} ·{" "}
                    {quarterLabelForDate(entry.validFrom)} ·{" "}
                    {formatDate(entry.validFrom)} –{" "}
                    {formatDate(entry.validUntil)}
                  </p>
                  {entry.decisionNote ? (
                    <p>
                      <span className="knglmrt-caption text-muted-foreground">
                        Vom Vorstand
                      </span>
                      <br />
                      {entry.decisionNote}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
