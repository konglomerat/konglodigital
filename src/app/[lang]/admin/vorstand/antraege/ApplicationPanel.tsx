"use client";

// Das Detailpanel eines Antrags rechts neben der Liste. Vor der Entscheidung:
// Antragsdaten mit Annehmen, Rückfrage und Ablehnen. Danach steht oben die
// Aufnahme als Checkliste — Rechnung freigeben, Roseguarden, Zahlung,
// Zugangskarte — bis aus dem Antrag ein Mitglied geworden ist.
import { useState, type ReactNode } from "react";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Dialog from "@/components/knglmrt/Dialog";
import Face from "@/components/knglmrt/Face";
import Field from "@/components/knglmrt/Field";
import Notice from "@/components/knglmrt/Notice";
import Textarea from "@/components/knglmrt/Textarea";
import type { RegistrationErrors } from "@/lib/campai-registration";
import {
  inquiryDraft,
  rejectionDraft,
} from "@/lib/membership-applications/mail-texts";
import {
  STATUS_LABELS,
  STATUS_TONES,
  changedFields,
  describeAccess,
  describeAddress,
  describeFee,
  describePayment,
  formatDate,
  formatEuro,
  formatEuroCents,
  initials,
  isOnboarding,
  isUndecided,
  onboardingItems,
  type ApplicationData,
  type ApplicationInvoice,
  type ChecklistEntry,
  type ChecklistStep,
  type HistoryEntry,
  type MembershipApplication,
  type OnboardingItem,
} from "@/lib/membership-applications/types";

import ApplicationEditForm from "./ApplicationEditForm";

export type PanelAction =
  | { action: "accept" }
  | { action: "release" }
  | { action: "complete" }
  | { action: "inquiry"; text: string }
  | { action: "reject"; reason: string; mailText: string | null }
  | {
      action: "check";
      step: ChecklistStep;
      done: boolean;
      cardNumber?: string;
    };

type Props = {
  application: MembershipApplication;
  invoice: ApplicationInvoice | null;
  invoiceError: string | null;
  busy: boolean;
  actionError: string | null;
  fieldErrors: RegistrationErrors;
  onAction: (action: PanelAction) => Promise<boolean>;
  onSave: (data: ApplicationData) => Promise<boolean>;
};

const PAYMENT_LABELS: Record<ApplicationInvoice["paymentStatus"], string> = {
  unpaid: "offen",
  partial: "teilweise bezahlt",
  paid: "bezahlt",
};

/** Ein Satz je Eintrag, wie im grauen Kasten unten im Panel. */
const describeHistory = (entry: HistoryEntry): ReactNode => {
  const by = entry.by ? ` von ${entry.by}` : "";
  switch (entry.type) {
    case "submitted":
      return "Antrag eingegangen.";
    case "edited":
      return `Bearbeitet${by}${entry.text ? ` (${entry.text})` : ""}.`;
    case "inquiry":
      return `Rückfrage${by}.`;
    case "accepted":
      return `Angenommen${by}.`;
    case "invoice_released":
      return `Rechnung freigegeben und Willkommensmail verschickt${by}.`;
    case "completed":
      return "Aufnahme abgeschlossen.";
    case "rejected":
      return `Abgelehnt${by}.`;
  }
};

function Section({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="knglmrt-caption">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

type Row = [label: string, value: ReactNode, mono?: boolean];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1">
      {rows.map(([label, value, mono]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}:</dt>
          <dd className={mono ? "knglmrt-num break-words" : "break-words"}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Fortschrittsbalken der Aufnahme — auch in der Liste. */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <span className="block h-[3px] w-full bg-muted" aria-hidden="true">
      <span
        className="block h-full bg-primary"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </span>
  );
}

const meta = (entry: ChecklistEntry, extra?: string) =>
  [
    entry.by
      ? `erledigt ${formatDate(entry.at)}`
      : `automatisch · ${formatDate(entry.at)}`,
    entry.by ? initials(entry.by) : null,
    extra,
  ]
    .filter(Boolean)
    .join(" · ");

type DialogKind =
  "accept" | "inquiry" | "reject" | "release" | "complete" | null;

export default function ApplicationPanel({
  application,
  invoice,
  invoiceError,
  busy,
  actionError,
  fieldErrors,
  onAction,
  onSave,
}: Props) {
  const { data, campai, checklist } = application;
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [inquiryText, setInquiryText] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(
    null,
  );
  const [sendRejectionMail, setSendRejectionMail] = useState(true);
  const [rejectionMail, setRejectionMail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardError, setCardError] = useState<string | null>(null);
  // Das Kartennummer-Feld erscheint erst, wenn jemand die Karte abhaken will.
  const [cardPending, setCardPending] = useState(false);
  // Bei laufenden Anträgen sind die Antragsdaten zugeklappt.
  const [showData, setShowData] = useState(false);

  const undecided = isUndecided(application.status);
  const onboarding = isOnboarding(application.status);
  const accepted = onboarding || application.status === "completed";
  // Hat die Annahme schon in Campai angefangen, lässt sich nur noch fortsetzen.
  const editable = undecided && !campai.contactId;
  const fee = describeFee(data);
  const changes = changedFields(application.submittedData, data);
  const items = onboardingItems(application);
  const doneCount = items.filter((item) => item.done).length;
  const waitingForInvoice =
    application.status === "invoice_draft" &&
    !campai.invoiceId &&
    !campai.noInvoiceDue;
  const releasedBy = application.history.find(
    (entry) => entry.type === "invoice_released",
  );
  // Laufende Anträge zeigen den Eingang im Verlauf — dort klappen die Daten auf.
  const history = accepted
    ? application.history
    : application.history.filter((entry) => entry.type !== "submitted");

  const run = async (action: PanelAction) => {
    if (await onAction(action)) setDialog(null);
  };

  const openDialog = (kind: Exclude<DialogKind, null>) => {
    if (kind === "inquiry") setInquiryText(inquiryDraft(data.firstName));
    if (kind === "reject") {
      setRejectReason("");
      setRejectReasonError(null);
      setSendRejectionMail(true);
      setRejectionMail(rejectionDraft(data.firstName));
    }
    setDialog(kind);
  };

  const dialogButtons = (confirm: ReactNode) => (
    <>
      <Button kind="secondary" disabled={busy} onClick={() => setDialog(null)}>
        Abbrechen
      </Button>
      {confirm}
    </>
  );

  const invoiceReview = () => {
    if (campai.noInvoiceDue) {
      return (
        <p>
          Beim Annehmen war noch nichts fällig (Eintritt am{" "}
          {formatDate(data.entryAt)}). Campai rechnet dann regulär ab; die
          Willkommensmail geht ohne Rechnung raus.
        </p>
      );
    }
    if (invoice) {
      return (
        <span>
          <a
            href={`/api/admin/applications/${application.id}/invoice`}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-primary hover:underline"
          >
            Rechnungsentwurf als PDF
          </a>{" "}
          · Ändern geht in Campai unter den Belegen.
        </span>
      );
    }
    if (invoiceError) return <Notice tone="gelb">{invoiceError}</Notice>;
    return (
      <p>Campai erstellt die Rechnung — die Ansicht lädt von selbst nach.</p>
    );
  };

  const itemBody = (
    item: OnboardingItem,
  ): { hint?: ReactNode; extra?: ReactNode } => {
    if (item.key !== "welcome" && checklist[item.key]) {
      const entry = checklist[item.key]!;
      return {
        hint: meta(
          entry,
          entry.cardNumber ? `Karte ${entry.cardNumber}` : undefined,
        ),
      };
    }
    switch (item.key) {
      case "welcome":
        return item.done
          ? {
              hint: [
                `verschickt ${formatDate(campai.welcomeSentAt)}`,
                releasedBy?.by ? initials(releasedBy.by) : null,
                campai.invoiceNumber
                  ? `Rechnung ${campai.invoiceNumber}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }
          : {
              hint: "Rechnung prüfen und freigeben — sie geht mit der Campai-Vorlage „Willkommen (Teil 1/2)“ raus.",
              extra: (
                <div className="flex flex-col gap-2">
                  {invoiceReview()}
                  <Button
                    kind="primary"
                    size="small"
                    className="self-start"
                    disabled={busy || (waitingForInvoice && !invoice)}
                    onClick={() => openDialog("release")}
                  >
                    Rechnung freigeben + senden
                  </Button>
                </div>
              ),
            };
      case "payment":
        return {
          hint:
            invoice && !invoice.draft
              ? `Rechnung ${invoice.number} über ${formatEuroCents(invoice.amountCents)}, Verwendungszweck ${invoice.reference ?? "—"} · Campai: ${PAYMENT_LABELS[invoice.paymentStatus]}. Hakt sich ab, sobald Campai sie als bezahlt führt.`
              : "Nach der Freigabe der Rechnung gleicht Campai die Zahlung ab.",
        };
      case "card":
        return {
          hint: item.hint,
          extra: cardPending ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveCard();
              }}
            >
              <Field
                label="Kartennummer"
                kind="mono"
                autoFocus
                value={cardNumber}
                error={cardError ?? undefined}
                disabled={busy}
                className="max-w-[180px]"
                onChange={(event) => {
                  setCardNumber(event.target.value);
                  setCardError(null);
                }}
              />
              <Button type="submit" kind="primary" size="small" loading={busy}>
                Abhaken
              </Button>
              <Button
                type="button"
                kind="secondary"
                size="small"
                disabled={busy}
                onClick={() => {
                  setCardPending(false);
                  setCardError(null);
                }}
              >
                Abbrechen
              </Button>
            </form>
          ) : undefined,
        };
      default:
        return { hint: item.hint };
    }
  };

  const saveCard = async () => {
    if (!cardNumber.trim()) {
      setCardError("Bitte die Kartennummer eintragen.");
      return;
    }
    if (
      await onAction({ action: "check", step: "card", done: true, cardNumber })
    ) {
      setCardPending(false);
      setCardNumber("");
    }
  };

  const toggle = (item: OnboardingItem, done: boolean) => {
    if (item.key === "welcome") return;
    if (item.key === "card" && done) {
      setCardPending(true);
      return;
    }
    if (item.key === "card") setCardPending(false);
    void onAction({ action: "check", step: item.key, done });
  };

  const dataSections = (
    <>
      {editing ? (
        <Section title="Antrag bearbeiten">
          <ApplicationEditForm
            initial={data}
            saving={busy}
            fieldErrors={fieldErrors}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              if (await onSave(next)) setEditing(false);
            }}
          />
        </Section>
      ) : (
        <>
          <Section
            title="Antragsdaten"
            action={
              editable ? (
                <Button
                  kind="secondary"
                  size="chip"
                  onClick={() => setEditing(true)}
                >
                  Bearbeiten
                </Button>
              ) : null
            }
          >
            <Rows
              rows={[
                ["E-Mail", data.email],
                ...(data.phone ? [["Telefon", data.phone, true] as Row] : []),
                ...(data.mobilePhone
                  ? [["Mobil", data.mobilePhone, true] as Row]
                  : []),
                ["Anschrift", describeAddress(data)],
              ]}
            />
          </Section>

          <Section title="Mitgliedschaft">
            <Rows
              rows={[
                ["Eintritt", formatDate(data.entryAt), true],
                [
                  "Jahresbeitrag",
                  <>
                    {fee.label}
                    {fee.euro !== null ? (
                      <span className="knglmrt-num">
                        {" "}
                        · {formatEuro(fee.euro)}
                      </span>
                    ) : null}
                    {data.trialRate && data.annualFee !== null ? (
                      <span className="block text-muted-foreground">
                        danach {formatEuro(data.annualFee)} pro Jahr
                      </span>
                    ) : null}
                  </>,
                ],
                ["Zugangskarte", describeAccess(data)],
                ["Zahlungsmittel", describePayment(data)],
                ...(data.paymentMethod === "sepaDirectDebit"
                  ? [["IBAN", data.iban, true] as Row]
                  : []),
                ...(campai.memberNumber
                  ? [["Mitgliedsnr.", campai.memberNumber, true] as Row]
                  : []),
              ]}
            />
          </Section>

          {changes.length > 0 ? (
            <Section title="Korrigiert">
              <ul className="flex flex-col gap-0.5 text-muted-foreground">
                {changes.map((change) => (
                  <li key={change.field}>
                    {change.label}: ursprünglich {change.from}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <div className="knglmrt-border bg-card">
      <header className="flex items-center gap-3.5 border-b border-border bg-primary-soft p-[18px]">
        <span className="knglmrt-border flex h-12 w-12 shrink-0 items-center justify-center bg-card">
          <Face size={34} title="" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="knglmrt-num block text-muted-foreground">
            {application.number}
          </span>
          <span className="knglmrt-card-title block truncate">
            {data.firstName} {data.lastName}
          </span>
        </span>
        <Badge tone={STATUS_TONES[application.status]}>
          {STATUS_LABELS[application.status]}
        </Badge>
      </header>

      <div className="flex flex-col gap-5 p-[18px]">
        {actionError ? (
          <Notice tone="gelb" title="Das hat nicht geklappt">
            {actionError}
          </Notice>
        ) : application.lastError ? (
          <Notice tone="gelb" title="Letzter Versuch abgebrochen">
            {application.lastError}
          </Notice>
        ) : null}

        {accepted ? (
          <Section
            title="Aufnahme"
            action={
              <span className="knglmrt-num">
                {doneCount} / {items.length} erledigt
              </span>
            }
          >
            <ProgressBar done={doneCount} total={items.length} />
            <ul className="flex flex-col">
              {items.map((item) => {
                const { hint, extra } = itemBody(item);
                return (
                  <li
                    key={item.key}
                    className="flex flex-col gap-2 border-b border-border py-3"
                  >
                    <Choice
                      label={item.label}
                      checked={
                        item.done || (item.key === "card" && cardPending)
                      }
                      // Die Willkommensmail hakt die Freigabe ab, nicht die Hand.
                      disabled={item.key === "welcome" || !onboarding || busy}
                      onChange={(event) => toggle(item, event.target.checked)}
                      hint={hint}
                    />
                    {extra ? <div className="pl-[26px]">{extra}</div> : null}
                  </li>
                );
              })}
            </ul>
            {application.status === "completed" ? (
              <p className="bg-muted px-3.5 py-3">
                Aufnahme abgeschlossen. {data.firstName} ist Mitglied.
              </p>
            ) : application.status === "welcomed" &&
              doneCount === items.length ? (
              <div className="flex flex-col gap-2 bg-muted px-3.5 py-3">
                <p>
                  Alles erledigt. Zum Abschluss geht „Willkommen (Teil 2/2)“
                  raus.
                </p>
                <Button
                  kind="primary"
                  size="small"
                  className="self-start"
                  disabled={busy}
                  onClick={() => openDialog("complete")}
                >
                  Aufnahme abschließen
                </Button>
              </div>
            ) : null}
          </Section>
        ) : null}

        {!accepted ? dataSections : null}

        {!accepted ? (
          <Section title="Unterschrift">
            {application.signatures?.signature ? (
              // eslint-disable-next-line @next/next/no-img-element -- Data-URL aus dem Antrag
              <img
                src={application.signatures.signature}
                alt={`Unterschrift von ${data.firstName} ${data.lastName}`}
                className="h-16 w-auto max-w-full object-contain object-left"
              />
            ) : (
              <p className="text-muted-foreground">
                Liegt mit dem Antrag als Dokument in Campai.
              </p>
            )}
            <p className="border-t border-foreground pt-1 text-muted-foreground">
              <span className="knglmrt-num">
                {formatDate(application.createdAt)}
              </span>{" "}
              · digital unterschrieben ·{" "}
              <a
                href={`/api/admin/applications/${application.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Antrag als PDF
              </a>
            </p>
          </Section>
        ) : null}

        {application.status === "rejected" && application.rejectionReason ? (
          <Section title="Grund der Ablehnung">
            <p className="whitespace-pre-line">{application.rejectionReason}</p>
          </Section>
        ) : null}

        {history.length > 0 ? (
          <ol className="flex flex-col gap-1 bg-muted px-3.5 py-3">
            {history.map((entry, index) => (
              <li key={index}>
                <span className="knglmrt-num text-muted-foreground">
                  {formatDate(entry.at)}
                </span>{" "}
                {entry.type === "submitted" ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={showData}
                      onClick={() => setShowData((current) => !current)}
                      className="text-primary hover:underline"
                    >
                      Antrag eingegangen {showData ? "▴" : "▾"}
                    </button>
                    {" · "}
                    <a
                      href={`/api/admin/applications/${application.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      PDF
                    </a>
                  </>
                ) : (
                  describeHistory(entry)
                )}
                {entry.text &&
                (entry.type === "inquiry" || entry.type === "rejected") ? (
                  <span className="block whitespace-pre-line text-muted-foreground">
                    {entry.text}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {accepted && showData ? dataSections : null}

        {undecided ? (
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <Button
              kind="primary"
              size="small"
              disabled={busy}
              onClick={() => openDialog("accept")}
            >
              {campai.contactId ? "Annahme fortsetzen" : "Annehmen"}
            </Button>
            {editable ? (
              <>
                <Button
                  kind="secondary"
                  size="small"
                  disabled={busy}
                  onClick={() => openDialog("inquiry")}
                >
                  Rückfrage
                </Button>
                <Button
                  kind="quiet"
                  size="small"
                  disabled={busy}
                  onClick={() => openDialog("reject")}
                >
                  Ablehnen
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog
        open={dialog === "accept"}
        title={`${data.firstName} ${data.lastName} annehmen?`}
        onCancel={() => setDialog(null)}
        width={480}
        actions={dialogButtons(
          <Button
            kind="primary"
            loading={busy}
            onClick={() => void run({ action: "accept" })}
          >
            Annehmen
          </Button>,
        )}
      >
        <p>In Campai entstehen:</p>
        <ul className="mt-1 list-disc pl-5">
          <li>
            Mitglied mit Debitor, Beitragsfeldern und dem Antrag als Dokument
          </li>
          <li>
            Verträge: Jahresbeitrag
            {data.accessTariff && data.accessTariff !== "none"
              ? ` und ${describeAccess(data)}`
              : ""}
          </li>
          <li>
            die erste Rechnung als Entwurf — sie geht erst nach deiner Prüfung
            raus
          </li>
        </ul>
      </Dialog>

      <Dialog
        open={dialog === "inquiry"}
        title="Rückfrage stellen"
        onCancel={() => setDialog(null)}
        width={560}
        actions={dialogButtons(
          <Button
            kind="primary"
            loading={busy}
            disabled={!inquiryText.trim()}
            onClick={() => void run({ action: "inquiry", text: inquiryText })}
          >
            Rückfrage senden
          </Button>,
        )}
      >
        <Textarea
          label={`Mail an ${data.email}`}
          rows={10}
          counter={5000}
          value={inquiryText}
          hint="Geht genau so raus. Antworten landen im Campai-Posteingang."
          onChange={(event) => setInquiryText(event.target.value)}
        />
      </Dialog>

      <Dialog
        open={dialog === "reject"}
        title="Antrag ablehnen"
        onCancel={() => setDialog(null)}
        width={560}
        actions={dialogButtons(
          <Button
            kind="danger-primary"
            loading={busy}
            onClick={() => {
              if (!rejectReason.trim()) {
                setRejectReasonError("Bitte einen Grund angeben.");
                return;
              }
              void run({
                action: "reject",
                reason: rejectReason,
                mailText: sendRejectionMail ? rejectionMail : null,
              });
            }}
          >
            Ablehnen
          </Button>,
        )}
      >
        <div className="flex flex-col gap-3.5">
          <Textarea
            label="Grund (intern)"
            rows={3}
            counter={2000}
            value={rejectReason}
            error={rejectReasonError ?? undefined}
            hint="Pflicht. Bleibt beim Antrag, geht nicht an die Person."
            onChange={(event) => {
              setRejectReason(event.target.value);
              setRejectReasonError(null);
            }}
          />
          <Choice
            label="Absage-Mail senden"
            checked={sendRejectionMail}
            onChange={(event) => setSendRejectionMail(event.target.checked)}
          />
          {sendRejectionMail ? (
            <Textarea
              label={`Mail an ${data.email}`}
              rows={9}
              counter={5000}
              value={rejectionMail}
              onChange={(event) => setRejectionMail(event.target.value)}
            />
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={dialog === "release"}
        title="Rechnung freigeben?"
        onCancel={() => setDialog(null)}
        width={480}
        actions={dialogButtons(
          <Button
            kind="primary"
            loading={busy}
            onClick={() => void run({ action: "release" })}
          >
            Freigeben und senden
          </Button>,
        )}
      >
        <p>
          {campai.noInvoiceDue
            ? `Die Willkommensmail (Campai-Vorlage „Willkommen, Teil 1/2“) geht an ${data.email}, ohne Rechnung.`
            : `Die Rechnung${invoice ? ` über ${formatEuroCents(invoice.amountCents)}` : ""} wird in Campai abgeschlossen und kann danach nicht mehr geändert werden. Sie geht als Anhang der Willkommensmail (Campai-Vorlage „Willkommen, Teil 1/2“) an ${data.email}.`}
        </p>
      </Dialog>

      <Dialog
        open={dialog === "complete"}
        title="Aufnahme abschließen?"
        onCancel={() => setDialog(null)}
        width={480}
        actions={dialogButtons(
          <Button
            kind="primary"
            loading={busy}
            onClick={() => void run({ action: "complete" })}
          >
            Abschließen und senden
          </Button>,
        )}
      >
        <p>
          Die Campai-Vorlage „Willkommen, Teil 2/2“ geht an {data.email}. Danach
          steht {data.firstName} unter „Mitglied“.
        </p>
      </Dialog>
    </div>
  );
}
