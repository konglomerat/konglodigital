"use client";

// src/app/[lang]/monatsbeitrag/TariffChangeDialog.tsx — Bestätigung und
// Ergebnis des Tarifwechsels.
//
// Zwei Schritte im selben Rahmen: erst was passiert (ab wann, was es kostet,
// wie gezahlt wird, ob eine Karte dazukommt), dann was das Mitglied jetzt tun
// muss — beim Abo per Überweisung die Bankdaten samt Verwendungszweck für den
// Dauerauftrag, bei der 10er Karte der Hinweis auf die Rechnung in der Mail.
import { useState } from "react";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Dialog from "@/components/knglmrt/Dialog";
import Notice from "@/components/knglmrt/Notice";
import type { AccountTariffChangeResponse } from "@/app/api/account/tariff/route";
import type { CampaiAccessTariff } from "@/lib/campai-plans";
import type {
  TariffChangeResult,
  TariffChangeState,
  TariffPaymentMethod,
} from "@/lib/campai-tariff-change";

export const TARIFF_TITLES: Record<CampaiAccessTariff, string> = {
  keiner: "Keine Karte",
  abo_klein: "Abo Klein",
  abo_gross: "Abo Groß",
  punktekarte: "10er Karte",
};

const PAYMENT_LABELS: Record<
  TariffPaymentMethod,
  { label: string; hint: string }
> = {
  sepaCreditTransfer: {
    label: "Überweisung",
    hint: "Per Dauerauftrag — die Bankdaten bekommst du gleich im Anschluss.",
  },
  sepaDirectDebit: {
    label: "Lastschrift",
    hint: "Über dein bestehendes SEPA-Mandat, du musst nichts weiter tun.",
  },
};

const isAbo = (tariff: CampaiAccessTariff) =>
  tariff === "abo_klein" || tariff === "abo_gross";

export const formatDay = (isoDate: string | null | undefined) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
};

export const formatCents = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const formatIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();

/** Was die Taste im Dialog sagt — dieselbe Sprache wie auf der Seite. */
const confirmLabel = (
  target: CampaiAccessTariff,
  current: CampaiAccessTariff,
  onlyCard: boolean,
) => {
  if (onlyCard) return "Karte beantragen";
  if (target === "punktekarte") return "Kostenpflichtig bestellen";
  if (target === "keiner") return "Abo beenden";
  return isAbo(current) ? "Tarif wechseln" : "Abo abschließen";
};

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="knglmrt-num break-all">{value}</span>
      <Button
        type="button"
        kind="ghost"
        size="chip"
        iconOnly
        icon={faCopy}
        aria-label={`${label} kopieren`}
        className="-my-1"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      />
      {copied ? (
        <span role="status" className="text-sm text-muted-foreground">
          kopiert
        </span>
      ) : null}
    </span>
  );
}

function Facts({
  rows,
}: {
  rows: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border py-2"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type TariffChangeDialogProps = {
  open: boolean;
  target: CampaiAccessTariff;
  state: TariffChangeState;
  email: string | null;
  onClose: () => void;
  /** Nach einem Wechsel — die Seite lädt den Stand neu. */
  onChanged: () => void;
};

export default function TariffChangeDialog({
  open,
  target,
  state,
  email,
  onClose,
  onChanged,
}: TariffChangeDialogProps) {
  const { current } = state;
  const onlyCard = target === current && target !== "punktekarte";
  const abo = isAbo(target) && !onlyCard;
  const endsAbo = isAbo(current) && !onlyCard && target !== current;
  const price = state.prices[target];
  const cardOpen = state.cardRequestedAt !== null;
  const canRequestCard = target !== "keiner" && !cardOpen;

  const [paymentMethod, setPaymentMethod] = useState<TariffPaymentMethod>(
    state.paymentMethods[0] ?? "sepaCreditTransfer",
  );
  const [requestCard, setRequestCard] = useState(onlyCard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TariffChangeResult | null>(null);

  const close = () => {
    if (busy) return;
    if (result) onChanged();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/tariff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          paymentMethod: abo ? paymentMethod : null,
          requestCard: canRequestCard && requestCard,
        }),
      });
      const data = (await response.json()) as AccountTariffChangeResponse;
      if (!response.ok || !data.result) {
        throw new Error(data.error ?? "Der Wechsel hat nicht geklappt.");
      }
      setResult(data.result);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Der Wechsel hat nicht geklappt.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Dialog
        open={open}
        title={onlyCard ? "Karte beantragt" : "Erledigt"}
        width={560}
        onCancel={close}
        actions={
          <Button type="button" kind="primary" onClick={close}>
            Fertig
          </Button>
        }
      >
        <TariffChangeDone result={result} email={email} onlyCard={onlyCard} />
      </Dialog>
    );
  }

  const facts: { label: string; value: React.ReactNode }[] = [];
  if (!onlyCard) {
    facts.push({
      label: "Wechsel",
      value: `${TARIFF_TITLES[current]} → ${TARIFF_TITLES[target]}`,
    });
  }
  if (abo) {
    facts.push({ label: "Beginnt am", value: formatDay(state.nextChangeDate) });
    if (price) {
      facts.push({ label: "Beitrag", value: `${formatCents(price)} im Monat` });
    }
  }
  if (endsAbo) {
    facts.push({
      label: `${TARIFF_TITLES[current]} läuft bis`,
      value: formatDay(state.currentQuarterEnd),
    });
  }
  if (target === "punktekarte" && price) {
    facts.push({ label: "Preis", value: `${formatCents(price)} einmalig` });
  }

  return (
    <Dialog
      open={open}
      title={onlyCard ? "Zugangskarte beantragen" : `${TARIFF_TITLES[target]} buchen`}
      width={560}
      onCancel={close}
      actions={
        <>
          <Button type="button" kind="secondary" disabled={busy} onClick={close}>
            Abbrechen
          </Button>
          <Button
            type="button"
            kind={target === "keiner" ? "danger-primary" : "primary"}
            loading={busy}
            disabled={busy || (onlyCard && !requestCard)}
            onClick={() => void submit()}
          >
            {confirmLabel(target, current, onlyCard)}
          </Button>
        </>
      }
    >
      {facts.length > 0 ? <Facts rows={facts} /> : null}

      {abo ? (
        <p className="text-muted-foreground">
          Laut Beitragsordnung ändert sich der Beitrag nur zum Quartalsende —
          danach ist der nächste Wechsel erst wieder im folgenden Quartal
          möglich.
        </p>
      ) : null}
      {target === "keiner" && !onlyCard ? (
        <p className="text-muted-foreground">
          Ab dem {formatDay(state.nextChangeDate)} zahlst du keinen
          Monatsmehrbeitrag mehr und kommst nicht mehr selbständig rein.
        </p>
      ) : null}
      {target === "punktekarte" ? (
        <p className="text-muted-foreground">
          Die Rechnung geht gleich per Mail
          {email ? (
            <>
              {" "}
              an <span className="font-bold text-foreground">{email}</span>
            </>
          ) : null}
          . Die 10 Tage sind ab heute 12 Monate gültig.
          {endsAbo
            ? ` Dein ${TARIFF_TITLES[current]} endet zum ${formatDay(state.currentQuarterEnd)}.`
            : ""}
        </p>
      ) : null}

      {abo ? (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="knglmrt-label mb-2 text-muted-foreground">
            Zahlungsweise
          </legend>
          {state.paymentMethods.map((method) => (
            <Choice
              key={method}
              kind="radio"
              name="zahlungsweise"
              value={method}
              checked={paymentMethod === method}
              onChange={() => setPaymentMethod(method)}
              label={PAYMENT_LABELS[method].label}
              hint={PAYMENT_LABELS[method].hint}
            />
          ))}
        </fieldset>
      ) : null}

      {target !== "keiner" ? (
        cardOpen ? (
          <p className="text-muted-foreground">
            Deine Zugangskarte hast du am {formatDay(state.cardRequestedAt)}{" "}
            beantragt — wir melden uns, sobald sie bereitliegt.
          </p>
        ) : (
          <Choice
            kind="checkbox"
            checked={requestCard}
            onChange={(event) => setRequestCard(event.target.checked)}
            label="Ich habe noch keine Zugangskarte"
            hint="Wir stellen dir eine aus und melden uns, sobald du sie abholen kannst."
          />
        )
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function TariffChangeDone({
  result,
  email,
  onlyCard,
}: {
  result: TariffChangeResult;
  email: string | null;
  onlyCard: boolean;
}) {
  const { target, transfer } = result;

  return (
    <>
      {!onlyCard && isAbo(target) ? (
        <p>
          Dein <span className="font-bold">{TARIFF_TITLES[target]}</span>{" "}
          beginnt am {formatDay(result.effectiveFrom)}.
          {result.previousEndsAt
            ? ` Dein bisheriges Abo läuft bis zum ${formatDay(result.previousEndsAt)}.`
            : ""}
          {transfer ? "" : " Der Beitrag wird monatlich per Lastschrift eingezogen."}
        </p>
      ) : null}

      {transfer ? (
        <>
          <Facts
            rows={[
              { label: "Empfänger", value: transfer.bank.recipient },
              {
                label: "IBAN",
                value: (
                  <CopyValue
                    label="IBAN"
                    value={formatIban(transfer.bank.iban)}
                  />
                ),
              },
              ...(transfer.bank.bic
                ? [{ label: "BIC", value: transfer.bank.bic }]
                : []),
              ...(transfer.bank.bankName
                ? [{ label: "Bank", value: transfer.bank.bankName }]
                : []),
              {
                label: "Betrag",
                value: `${formatCents(transfer.amountCents)} im Monat`,
              },
              {
                label: "Verwendungszweck",
                value: (
                  <CopyValue label="Verwendungszweck" value={transfer.purpose} />
                ),
              },
            ]}
          />
          <Notice tone="gelb" title="Dauerauftrag einrichten">
            Richte bei deiner Bank einen monatlichen Dauerauftrag ein, erstmals
            zum {formatDay(transfer.firstDueOn)}. Nimm genau diesen
            Verwendungszweck — dann können wir deine Zahlung zuordnen.
          </Notice>
        </>
      ) : null}

      {target === "punktekarte" ? (
        <p>
          Deine 10er Karte ist gebucht.{" "}
          {result.invoiceSent ? (
            <>
              Die Rechnung ist per Mail unterwegs
              {email ? (
                <>
                  {" "}
                  an <span className="font-bold">{email}</span>
                </>
              ) : null}
              . Überweise bitte mit der Rechnungsnummer als Verwendungszweck —
              dann wird deine Zahlung automatisch zugeordnet.
            </>
          ) : (
            "Die Rechnung kommt in den nächsten Tagen per Mail — überweise dann bitte mit der Rechnungsnummer als Verwendungszweck."
          )}
          {result.previousEndsAt
            ? ` Dein Abo endet zum ${formatDay(result.previousEndsAt)}.`
            : ""}
        </p>
      ) : null}

      {target === "keiner" && !onlyCard ? (
        <p>
          Dein Abo endet zum {formatDay(result.previousEndsAt)}. Danach zahlst
          du keinen Monatsmehrbeitrag mehr.
        </p>
      ) : null}

      {result.cardRequested ? (
        <p>
          Deine Zugangskarte ist beantragt. Wir melden uns, sobald du sie
          abholen kannst.
        </p>
      ) : null}
    </>
  );
}
