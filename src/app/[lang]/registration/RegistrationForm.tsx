"use client";

// Der Mitgliedsantrag nach dem Entwurf „Mitgliedsantrag v2": fünf Schritte
// mit einer mitlaufenden Zusammenfassung daneben. Das Formular in Campai hat
// keine eigene Oberfläche — Fragen, Texte und Abhängigkeiten stehen hier,
// geprüft wird mit `validateRegistration`, derselben Funktion, die der
// Server benutzt. „Weiter" bleibt gesperrt, solange im Schritt etwas fehlt.
import { useCallback, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Face from "@/components/knglmrt/Face";
import Field from "@/components/knglmrt/Field";
import { cn } from "@/components/knglmrt/FieldShell";
import Notice from "@/components/knglmrt/Notice";
import {
  ACCESS_TARIFFS,
  ANNUAL_FEE_LABELS,
  ANNUAL_FEE_OPTIONS,
  DOCUMENT_LINKS,
  MISSING,
  REGISTRATION_STEPS,
  SEPA_CREDITOR_ID,
  SEPA_DIRECT_DEBIT_ENABLED,
  TRIAL_FEE_EURO,
  emptyRegistration,
  firstStepWithErrors,
  normalizeIban,
  registrationCosts,
  stepErrors,
  type PaymentMethod,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationInput,
  type RegistrationStep,
  validateRegistration,
} from "@/lib/campai-registration";
import type {
  RegistrationRequest,
  RegistrationResponse,
} from "@/app/api/registration/route";
import SignaturePad, { flattenOnWhite } from "./SignaturePad";

/** Was die Tarifseite per Link vorauswählen kann. */
export type RegistrationPreset = Partial<
  Pick<RegistrationInput, "annualFee" | "trialRate" | "accessTariff" | "entryAt">
>;

/** Schritt 6 ist die Bestätigung nach dem Absenden. */
type Step = RegistrationStep | 6;

/** Platzhalter, solange etwas noch nicht gewählt ist. */
const NOT_CHOSEN = "–";

const SELECTED_EDGE = "shadow-[inset_0_0_0_1px_var(--knglmrt-ink)]";
const HAIRLINE_EDGE = "shadow-[inset_0_0_0_0.5px_var(--knglmrt-dark-30)]";
const RULE = "border-t-[0.5px] border-knglmrt-dark-30";

const formatEuro = (euro: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    euro,
  );

const PAYMENT_OPTIONS: { id: PaymentMethod; name: string; lead: string }[] = [
  ...(SEPA_DIRECT_DEBIT_ENABLED
    ? [
        {
          id: "sepaDirectDebit" as const,
          name: "SEPA-Lastschrift",
          lead: "Wir buchen Beitrag und Karte automatisch ab. Nichts vergessen, nichts überweisen.",
        },
      ]
    : []),
  {
    id: "sepaCreditTransfer",
    name: "Überweisung",
    lead: "Du bekommst für jede Zahlung eine Rechnung per E-Mail und überweist selbst.",
  },
];

// Klicks auf das Kästchen selbst landen schon über dessen <input> — sie
// dürfen nicht noch einmal zur Karte durchgehen, sonst schaltet ein Schalter
// zweimal.
const stop = (event: MouseEvent) => event.stopPropagation();

/** Eine anklickbare Fläche mit Kästchen darin: ausgewählt paper-pink mit Kontur. */
function PickCard({
  selected,
  onPick,
  selectedClassName = "bg-knglmrt-paper-pink",
  idleClassName = "bg-knglmrt-paper-grey",
  className,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  selectedClassName?: string;
  idleClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onPick}
      className={cn(
        "cursor-pointer transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        selected ? cn(selectedClassName, SELECTED_EDGE) : idleClassName,
        className,
      )}
    >
      {children}
    </div>
  );
}

function StepHead({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-[23px] leading-none font-black">
        {title}
      </h2>
      {lead ? (
        <p className="text-[16px] leading-[22px] text-muted-foreground">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("knglmrt-label text-muted-foreground", className)}>
      {children}
    </p>
  );
}

function PlanBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Label className="pb-1.5">{title}</Label>
      {children}
    </div>
  );
}

function PlanLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3 py-2 text-[16px] leading-[22px]",
        RULE,
        strong && "font-bold",
      )}
    >
      <span>{label}</span>
      <span className="font-num font-bold whitespace-nowrap">{value}</span>
    </div>
  );
}

function DocumentLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={stop}
      className="w-fit text-[15px] text-primary underline-offset-2 hover:text-knglmrt-brown-100 hover:underline"
    >
      {children}
    </a>
  );
}

export default function RegistrationForm({
  preset,
}: {
  preset?: RegistrationPreset;
}) {
  const [input, setInput] = useState<RegistrationInput>(() => ({
    ...emptyRegistration(),
    ...preset,
  }));
  const [step, setStep] = useState<Step>(1);
  // Formatfehler zeigt ein Feld erst, wenn man es verlassen hat.
  const [blurred, setBlurred] = useState<ReadonlySet<RegistrationField>>(
    () => new Set(),
  );
  const [serverErrors, setServerErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [website, setWebsite] = useState("");

  const errors = useMemo(() => validateRegistration(input), [input]);
  const costs = registrationCosts(input);
  const directDebit =
    SEPA_DIRECT_DEBIT_ENABLED && input.paymentMethod === "sepaDirectDebit";

  const update = useCallback(
    <K extends RegistrationField>(field: K, value: RegistrationInput[K]) => {
      setInput((current) => ({ ...current, [field]: value }));
      setServerErrors((current) => {
        if (!(field in current)) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    },
    [],
  );

  // Stabil, damit die Unterschriftenfelder ihre Leinwand nicht neu einrichten.
  const setSignature = useCallback(
    (value: string | null) => update("signature", value),
    [update],
  );
  const setSepaSignature = useCallback(
    (value: string | null) => update("sepaSignature", value),
    [update],
  );

  /** Die Meldung, die ein Feld gerade zeigt. Leere Pflichtfelder bleiben still. */
  const shownError = (field: RegistrationField) => {
    if (serverErrors[field]) return serverErrors[field];
    const error = errors[field];
    return error && error !== MISSING && blurred.has(field) ? error : undefined;
  };

  const text = (field: RegistrationField & keyof RegistrationInput) => ({
    id: `field-${field}`,
    value: input[field] as string,
    error: shownError(field),
    onChange: (event: { target: { value: string } }) =>
      update(field, event.target.value as never),
    onBlur: () =>
      setBlurred((current) =>
        current.has(field) ? current : new Set(current).add(field),
      ),
  });

  const missingIn = (n: RegistrationStep) =>
    Object.keys(stepErrors(errors, n)).length;
  const reachable = (n: RegistrationStep) =>
    ([1, 2, 3, 4, 5] as const).every((before) => before >= n || missingIn(before) === 0);
  const missing = step === 6 ? 0 : missingIn(step);

  const goTo = (next: Step) => {
    setStep(next);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      // Campai legt Unterschriften auf weißes Papier; das Feld zeichnet
      // durchsichtig.
      const flat = async (value: string | null) =>
        value ? flattenOnWhite(value) : null;
      const payload: RegistrationInput = {
        ...input,
        signature: await flat(input.signature),
        sepaSignature: directDebit ? await flat(input.sepaSignature) : null,
      };

      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: payload,
          website,
        } satisfies RegistrationRequest),
      });
      const result = (await response.json()) as RegistrationResponse;

      if (!result.ok) {
        const fieldErrors = result.fieldErrors ?? {};
        setServerErrors(fieldErrors);
        setFormError(result.error);
        const back = firstStepWithErrors(fieldErrors);
        if (back && back !== step) setStep(back);
        return;
      }

      goTo(6);
    } catch {
      setFormError(
        "Der Antrag konnte nicht gesendet werden. Bitte prüfe deine Verbindung und versuche es noch einmal.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === 6 || missing > 0) return;
    if (step === 5) void submit();
    else goTo((step + 1) as Step);
  };

  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const tariff = costs.tariff;
  const fee = input.annualFee;
  const nextYear = costs.year + 1;
  const tariffColor =
    tariff?.kind === "abo"
      ? "text-primary"
      : tariff?.kind === "once"
        ? "text-knglmrt-brown-100"
        : "text-foreground";
  const ibanTail = normalizeIban(input.iban).slice(-4);
  const place = `${input.city.trim() || "Ort"}, ${new Date().toLocaleDateString("de-DE")}`;

  const consents: {
    field: "statutesAccepted" | "feeRulesAccepted";
    title: string;
    text: string;
    links: { href: string; label: string }[];
  }[] = [
    {
      field: "statutesAccepted",
      title: "Satzung",
      text: "Die Regeln des Vereins: Rechte und Pflichten als Mitglied, Kündigung zum Quartalsende.",
      links: [{ href: DOCUMENT_LINKS.statutes, label: "Satzung lesen (PDF)" }],
    },
    {
      field: "feeRulesAccepted",
      title: "Beitragsordnung",
      text: "Wie hoch die Beiträge sind und wann sie fällig werden.",
      links: [
        { href: DOCUMENT_LINKS.feeRules, label: "Beitragsordnung lesen (PDF)" },
      ],
    },
  ];

  const signatures = [
    {
      key: "signature" as const,
      title: "Mitgliedsantrag",
      signer: fullName || "Antragsteller:in",
      text: "Ich beantrage die Mitgliedschaft im Konglomerat e.V. und erkenne Satzung und Beitragsordnung an.",
      onChange: setSignature,
    },
    ...(directDebit
      ? [
          {
            key: "sepaSignature" as const,
            title: "SEPA-Lastschriftmandat",
            signer: input.accountHolder.trim() || "Kontoinhaber:in",
            text: `Ich ermächtige den Konglomerat e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. Gläubiger-ID ${SEPA_CREDITOR_ID}, Mandatsreferenz folgt per E-Mail.`,
            onChange: setSepaSignature,
          },
        ]
      : []),
  ];

  // Der Zahlplan in Schritt 3 — Beitrag und Karte sind dann gewählt.
  // Sofort fällig: der anteilige Jahresbeitrag bis Jahresende (beim
  // Schnuppertarif abzüglich der Differenz), dazu der Beitrittsmonat des Abos
  // oder die 10er-Karte. Danach das Abo monatlich und, nach dem
  // Schnupperjahr, der volle gewählte Beitrag.
  const monthName = (offset: number) =>
    new Date(costs.year, costs.monthIndex + offset, 1).toLocaleDateString(
      "de-DE",
      { month: "long", year: "numeric" },
    );
  const proratedFee = fee !== null ? (fee * costs.quartersLeft) / 4 : 0;
  const trialDiscount =
    input.trialRate && fee !== null
      ? ((fee - TRIAL_FEE_EURO) * costs.quartersLeft) / 4
      : 0;
  const immediate = [
    {
      label: `Jahresbeitrag ${costs.year} · anteilig ab ${costs.quarterLabel} (${costs.quartersLeft} von 4 Quartalen)`,
      amount: proratedFee,
    },
    ...(trialDiscount
      ? [
          {
            label: `Abzug Schnuppertarif (${TRIAL_FEE_EURO} € statt ${fee} € im Beitrittsjahr)`,
            amount: -trialDiscount,
          },
        ]
      : []),
    ...(tariff?.kind === "abo"
      ? [{ label: `${tariff.name} · ${monthName(0)}`, amount: tariff.euro }]
      : []),
    ...(tariff?.kind === "once"
      ? [{ label: `${tariff.name} · einmalig`, amount: tariff.euro }]
      : []),
  ];
  const immediateTotal = immediate.reduce((sum, line) => sum + line.amount, 0);
  const signedEuro = (euro: number) =>
    euro < 0 ? `− ${formatEuro(-euro)}` : formatEuro(euro);

  // „Dein Antrag" folgt den Schritten. Beitrag, Karte und Zahlung zeigen die
  // getroffene Auswahl; Adresse, Kontakt, Rechtliches und Unterschriften
  // haken sich ab, sobald sie vollständig sind. Solange nichts da ist, steht
  // rechts „–".
  const complete = (...fields: RegistrationField[]) =>
    fields.every((field) => !errors[field]);
  const acceptedCount = [
    input.statutesAccepted,
    input.feeRulesAccepted,
  ].filter(Boolean).length;
  const signedCount = signatures.filter(
    (signature) => input[signature.key],
  ).length;
  const address = [
    input.street.trim(),
    [input.zip.trim(), input.city.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const contact = [
    input.email.trim(),
    input.mobilePhone.trim(),
    input.phone.trim(),
  ]
    .filter(Boolean)
    .join(" · ");

  const checklist: ({ label: string; sub?: string } & (
    | { value: string | null; valueClassName?: string }
    | { done: boolean }
  ))[] = [
    {
      label: "Adresse",
      sub: address || undefined,
      done: complete("street", "zip", "city"),
    },
    {
      label: "Kontakt",
      sub: contact || undefined,
      done: complete("firstName", "lastName", "email", "phone", "mobilePhone"),
    },
    {
      label: "Jahresbeitrag",
      sub: input.trialRate ? "Schnuppertarif im ersten Jahr" : undefined,
      value: fee !== null ? `${ANNUAL_FEE_LABELS[fee]} · ${fee} €` : null,
    },
    {
      label: "Zugangskarte",
      sub: tariff?.lead,
      value: tariff?.name ?? null,
      valueClassName: tariffColor,
    },
    {
      label: "Zahlung",
      sub:
        directDebit && !errors.iban ? `IBAN …${ibanTail}` : undefined,
      value: !input.paymentMethod
        ? null
        : directDebit
          ? "Lastschrift"
          : "Überweisung",
    },
    {
      label: "Rechtliches",
      sub: acceptedCount ? `${acceptedCount} von 2 bestätigt` : undefined,
      done: complete("statutesAccepted", "feeRulesAccepted"),
    },
    {
      label: "Unterschriften",
      sub: signedCount
        ? `${signedCount} von ${signatures.length} unterschrieben`
        : undefined,
      done: complete("signature", "sepaSignature"),
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      {step !== 6 ? (
        <nav aria-label="Schritte" className="grid grid-cols-5 gap-1.5">
          {REGISTRATION_STEPS.map((label, index) => {
            const n = (index + 1) as RegistrationStep;
            const current = n === step;
            const done = n < step;
            const canGo = reachable(n);
            return (
              <button
                key={label}
                type="button"
                onClick={() => canGo && goTo(n)}
                disabled={!canGo}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2.5 py-2.5 text-left disabled:cursor-default",
                  current
                    ? "border-b-2 border-primary"
                    : "border-b-[0.5px] border-knglmrt-dark-30",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 flex-none items-center justify-center font-num text-[16px] font-bold",
                    current
                      ? "bg-primary text-white"
                      : done
                        ? "bg-foreground text-background"
                        : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--knglmrt-dark-30)]",
                  )}
                >
                  {n}
                </span>
                {/* Auf dem Telefon nennt die Überschrift des Schritts ihn. */}
                <span
                  className={cn(
                    "hidden min-w-0 text-[16px] leading-5 md:inline",
                    current
                      ? "font-bold text-foreground"
                      : done
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="flex min-w-0 flex-col gap-6">
          {step === 2 ? (
            <div className="flex flex-col gap-[26px]">
              <StepHead
                title="Beitrag & Zugangskarte"
                lead="Den Jahresbeitrag wählst du selbst — je nachdem, was du zahlen kannst."
              />

              <div className="flex flex-col gap-2.5">
                <Label>Jahresbeitrag</Label>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {ANNUAL_FEE_OPTIONS.map((fee) => {
                    const selected = input.annualFee === fee;
                    return (
                      <PickCard
                        key={fee}
                        selected={selected}
                        onPick={() => update("annualFee", fee)}
                        className="flex flex-col gap-2.5 px-4 pt-4 pb-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Label>{ANNUAL_FEE_LABELS[fee]}</Label>
                          <span onClick={stop} className="contents">
                            <Choice
                              kind="radio"
                              name="annualFee"
                              aria-label={ANNUAL_FEE_LABELS[fee]}
                              checked={selected}
                              onChange={() => update("annualFee", fee)}
                            />
                          </span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="font-num text-[25px] leading-none font-bold text-primary">
                            {fee} €
                          </span>
                          <span className="text-[15px] text-muted-foreground">
                            pro Jahr
                          </span>
                        </div>
                        <span className="font-num text-[15px] text-muted-foreground">
                          {formatEuro(fee / 4)} / Quartal
                        </span>
                      </PickCard>
                    );
                  })}
                </div>
                <p className="text-[15px] leading-[21px] text-pretty text-muted-foreground">
                  Alle drei Beträge bringen dir genau dasselbe. Wer mehr geben
                  kann, trägt die mit, die gerade weniger können.
                </p>
                <PickCard
                  selected={input.trialRate}
                  onPick={() => update("trialRate", !input.trialRate)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold">
                        Schnuppertarif im ersten Jahr
                      </span>
                      <Badge tone="neu">{TRIAL_FEE_EURO} € / Jahr</Badge>
                    </div>
                    <p className="text-[15px] leading-[21px] text-pretty">
                      Im Beitrittsjahr zahlst du nur {TRIAL_FEE_EURO} €. Ab{" "}
                      {nextYear} gilt automatisch dein gewählter Beitrag
                      {fee !== null ? ` (${fee} €)` : ""}.
                    </p>
                  </div>
                  <span onClick={stop} className="contents">
                    <Choice
                      kind="switch"
                      aria-label="Schnuppertarif"
                      checked={input.trialRate}
                      onChange={(event) => update("trialRate", event.target.checked)}
                    />
                  </span>
                </PickCard>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="pb-1">Zugangskarte · optional</Label>
                {ACCESS_TARIFFS.map((option) => {
                  const selected = input.accessTariff === option.id;
                  return (
                    <PickCard
                      key={option.id}
                      selected={selected}
                      onPick={() => update("accessTariff", option.id)}
                      selectedClassName={
                        option.kind === "once"
                          ? "bg-knglmrt-yellow-30"
                          : "bg-knglmrt-paper-pink"
                      }
                      idleClassName={cn("bg-card", HAIRLINE_EDGE)}
                      className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3.5 py-3 pr-4 pl-3.5"
                    >
                      <span onClick={stop} className="contents">
                        <Choice
                          kind="radio"
                          name="accessTariff"
                          aria-label={option.name}
                          checked={selected}
                          onChange={() => update("accessTariff", option.id)}
                        />
                      </span>
                      <div className="flex min-w-0 flex-col gap-[3px]">
                        <span className="text-[17px] leading-[22px] font-bold">
                          {option.name}
                        </span>
                        <span className="text-[15px] leading-[21px] text-muted-foreground">
                          {option.lead}
                        </span>
                      </div>
                      <div className="flex min-w-[90px] flex-col items-end gap-0.5">
                        <span
                          className={cn(
                            "font-num text-[18px] leading-none font-bold",
                            option.kind === "abo"
                              ? "text-primary"
                              : option.kind === "once"
                                ? "text-knglmrt-brown-100"
                                : "text-foreground",
                          )}
                        >
                          {option.euro} €
                        </span>
                        <span className="text-[14px] leading-[18px] text-muted-foreground">
                          {option.kind === "abo"
                            ? "pro Monat"
                            : option.kind === "once"
                              ? "einmalig"
                              : "kein Beitrag"}
                        </span>
                      </div>
                    </PickCard>
                  );
                })}
                <p className="text-[15px] leading-[21px] text-muted-foreground">
                  Enthalten ist nur der Zugang. Einweisungen und
                  Maschinengebühren je nach Werkbereich.
                </p>
              </div>

              <Field
                id="field-entryAt"
                label="Beitritt am"
                kind="mono"
                type="date"
                className="max-w-[260px]"
                value={input.entryAt}
                error={shownError("entryAt")}
                hint={`Jahresbeitrag anteilig ab ${costs.quarterLabel} ${costs.year} · ${costs.quartersLeft} × ${costs.firstYearFee !== null ? formatEuro(costs.firstYearFee / 4) : "pro Quartal"}`}
                onChange={(event) => {
                  if (event.target.value) update("entryAt", event.target.value);
                }}
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-[18px]">
              <StepHead
                title="Persönliche Daten"
                lead="Brauchen wir für die Mitgliederliste und deine Zugangskarte."
              />
              <div className="grid items-start gap-x-3.5 gap-y-4 sm:grid-cols-2">
                <Field
                  label="Vorname"
                  autoComplete="given-name"
                  maxLength={100}
                  {...text("firstName")}
                />
                <Field
                  label="Nachname"
                  autoComplete="family-name"
                  maxLength={100}
                  {...text("lastName")}
                />
                <Field
                  label="E-Mail"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  hint="Hierhin schicken wir die Bestätigung."
                  className="sm:col-span-2"
                  {...text("email")}
                />
                <Field
                  label="Mobil (optional)"
                  kind="mono"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  {...text("mobilePhone")}
                />
                <Field
                  label="Festnetz (optional)"
                  kind="mono"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  {...text("phone")}
                />
                <Field
                  label="Straße und Hausnummer"
                  autoComplete="address-line1"
                  maxLength={45}
                  className="sm:col-span-2"
                  {...text("street")}
                />
                <Field
                  label="PLZ"
                  kind="mono"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  maxLength={10}
                  {...text("zip")}
                />
                <Field
                  label="Ort"
                  autoComplete="address-level2"
                  maxLength={44}
                  {...text("city")}
                />
              </div>
              {/* Informationspflicht nach Art. 13 DSGVO — dort, wo die Daten
                  erhoben werden, ohne eigene Zustimmung. */}
              <section className={cn("flex flex-col gap-1.5 pt-3", RULE)}>
                <h3 className="knglmrt-label text-muted-foreground">Datenschutz</h3>
                <p className="text-[15px] leading-[21px] text-pretty text-muted-foreground">
                  Wir verarbeiten deine Angaben, um deine Mitgliedschaft nach
                  Satzung und Beitragsordnung zu führen (Art. 6 Abs. 1 lit. b
                  DSGVO). Dafür nutzen wir die Vereinssoftware campai, für
                  Türkarten zusätzlich unser Schließsystem Roseguarden. Name,
                  Anschrift und E-Mail-Adresse sind erforderlich, die
                  Telefonnummer ist freiwillig. Deine Daten speichern wir bis
                  zum Ende der Mitgliedschaft, Buchhaltungsunterlagen nach den
                  gesetzlichen Aufbewahrungsfristen. Alle Details und deine
                  Rechte findest du in unserer{" "}
                  <a
                    href={DOCUMENT_LINKS.privacyPolicy}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:text-knglmrt-brown-100 hover:underline"
                  >
                    Datenschutzerklärung
                  </a>
                  .
                </p>
              </section>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-[18px]">
              <StepHead
                title="Zahlung"
                lead="Derzeit bieten wir nur folgende Zahlungsmöglichkeiten an:"
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((option) => {
                  const selected = input.paymentMethod === option.id;
                  return (
                    <PickCard
                      key={option.id}
                      selected={selected}
                      onPick={() => update("paymentMethod", option.id)}
                      className="flex flex-col gap-2 px-4 py-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[17px] font-bold">{option.name}</span>
                        <span onClick={stop} className="contents">
                          <Choice
                            kind="radio"
                            name="paymentMethod"
                            aria-label={option.name}
                            checked={selected}
                            onChange={() => update("paymentMethod", option.id)}
                          />
                        </span>
                      </div>
                      <span className="text-[15px] leading-[21px] text-pretty text-muted-foreground">
                        {option.lead}
                      </span>
                    </PickCard>
                  );
                })}
              </div>
              {directDebit ? (
                <div className="grid items-start gap-x-3.5 gap-y-4 sm:grid-cols-2">
                  <Field
                    label="Kontoinhaber:in"
                    autoComplete="name"
                    maxLength={100}
                    {...text("accountHolder")}
                  />
                  <Field
                    label="IBAN"
                    kind="mono"
                    autoComplete="off"
                    maxLength={42}
                    hint={
                      !input.iban
                        ? "Leerzeichen sind egal."
                        : errors.iban
                          ? undefined
                          : "Sieht gut aus."
                    }
                    {...text("iban")}
                  />
                </div>
              ) : null}
              <PlanBlock
                title={
                  directDebit
                    ? "Das buchen wir nach deinem Antrag ab"
                    : "Das stellen wir dir nach deinem Antrag in Rechnung"
                }
              >
                {immediate.map((line) => (
                  <PlanLine
                    key={line.label}
                    label={line.label}
                    value={signedEuro(line.amount)}
                  />
                ))}
                <PlanLine label="Summe" value={formatEuro(immediateTotal)} strong />
              </PlanBlock>

              {tariff?.kind === "abo" ? (
                <PlanBlock title="Danach monatlich">
                  <PlanLine
                    label={`${tariff.name} · ab ${monthName(1)}`}
                    value={`${formatEuro(tariff.euro)} / Monat`}
                  />
                  <p className="pt-2 text-[15px] leading-[21px] text-pretty text-muted-foreground">
                    {directDebit ? (
                      "Buchen wir jeden Monat ab."
                    ) : (
                      <>
                        Bitte richte dafür einen Dauerauftrag ein mit dem
                        Verwendungszweck{" "}
                        <span className="font-num font-bold text-foreground">
                          Monatsmehrbeitrag {fullName}
                        </span>
                        .
                      </>
                    )}
                  </p>
                </PlanBlock>
              ) : null}

              {input.trialRate && fee !== null ? (
                <PlanBlock title={`Ab 1.1.${nextYear}`}>
                  <PlanLine
                    label={`Jahresbeitrag ${ANNUAL_FEE_LABELS[fee]} — dein Schnuppertarif endet, der Beitrag steigt automatisch von ${TRIAL_FEE_EURO} € auf ${fee} €`}
                    value={`${formatEuro(fee)} / Jahr`}
                  />
                </PlanBlock>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col gap-[18px]">
              <StepHead title="Satzung & Beitragsordnung" />
              {consents.map((consent) => {
                const on = input[consent.field];
                return (
                  <PickCard
                    key={consent.field}
                    selected={on}
                    onPick={() => update(consent.field, !on)}
                    className="grid grid-cols-[22px_minmax(0,1fr)] gap-3 px-4 py-3.5"
                  >
                    <span onClick={stop} className="pt-0.5">
                      <Choice
                        aria-label={consent.title}
                        checked={on}
                        onChange={(event) =>
                          update(consent.field, event.target.checked)
                        }
                      />
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] leading-[22px] font-bold">
                          {consent.title}
                        </span>
                        <Badge tone={on ? "gebucht" : "wartet"}>
                          {on ? "erledigt" : "Pflicht"}
                        </Badge>
                      </div>
                      <p className="text-[16px] leading-[22px] text-pretty">
                        {consent.text}
                      </p>
                      {consent.links.length > 0 ? (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {consent.links.map((link) => (
                            <DocumentLink key={link.href} href={link.href}>
                              {link.label}
                            </DocumentLink>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </PickCard>
                );
              })}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="flex flex-col gap-[18px]">
              <StepHead
                title="Unterschriften"
                lead="Mit Finger, Maus oder Stift ins Feld unterschreiben."
              />
              {signatures.map((signature) => (
                <div key={signature.key} className="flex flex-col gap-3">
                  <SignaturePad
                    title={signature.title}
                    place={place}
                    text={signature.text}
                    signer={signature.signer}
                    value={input[signature.key]}
                    onChange={signature.onChange}
                  />
                  {serverErrors[signature.key] ? (
                    <p className="text-[16px] leading-[22px] text-primary">
                      {serverErrors[signature.key]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="flex flex-col gap-[18px] bg-knglmrt-paper-pink p-7">
              <div className="flex gap-1.5">
                {[2, 11, 19].map((number) => (
                  <Face key={number} number={number} size={56} title="" />
                ))}
              </div>
              <p className="knglmrt-label">Vielen Dank</p>
              <h2 className="font-display text-[32px] leading-none font-black text-primary">
                Antrag ist da{input.firstName.trim() ? `, ${input.firstName.trim()}` : ""}.
              </h2>
              <p className="max-w-[520px] text-[16px] leading-[22px] text-pretty">
                Der Vorstand prüft deinen Antrag und bestätigt deine
                Mitgliedschaft, meistens innerhalb einer Woche. Wir melden uns
                an {input.email.trim() || "deine E-Mail-Adresse"}.
              </p>
              <ol className="flex flex-col">
                {[
                  directDebit
                    ? "Bestätigung per E-Mail, mit deiner Mandatsreferenz"
                    : "Bestätigung per E-Mail, mit der ersten Rechnung",
                  !tariff || tariff.kind === "none"
                    ? "Komm zur offenen Werkstatt vorbei und sag Hallo"
                    : "Zugangskarte bei der nächsten offenen Werkstatt abholen",
                  "Einweisungen für die Maschinen buchen, die du nutzen willst",
                ].map((line, index) => (
                  <li
                    key={line}
                    className={cn(
                      "grid grid-cols-[28px_minmax(0,1fr)] gap-2 py-2 text-[16px] leading-[22px]",
                      RULE,
                    )}
                  >
                    <span className="font-num text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[15px] leading-[21px] text-muted-foreground">
                sagen die vielen Gesichter des Konglomerat e.V.
              </p>
            </div>
          ) : null}

          {formError ? (
            <Notice tone="rosa" title="Noch nicht gesendet">
              {formError}
            </Notice>
          ) : null}

          {/* Für Bots sichtbar, für Menschen nicht. */}
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px overflow-hidden"
          >
            <label>
              Website
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </div>

          {step !== 6 ? (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-4 pt-2",
                RULE,
              )}
            >
              <Button
                kind="quiet"
                disabled={step === 1 || submitting}
                onClick={() => goTo((step - 1) as Step)}
              >
                Zurück
              </Button>
              <div className="flex flex-wrap items-center justify-end gap-3.5">
                {missing > 0 ? (
                  <span className="text-[15px] text-muted-foreground">
                    {missing === 1
                      ? "Noch 1 Angabe fehlt"
                      : `Noch ${missing} Angaben fehlen`}
                  </span>
                ) : null}
                <Button
                  kind="emphasis"
                  disabled={missing > 0}
                  loading={submitting}
                  onClick={next}
                >
                  {step === 5 ? "Antrag absenden" : "Weiter"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="flex flex-col gap-3.5 bg-knglmrt-paper-pink px-[22px] pt-6 pb-[22px] lg:sticky lg:top-4">
          <p className="knglmrt-caption text-muted-foreground">
            Dein Antrag
          </p>
          {fullName ? (
            <p className="font-hand text-[22px] leading-[1.2] tracking-[.06em]">
              {fullName}
            </p>
          ) : null}
          <dl className="flex flex-col">
            {checklist.map((row) => (
              <div
                key={row.label}
                className={cn("flex justify-between gap-3 py-2", RULE)}
              >
                <dt className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[16px] leading-[22px] font-bold">
                    {row.label}
                  </span>
                  {row.sub ? (
                    <span className="text-[14px] leading-[18px] break-words text-muted-foreground">
                      {row.sub}
                    </span>
                  ) : null}
                </dt>
                <dd
                  className={cn(
                    "font-num text-[16px] font-bold whitespace-nowrap",
                    "value" in row && row.value
                      ? (row.valueClassName ?? "text-foreground")
                      : "text-foreground",
                  )}
                >
                  {"done" in row ? (
                    row.done ? (
                      <>
                        <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                        <span className="sr-only">erledigt</span>
                      </>
                    ) : (
                      NOT_CHOSEN
                    )
                  ) : (
                    (row.value ?? NOT_CHOSEN)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
