"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faArrowsRotate,
  faPen,
} from "@fortawesome/free-solid-svg-icons";

import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
import Face from "@/components/knglmrt/Face";
import Notice from "@/components/knglmrt/Notice";
import StatTile from "@/components/knglmrt/StatTile";
import {
  Table,
  TBody,
  TableEmpty,
  THead,
  Th,
  Td,
  Tr,
} from "@/components/knglmrt/Table";
import type { AccountInvoicesResponse } from "@/app/api/campai/invoices/route";
import type { CampaiPaymentMethod } from "@/lib/campai-contact-profile";
import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import {
  BONUS_OPTION_LABELS,
  isRunning,
  nextQuarterStart,
  type EhrenamtsbonusRequest,
} from "@/lib/ehrenamtsbonus";
import {
  isReceiptOpen,
  receiptOpenCents,
  receiptPaymentState,
  receiptTotalCents,
  RECEIPT_PAYMENT_LABELS,
  type InvoicePayload,
  type ReceiptPaymentState,
} from "@/lib/campai-invoices";
import { signOut } from "../../actions";
import Button from "@/components/knglmrt/Button";
import AccountDepartmentsEditor from "./AccountDepartmentsEditor";
import AccountProfileSections from "./AccountProfileSections";
import { AccountSection, DataField, DataGrid } from "./AccountSection";
import AccountSideNav, { type AccountNavItem } from "./AccountSideNav";
import useCampaiProfile from "./useCampaiProfile";

type AccountUser = {
  email: string;
  metadata: Record<string, unknown>;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const bytesToHex = (value: Uint8Array) => {
  return Array.from(value, (entry) => entry.toString(16).padStart(2, "0")).join(
    "",
  );
};

const buildGravatarUrl = (hash: string) => {
  // `d=404`: ohne eigenes Gravatar-Bild schlägt das Laden fehl, und statt des
  // grauen Platzhalters steht das gezeichnete Gesicht.
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=160`;
};

const parseDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString("de-DE") : value;
};

// Reihenfolge, in der ein Klick die Anzeige der Mitgliedsdauer weiterdreht.
const MEMBER_SINCE_VIEWS = [
  "months",
  "days",
  "date",
  "weeks",
  "years",
] as const;
type MemberSinceView = (typeof MEMBER_SINCE_VIEWS)[number];

const MEMBER_SINCE_NEXT_LABELS: Record<MemberSinceView, string> = {
  months: "In Monaten anzeigen",
  days: "In Tagen anzeigen",
  date: "Als Datum anzeigen",
  weeks: "In Wochen anzeigen",
  years: "In Jahren anzeigen",
};

const plural = (value: number, singular: string, many: string) =>
  `${value.toLocaleString("de-DE")} ${value === 1 ? singular : many}`;

/**
 * Tage, Wochen und Monate zählen volle Einheiten, Monate nach Kalender.
 * Jahre stehen mit einer Nachkommastelle.
 */
const formatMemberSince = (view: MemberSinceView, since: Date, now: Date) => {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - since.getTime()) / 86_400_000),
  );
  switch (view) {
    case "date":
      return since.toLocaleDateString("de-DE");
    case "days":
      return plural(days, "Tag", "Tage");
    case "weeks":
      return plural(Math.floor(days / 7), "Woche", "Wochen");
    case "months": {
      let months =
        (now.getFullYear() - since.getFullYear()) * 12 +
        (now.getMonth() - since.getMonth());
      if (now.getDate() < since.getDate()) {
        months -= 1;
      }
      return plural(Math.max(0, months), "Monat", "Monate");
    }
    case "years":
      return `${(days / 365.25).toLocaleString("de-DE", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} Jahre`;
  }
};

/**
 * Die Mitgliedsdauer statt des Eintrittsdatums. Das kleine Zeichen daneben
 * dreht die Anzeige weiter: Monate, Tage, Datum, Wochen, Jahre und wieder
 * von vorn.
 */
function MemberSince({ since }: { since: string }) {
  const [viewIndex, setViewIndex] = useState(0);
  const date = parseDate(since);
  if (!date) {
    return <>{since}</>;
  }
  const view = MEMBER_SINCE_VIEWS[viewIndex];
  const nextView =
    MEMBER_SINCE_VIEWS[(viewIndex + 1) % MEMBER_SINCE_VIEWS.length];

  return (
    <span className="inline-flex items-center gap-2">
      {formatMemberSince(view, date, new Date())}
      <button
        type="button"
        onClick={() =>
          setViewIndex((index) => (index + 1) % MEMBER_SINCE_VIEWS.length)
        }
        aria-label={MEMBER_SINCE_NEXT_LABELS[nextView]}
        className="cursor-pointer text-[13px] text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        <FontAwesomeIcon icon={faArrowsRotate} />
      </button>
    </span>
  );
}

const formatAmount = (value?: number | null, currency?: string) => {
  if (value === null || value === undefined) {
    return "—";
  }
  const numeric = value / 100;
  const safeCurrency =
    typeof currency === "string" && currency.trim().length === 3
      ? currency.trim().toUpperCase()
      : "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: safeCurrency,
    }).format(numeric);
  } catch {
    return `€${numeric.toFixed(2)}`;
  }
};

/** Positiv heißt: das Mitglied schuldet dem Verein etwas. */
const formatSaldo = (cents: number) =>
  cents > 0
    ? `−${formatAmount(cents)}`
    : cents < 0
      ? `+${formatAmount(-cents)}`
      : formatAmount(0);

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  }
  return data;
};

// Bezahlt ist grün, offen rot, teilweise gelb, storniert grau.
const PAYMENT_TONES: Record<ReceiptPaymentState, BadgeTone> = {
  bezahlt: "gebucht",
  unbezahlt: "offen",
  teilweise: "wartet",
  storniert: "neutral",
  unbekannt: "neutral",
};

const PAYMENT_METHOD_LABELS: Record<CampaiPaymentMethod, string> = {
  sepaCreditTransfer: "Überweisung",
  sepaDirectDebit: "SEPA-Lastschrift",
  cash: "Bar",
  online: "Online",
};

// Reihenfolge des Menüs = Reihenfolge der Rubriken auf der Seite. Als
// Modulkonstante, damit der Beobachter im Menü nicht bei jedem Rendern neu
// aufgesetzt wird.
const ACCOUNT_NAV_ITEMS: AccountNavItem[] = [
  { id: "mitgliedschaft", label: "Mitgliedschaft" },
  { id: "zugangskarte", label: "Zugangskarte" },
  { id: "ehrenamtsbonus", label: "Ehrenamtsbonus" },
  { id: "profil", label: "Persönliche Daten" },
  { id: "kommunikation", label: "Kommunikation" },
  { id: "rechnungen", label: "Belege & Rechnungen" },
];

// Das Konto in Roseguarden, der Zugangsplattform des Vereins.
const ROSEGUARDEN_ACCOUNT_URL = "https://open.konglomerat.org/user/account";

// Der gebuchte Tarif kommt aus Campai (Vertragsoption). Name und Preis nennt
// Campai selbst — hier steht nur noch, was die App darüber hinaus weiß: die
// Stufenbezeichnung als Rückfall und der Zugang, den eine Stufe bedeutet.
const TARIFF_LABELS: Record<CampaiAccessTariff, string> = {
  abo_gross: "Abo groß",
  abo_klein: "Abo klein",
  punktekarte: "Punktekarte",
  keiner: "Kein Tarif",
};

// Campai hängt an die Plannamen die Rubrik an — „10er Karte Mensch
// (Zugangskarte)". In der Kachel steht der Name ohne sie.
const tarifName = (tariff: CampaiAccessTariff, label: string | null) =>
  label?.replace(/\s*\([^)]*\)\s*$/, "").trim() || TARIFF_LABELS[tariff];

// Glatte Beträge ohne „,00" — im Hinweis unter dem Tarif zählt der Betrag,
// nicht die Genauigkeit.
const formatTarifPreis = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** Was Campai für die Stufe verlangt, ergänzt um den Zugang, den sie gibt. */
const tarifHinweis = (
  tariff: CampaiAccessTariff,
  priceCents: number | null,
) => {
  const preis = priceCents === null ? null : formatTarifPreis(priceCents);

  switch (tariff) {
    case "abo_gross":
      return preis ? `${preis} im Monat · 24/7-Zugang` : "24/7-Zugang";
    case "abo_klein":
      return preis ? `${preis} im Monat` : "Monatliches Abo";
    case "punktekarte":
      return preis ? `${preis} für 10 Zugänge` : "Zehn Zugänge";
    case "keiner":
      return "Kein laufender Zugangskarten-Vertrag";
  }
};

// Ab wann ein laufender Bonus als „läuft aus" gilt — früh genug, um den
// Anschlussantrag noch vor dem Quartalswechsel zu stellen.
const BONUS_WARNING_DAYS = 60;

/** „Läuft aus" heißt: er läuft noch, endet aber bald. */
const endsSoon = (validUntil?: string | null) => {
  const until = parseDate(validUntil);
  if (!until) {
    return false;
  }
  const days = (until.getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= BONUS_WARNING_DAYS;
};

type AccountClientProps = {
  roleLabels: string[];
  // Kommt fertig aus der Server-Hülle. Damit steht der Kopf — Begrüßung,
  // Rollen, Abmelden — schon im ersten Paint, ohne Fetch nach dem Mount.
  initialUser: AccountUser | null;
  // Der laufende oder schon zugesagte Ehrenamtsbonus, sonst `null`. Ebenfalls
  // aus der Server-Hülle — die Rubrik soll nicht erst nachladen.
  activeBonus: EhrenamtsbonusRequest | null;
};

export default function AccountClient({
  roleLabels,
  initialUser: user,
  activeBonus,
}: AccountClientProps) {
  const [gravatarUrl, setGravatarUrl] = useState("");
  const [gravatarFailed, setGravatarFailed] = useState(false);
  // `null`, solange die Belege laden.
  const [invoices, setInvoices] = useState<InvoicePayload[] | null>(null);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [bonusBlockedHint, setBonusBlockedHint] = useState(false);
  const [departmentsOpen, setDepartmentsOpen] = useState(false);
  const [departmentsSaved, setDepartmentsSaved] = useState(false);

  // Kontakt und Verträge aus Campai tragen fast alle Rubriken: Mitgliedschaft,
  // Zugangskarte, Saldo und Debitorenkonto hier, Name, Sprache, Adresse und
  // Kontaktwege in AccountProfileSections.
  const campai = useCampaiProfile();
  const { profile, membership, loading } = campai;

  /** Solange Campai lädt, steht „…" statt des Gedankenstrichs. */
  const pending = <T,>(value: T) => (loading ? "…" : value);

  // Bis Campai antwortet, trägt der in member_profiles gespeicherte Name den
  // Kopf — danach gilt, was im Kontakt steht, auch direkt nach dem Speichern.
  const profileName = profile
    ? profile.isInstitution
      ? profile.organizationName
      : [profile.firstName, profile.lastName].filter(Boolean).join(" ")
    : "";
  const storedFirstName = text(user?.metadata.first_name);
  const displayName =
    profileName ||
    text(user?.metadata.campai_name) ||
    [storedFirstName, text(user?.metadata.last_name)]
      .filter(Boolean)
      .join(" ") ||
    text(user?.email);

  // „Hallo Jana" — die Begrüßung nimmt den Rufnamen, nicht den ganzen Namen.
  const greetingName =
    (profile && !profile.isInstitution ? profile.firstName : "") ||
    storedFirstName ||
    displayName.split(/\s+/)[0] ||
    "";

  const activeAvatarUrl = gravatarFailed ? "" : gravatarUrl;

  useEffect(() => {
    const normalizedEmail = text(user?.email).toLowerCase();

    if (!normalizedEmail || !window.crypto?.subtle) {
      return;
    }

    let active = true;

    const loadGravatarUrl = async () => {
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalizedEmail),
      );

      if (!active) {
        return;
      }

      setGravatarFailed(false);
      setGravatarUrl(buildGravatarUrl(bytesToHex(new Uint8Array(digest))));
    };

    void loadGravatarUrl();

    return () => {
      active = false;
    };
  }, [user?.email]);

  // Das Debitorenkonto bestimmt die Route selbst aus dem Campai-Kontakt —
  // deshalb laden die Belege sofort und parallel zum Kontakt.
  useEffect(() => {
    let active = true;

    fetchJson<AccountInvoicesResponse>("/api/campai/invoices")
      .then((data) => {
        if (active) {
          setInvoices(data.invoices ?? []);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setInvoices([]);
          setInvoicesError(
            fetchError instanceof Error
              ? fetchError.message
              : "Campai-Belege konnten nicht geladen werden.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const debtor = profile?.debtor ?? null;
  const debtorAccount = debtor?.account ?? null;
  const invoicesLoading = invoices === null;
  const invoiceList = invoices ?? [];

  // Offen ist, was Campai selbst noch offen führt (`totalAmountLeftToPay`) —
  // Teilzahlungen zählen mit ihrem Restbetrag, Stornos stehen dort auf 0.
  const openReceipts = invoiceList.filter(isReceiptOpen);

  // Den Saldo führt Campai am Debitor selbst — dieselbe Zahl, die auch der
  // Ehrenamtsbonus-Antrag zeigt. Die Belege liefern nur noch den Hinweis.
  const openBalance = debtor?.openBalanceCents ?? null;
  const saldoValue = loading
    ? "…"
    : openBalance === null
      ? "—"
      : formatSaldo(openBalance);

  const saldoHint = (() => {
    if (!loading && !debtor) {
      return "Kein Debitorenkonto in Campai";
    }
    if (invoicesLoading) {
      return "Belege werden geladen …";
    }
    if (openReceipts.length === 0) {
      return openBalance !== null && openBalance < 0
        ? "Guthaben"
        : "Nichts offen";
    }
    return openReceipts.length === 1
      ? "1 offener Beleg"
      : `${openReceipts.length} offene Belege`;
  })();

  const tarifValue = pending(
    membership
      ? tarifName(membership.tariff, membership.tariffLabel)
      : undefined,
  );
  const tarifHint = loading
    ? undefined
    : membership
      ? tarifHinweis(membership.tariff, membership.tariffPriceCents)
      : "Nicht abrufbar";

  // Läuft der Bonus heute schon, oder ist er nur zugesagt? „Läuft aus" hängt
  // auch am Hinweisband oben.
  const bonusRunning = activeBonus ? isRunning(activeBonus) : false;
  const bonusEndsSoon = bonusRunning && endsSoon(activeBonus?.validUntil);
  // Beantragt wird immer das kommende Quartal — ist das schon bewilligt, gibt
  // es gerade nichts zu beantragen.
  const nextQuarter = nextQuarterStart();
  const nextQuarterTaken = activeBonus?.validFrom === nextQuarter.value;

  if (!user) {
    return (
      <div className="knglmrt-border bg-card p-[18px]">
        <h2 className="mb-1">Anmeldung erforderlich</h2>
        <p className="mb-4 text-muted-foreground">
          Bitte melde dich an, um dein Profil zu verwalten.
        </p>
        <Button
          size="small"
          href="/login?redirectedFrom=/account"
          kind="primary"
        >
          Anmelden
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Kopf: quadratischer Avatar (das DS kennt keine Kreise), Begrüßung mit
          dem Rufnamen, eine Zeile, was diese Seite ist. Alle Werte kommen aus
          der Server-Hülle, deshalb steht der Kopf inklusive Abmelden-Taste
          sofort. */}
      <header className="mb-6 flex flex-wrap items-start gap-4">
        {activeAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeAvatarUrl}
            alt={displayName || "Profilbild"}
            className="h-14 w-14 flex-none knglmrt-border object-cover"
            onError={() => {
              setGravatarFailed(true);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center knglmrt-border bg-[var(--knglmrt-pink-30)]"
          >
            <Face number={19} size={36} />
          </span>
        )}
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0">
              {greetingName ? `Hallo ${greetingName}` : "Dein Profil"}
            </h1>
            {/* Die Rollen stehen im Entwurf nicht, sind aber echte Angaben —
                als Marken neben der Begrüßung nehmen sie keine eigene Zeile. */}
            {roleLabels.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-muted-foreground">
            Schön, dass du da bist. Hier kannst du deine Mitgliedsdaten einsehen
            und bearbeiten sowie ein paar Self-Services nutzen.
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" kind="danger-secondary">
            Abmelden
          </Button>
        </form>
      </header>

      {bonusEndsSoon && activeBonus ? (
        <Notice tone="gelb" className="mb-6">
          Dein Ehrenamtsbonus läuft am {formatDate(activeBonus.validUntil)} aus.
          Wenn du weiter mit anpackst, beantrage ihn gleich für den nächsten
          Zeitraum.
        </Notice>
      ) : null}

      {/* Links das Menü, rechts die Rubriken. Die Menüspalte streckt sich
          absichtlich über die ganze Höhe: nur so wandert die klebende Leiste
          darin mit. */}
      <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
        <AccountSideNav items={ACCOUNT_NAV_ITEMS} />

        <div className="flex min-w-0 flex-col gap-7">
          {/* Mitgliedsdaten und Zahlart führt der Kontakt, der Beitrag steht
              in seinen Verträgen. Der Tarif gehört zur
              Zugangskarte und steht deshalb dort. */}
          <AccountSection
            id="mitgliedschaft"
            title="Deine Mitgliedschaft"
            highlight
          >
            <DataGrid>
              <DataField
                label="Mitgliedsnummer"
                mono
                value={pending(profile?.memberNumber)}
              />
              <DataField
                label="Mitglied seit"
                mono
                value={pending(
                  profile?.memberSince ? (
                    <MemberSince since={profile.memberSince} />
                  ) : undefined,
                )}
                hint={
                  profile?.memberUntil
                    ? `Austritt zum ${formatDate(profile.memberUntil)}`
                    : undefined
                }
              />
              <DataField
                label="Jahresbeitrag"
                mono
                value={pending(
                  membership?.annualFeeCents != null
                    ? formatAmount(membership.annualFeeCents)
                    : undefined,
                )}
              />
              <DataField
                label="Zahlweise"
                value={pending(
                  debtor?.paymentMethod
                    ? PAYMENT_METHOD_LABELS[debtor.paymentMethod]
                    : undefined,
                )}
              />
              <DataField
                label={
                  profile?.departments.length === 1 ? "Abteilung" : "Abteilungen"
                }
                value={pending(
                  profile?.departments.length
                    ? profile.departments.map((entry) => entry.name).join(", ")
                    : undefined,
                )}
                action={
                  <Button
                    type="button"
                    kind="ghost"
                    size="chip"
                    iconOnly
                    icon={faPen}
                    aria-label="Abteilungen bearbeiten"
                    aria-expanded={departmentsOpen}
                    aria-controls="account-editor-abteilungen"
                    disabled={campai.locked}
                    className={`-my-1 ${departmentsOpen ? "bg-muted" : ""}`}
                    onClick={() => {
                      setDepartmentsOpen((open) => !open);
                      setDepartmentsSaved(false);
                    }}
                  />
                }
              />
            </DataGrid>

            {departmentsOpen && profile ? (
              <AccountDepartmentsEditor
                id="account-editor-abteilungen"
                current={profile.departments}
                save={campai.save}
                onSaved={() => {
                  setDepartmentsOpen(false);
                  setDepartmentsSaved(true);
                }}
                onCancel={() => setDepartmentsOpen(false)}
              />
            ) : null}
            {departmentsSaved && !departmentsOpen ? (
              <p className="mt-4 font-bold">Abteilungen gespeichert.</p>
            ) : null}
          </AccountSection>

          <AccountSection
            id="zugangskarte"
            title="Zugangskarte"
            actions={
              <>
                <Button kind="primary" size="small" href="/monatsbeitrag">
                  Tarif wechseln
                </Button>
              </>
            }
          >
            <DataGrid>
              <DataField
                label="Aktueller Tarif"
                value={tarifValue}
                hint={tarifHint}
              />
              <DataField label="Verbleibende Zugänge" mono />
              <DataField
                label="Roseguarden"
                value={
                  <a
                    href={ROSEGUARDEN_ACCOUNT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-primary hover:text-[var(--ui-action-hover)]"
                  >
                    open.konglomerat.org
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    <span className="sr-only">(öffnet in neuem Tab)</span>
                  </a>
                }
                hint={
                  "Unser Schließsystem. Hier kannst du deine Zugangskarte verwalten."
                }
              />
            </DataGrid>
          </AccountSection>

          <AccountSection
            id="ehrenamtsbonus"
            title="Ehrenamtsbonus"
            badge={
              activeBonus ? (
                <Badge tone={bonusEndsSoon ? "wartet" : "gebucht"}>
                  {bonusEndsSoon
                    ? "Läuft aus"
                    : bonusRunning
                      ? "Aktiv"
                      : "Angenommen"}
                </Badge>
              ) : undefined
            }
            actions={
              nextQuarterTaken ? (
                // Zurückgenommen statt gesperrt: die Taste führt nicht zum
                // Formular, sondern zeigt beim Klick den Grund.
                // Die Meldung schwebt unter der Taste, damit nichts darunter
                // verrutscht.
                <div className="relative">
                  <Button
                    kind="quiet"
                    size="small"
                    onClick={() => setBonusBlockedHint(true)}
                  >
                    Ehrenamtsbonus beantragen
                  </Button>
                  {bonusBlockedHint ? (
                    <p
                      role="status"
                      className="absolute top-full right-0 z-10 mt-1.5 w-max max-w-[min(320px,calc(100vw-32px))] bg-card text-right text-sm text-muted-foreground"
                    >
                      Bonus fürs nächste Quartal bereits bewilligt. Neuer Antrag
                      erst wieder möglich ab {formatDate(nextQuarter.value)}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <Button
                  kind="primary"
                  size="small"
                  href="/account/ehrenamtsbonus"
                >
                  {activeBonus
                    ? "Ehrenamtsbonus beantragen"
                    : "Bonus beantragen"}
                </Button>
              )
            }
          >
            {activeBonus ? (
              <DataGrid>
                <DataField
                  label="Zeitraum"
                  mono
                  value={`${formatDate(activeBonus.validFrom)} – ${formatDate(
                    activeBonus.validUntil,
                  )}`}
                />
                <DataField
                  label="Gewählter Bonus"
                  value={BONUS_OPTION_LABELS[activeBonus.requestedOption]}
                />
              </DataGrid>
            ) : (
              <p className="max-w-[700px] text-muted-foreground">
                Wir möchten verstärkt Mitgliedern im Verein ermöglichen, ihr
                Engagement außerhalb der bisherigen individuellen
                Zugangsregelung auszuleben und damit den Verein hübscher,
                smarter, glücklicher, frecher, farbiger, weicher, härter,
                schneller, lauter - zu machen.
              </p>
            )}
          </AccountSection>

          <AccountProfileSections campai={campai} accountEmail={user.email} />

          {/* Gelistet wird jeder Beleg des Debitorenkontos, nicht nur
              Rechnungen: Spenden, Angebote und Einnahmen laufen über dasselbe
              Konto. */}
          <AccountSection id="rechnungen" title="Belege & Rechnungen">
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <StatTile
                label="Saldo"
                value={saldoValue}
                hint={saldoHint}
                tone={"grau"}
              />
            </div>

            <div className="mt-6">
              {invoicesError ? (
                <p className="text-destructive">{invoicesError}</p>
              ) : (
                <Table>
                  <THead>
                    <Th>Datum</Th>
                    <Th>Beleg</Th>
                    <Th className="text-right">Betrag</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Download</span>
                    </Th>
                  </THead>
                  <TBody>
                    {invoicesLoading ? (
                      <TableEmpty colSpan={5}>
                        Belege werden geladen …
                      </TableEmpty>
                    ) : invoiceList.length === 0 ? (
                      <TableEmpty colSpan={5}>
                        {!loading && debtorAccount === null
                          ? "Für dein Konto führt Campai kein Debitorenkonto."
                          : "Keine Belege gefunden."}
                      </TableEmpty>
                    ) : (
                      invoiceList.map((invoice) => {
                        const state = receiptPaymentState(invoice);
                        const offen = receiptOpenCents(invoice);

                        return (
                          <Tr key={invoice.id} interactive>
                            <Td className="knglmrt-num whitespace-nowrap text-muted-foreground">
                              {formatDate(invoice.receiptDate) || "—"}
                            </Td>
                            <Td>
                              <span className="block font-bold">
                                {invoice.title ??
                                  invoice.receiptNumber ??
                                  "Beleg"}
                              </span>
                              {invoice.receiptNumber ? (
                                <span className="knglmrt-num block text-muted-foreground">
                                  {invoice.receiptNumber}
                                </span>
                              ) : null}
                            </Td>
                            <Td className="knglmrt-num whitespace-nowrap text-right">
                              {formatAmount(
                                receiptTotalCents(invoice),
                                invoice.currency,
                              )}
                              {/* Bei einer Teilzahlung sagt der Gesamtbetrag
                                  allein nicht, was noch zu zahlen ist. */}
                              {state === "teilweise" ? (
                                <span className="block text-muted-foreground">
                                  noch {formatAmount(offen, invoice.currency)}
                                </span>
                              ) : null}
                            </Td>
                            <Td>
                              {state === "unbekannt" ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <Badge tone={PAYMENT_TONES[state]}>
                                  {RECEIPT_PAYMENT_LABELS[state]}
                                </Badge>
                              )}
                            </Td>
                            <Td className="text-right">
                              <Link
                                href={`/api/campai/invoices/${invoice.id}/download`}
                                className="whitespace-nowrap font-bold text-primary"
                              >
                                PDF
                              </Link>
                            </Td>
                          </Tr>
                        );
                      })
                    )}
                  </TBody>
                </Table>
              )}
            </div>
          </AccountSection>
        </div>
      </div>
    </div>
  );
}
