"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
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
import { type InvoicePayload } from "@/lib/campai-invoices";
import { signOut } from "../../actions";
import Button from "../components/Button";
import PasswordInput from "../components/PasswordInput";

type AccountUser = {
  email: string;
  metadata: Record<string, unknown>;
};

const readMetadataText = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
};

const normalizeEmail = (value?: string | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const bytesToHex = (value: Uint8Array) => {
  return Array.from(value, (entry) => entry.toString(16).padStart(2, "0")).join(
    "",
  );
};

const buildGravatarUrl = (hash: string) => {
  return `https://www.gravatar.com/avatar/${hash}?d=mp&s=160`;
};

const getInitials = (value: string) => {
  const parts = value
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

const parseDebtorAccount = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("de-DE");
};

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

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen");
  }
  return data;
};

// Campai liefert die Status als freien Text — nur ein eindeutig offener
// Beleg zählt als offen, alles Unklare bleibt neutral.
const isInvoiceOpen = (invoice: InvoicePayload) => {
  const raw = `${invoice.status ?? ""} ${invoice.paymentStatus ?? ""}`
    .trim()
    .toLowerCase();
  if (!raw) return false;
  if (/(bezahlt|paid|beglichen|settled|closed)/.test(raw)) return false;
  return /(offen|open|unpaid|due|f[aä]llig|overdue)/.test(raw);
};

const invoiceBadgeTone = (invoice: InvoicePayload): BadgeTone => {
  const raw = `${invoice.status ?? ""} ${invoice.paymentStatus ?? ""}`
    .trim()
    .toLowerCase();
  if (/(bezahlt|paid|beglichen|settled)/.test(raw)) return "gebucht";
  if (isInvoiceOpen(invoice)) return "offen";
  return "neutral";
};

const invoiceTotal = (invoice: InvoicePayload) =>
  invoice.totalGross ?? invoice.totalNet ?? null;

const labelClassName = "knglmrt-caption block text-muted-foreground";

const fieldClassName =
  "w-full border border-input bg-card px-3.5 py-2 text-[length:var(--ui-size-body)]";

const readOnlyFieldClassName =
  "w-full border border-border bg-muted px-3.5 py-2 text-[length:var(--ui-size-body)] text-muted-foreground";

const panelClassName = "knglmrt-border bg-card p-[18px]";

// Beispiel-Tarife für die Zugangskarte. Noch nicht angebunden — sobald die
// Tarife aus Campai kommen, ersetzt diese Liste die Auswahl.
const ACCESS_CARD_PLANS = [
  { id: "punktekarte", label: "Punktekarte – 50 € für 10 Zugänge" },
  { id: "abo-klein", label: "Abo Klein – 15 €/Monat für 15 Zugänge/Quartal" },
  { id: "abo-gross", label: "Abo Groß – 30 €/Monat für 24/7-Zugang" },
] as const;

// Gleiche Marke wie in der Navigation: kein eigener Look für „kommt noch".
function SoonBadge() {
  return (
    <span className="whitespace-nowrap rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
      Coming soon
    </span>
  );
}

type AccountClientProps = {
  roleLabels: string[];
  // Kommt fertig aus der Server-Hülle. Damit steht der Kopf — Name, E-Mail,
  // Rollen, Abmelden — schon im ersten Paint, ohne Fetch nach dem Mount.
  initialUser: AccountUser | null;
};

export default function AccountClient({
  roleLabels,
  initialUser,
}: AccountClientProps) {
  const searchParams = useSearchParams();
  const debug = useMemo(
    () => searchParams.get("debug") === "1",
    [searchParams],
  );
  const status = searchParams.get("status");
  const message = searchParams.get("message");
  const error = searchParams.get("error");

  const [user, setUser] = useState<AccountUser | null>(initialUser);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(() =>
    initialUser ? readMetadataText(initialUser.metadata, "avatar_url") : "",
  );
  const [shortBio, setShortBio] = useState(() =>
    initialUser ? readMetadataText(initialUser.metadata, "short_bio") : "",
  );
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [campaiInvoices, setCampaiInvoices] = useState<InvoicePayload[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [campaiError, setCampaiError] = useState<string | null>(null);
  const [campaiDebug, setCampaiDebug] = useState<unknown>(null);
  const [debtorAccount, setDebtorAccount] = useState<number | null>(null);
  const [gravatarUrl, setGravatarUrl] = useState("");
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);
  const [accessCardPlan, setAccessCardPlan] = useState<string>(
    ACCESS_CARD_PLANS[1].id,
  );

  const hasAccount = Boolean(initialUser);

  const fullName = useMemo(() => {
    const first =
      typeof user?.metadata.first_name === "string"
        ? user.metadata.first_name.trim()
        : "";
    const last =
      typeof user?.metadata.last_name === "string"
        ? user.metadata.last_name.trim()
        : "";

    return [first, last].filter(Boolean).join(" ");
  }, [user]);

  const campaiName = useMemo(() => {
    const linkedName =
      typeof user?.metadata.campai_name === "string"
        ? user.metadata.campai_name.trim()
        : "";

    return linkedName || fullName;
  }, [fullName, user]);

  const linkedDebtorAccount = useMemo(
    () => parseDebtorAccount(user?.metadata.campai_debtor_account),
    [user],
  );

  const displayName = useMemo(() => {
    return campaiName || fullName || user?.email?.trim() || "";
  }, [campaiName, fullName, user?.email]);

  const avatarCandidateUrls = useMemo(() => {
    return Array.from(new Set([avatarUrl.trim(), gravatarUrl].filter(Boolean)));
  }, [avatarUrl, gravatarUrl]);

  const activeAvatarUrl = avatarCandidateUrls[avatarCandidateIndex] ?? "";
  const avatarCandidateKey = avatarCandidateUrls.join("|");

  // Der Live-Name aus Campai kostet Sekunden: die Suche blättert seitenweise
  // durch alle Kontakte, bis die verknüpfte ID auftaucht. Deshalb rendert die
  // Seite mit dem in member_profiles gespeicherten Namen und zieht Campai erst
  // nach dem ersten Paint nach — und nur, wenn dort etwas anderes steht.
  useEffect(() => {
    if (!hasAccount) {
      return;
    }

    let active = true;

    const refreshCampaiName = async () => {
      try {
        const data = await fetchJson<{ name: string | null }>(
          "/api/account/campai-name",
        );
        const liveName = data.name?.trim();
        if (!active || !liveName) {
          return;
        }
        setUser((current) => {
          if (!current || current.metadata.campai_name === liveName) {
            return current;
          }
          return {
            ...current,
            metadata: { ...current.metadata, campai_name: liveName },
          };
        });
      } catch {
        // Ohne Campai bleibt der gespeicherte Name stehen — kein Fehlerfall
        // für die Seite.
      }
    };

    void refreshCampaiName();

    return () => {
      active = false;
    };
  }, [hasAccount]);

  useEffect(() => {
    const normalizedEmail = normalizeEmail(user?.email);

    if (
      !normalizedEmail ||
      typeof window === "undefined" ||
      !window.crypto?.subtle
    ) {
      setGravatarUrl("");
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

      setGravatarUrl(buildGravatarUrl(bytesToHex(new Uint8Array(digest))));
    };

    void loadGravatarUrl();

    return () => {
      active = false;
    };
  }, [user?.email]);

  useEffect(() => {
    setAvatarCandidateIndex(0);
  }, [avatarCandidateKey]);

  useEffect(() => {
    if (!hasAccount || linkedDebtorAccount === null) {
      setCampaiInvoices([]);
      setDebtorAccount(null);
      setCampaiDebug(null);
      setInvoicesLoading(false);
      return;
    }

    let active = true;
    const loadInvoices = async () => {
      setCampaiError(null);
      setInvoicesLoading(true);
      try {
        setDebtorAccount(linkedDebtorAccount);

        const data = await fetchJson<{
          invoices: InvoicePayload[];
          debug?: unknown;
        }>("/api/campai/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sort: { receiptDate: "desc" },
            limit: 100,
            offset: 0,
            account: linkedDebtorAccount,
            debug,
          }),
        });
        if (!active) {
          return;
        }
        setCampaiInvoices(data.invoices ?? []);
        setCampaiDebug(data.debug ?? null);
      } catch (fetchError) {
        if (active) {
          setDebtorAccount(null);
          setCampaiInvoices([]);
          setCampaiError(
            fetchError instanceof Error
              ? fetchError.message
              : "Campai-Belege konnten nicht geladen werden.",
          );
        }
      } finally {
        if (active) {
          setInvoicesLoading(false);
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [hasAccount, linkedDebtorAccount, debug]);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProfileStatus(null);
    setProfileError(null);
    try {
      await fetchJson("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarUrl,
          shortBio,
        }),
      });
      setProfileStatus("Profil gespeichert.");
    } catch (submitError) {
      setProfileError(
        submitError instanceof Error
          ? submitError.message
          : "Profil konnte nicht gespeichert werden.",
      );
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);
    setPasswordError(null);
    try {
      await fetchJson("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, passwordConfirm }),
      });
      setPasswordStatus("Passwort aktualisiert.");
      setPassword("");
      setPasswordConfirm("");
    } catch (submitError) {
      setPasswordError(
        submitError instanceof Error
          ? submitError.message
          : "Passwort konnte nicht aktualisiert werden.",
      );
    }
  };

  const openInvoices = useMemo(
    () => campaiInvoices.filter(isInvoiceOpen),
    [campaiInvoices],
  );

  const openInvoicesTotal = useMemo(
    () =>
      openInvoices.reduce(
        (sum, invoice) => sum + (invoiceTotal(invoice) ?? 0),
        0,
      ),
    [openInvoices],
  );

  if (!user) {
    return (
      <div className={panelClassName}>
        <h2 className="mb-1">Anmeldung erforderlich</h2>
        <p className="mb-4 text-muted-foreground">
          Bitte melde dich an, um dein Profil zu verwalten.
        </p>
        <Button
          href="/login?redirectedFrom=/account"
          kind="primary"
          className="px-4 py-2"
        >
          Anmelden
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Kopf: quadratischer Avatar (das DS kennt keine Kreise), Name,
          eine Mono-Zeile mit den harten Fakten. Alle Werte kommen aus der
          Server-Hülle, deshalb steht der Kopf inklusive Abmelden-Button
          sofort — hier wird auf nichts mehr gewartet. */}
      <header className="mb-[22px] flex flex-wrap items-center gap-4">
        {activeAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeAvatarUrl}
            alt={displayName || user.email || "Profilbild"}
            className="h-14 w-14 flex-none knglmrt-border object-cover"
            onError={() => {
              setAvatarCandidateIndex((currentIndex) => currentIndex + 1);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center knglmrt-border bg-primary-soft font-bold"
          >
            {getInitials(displayName || user.email || "?")}
          </span>
        )}
        <div className="min-w-[240px] flex-1">
          <h1 className="mb-0.5">{displayName || "Dein Profil"}</h1>
          <p className="knglmrt-num text-muted-foreground">
            {[user.email, roleLabels.join(" · ")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" kind="secondary">
            Abmelden
          </Button>
        </form>
      </header>

      {error ? (
        <div className="mb-4 border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive">
          {decodeURIComponent(error)}
        </div>
      ) : null}
      {status ? (
        <div className="mb-4 border border-success-border bg-success-soft px-4 py-3">
          {message ? decodeURIComponent(message) : "Gespeichert."}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_minmax(0,460px)]">
        <section id="profil" className={panelClassName}>
          <h2 className="mb-1">Profil</h2>
          <p className="mb-4 text-muted-foreground">
            Bild und Kurzbiografie erscheinen als Autoreninfo an deinen
            Beiträgen. Der Name kommt direkt aus Campai.
          </p>
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
            <div>
              <label className={labelClassName} htmlFor="account-campai-name">
                Name in Campai
              </label>
              <input
                id="account-campai-name"
                type="text"
                value={campaiName}
                readOnly
                placeholder="Kein Campai-Kontakt verknüpft"
                className={`mt-1 ${readOnlyFieldClassName}`}
              />
              <p className="mt-1 text-muted-foreground">
                Soll der Name sich ändern, ändere ihn bitte direkt in Campai.
              </p>
            </div>
            <div>
              <label className={labelClassName} htmlFor="account-email">
                E-Mail
              </label>
              <input
                id="account-email"
                type="email"
                value={user?.email ?? ""}
                disabled
                className={`mt-1 ${readOnlyFieldClassName}`}
              />
            </div>
            <div>
              <label className={labelClassName} htmlFor="account-avatar-url">
                Profilbild-URL
              </label>
              <input
                id="account-avatar-url"
                name="avatarUrl"
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://…"
                className={`mt-1 ${fieldClassName}`}
              />
              <p className="mt-1 text-muted-foreground">
                Ohne URL — oder wenn das Bild nicht lädt — nutzen wir dein
                Gravatar anhand deiner E-Mail-Adresse.
              </p>
            </div>
            <div>
              <label className={labelClassName} htmlFor="account-short-bio">
                Kurzbiografie
              </label>
              <textarea
                id="account-short-bio"
                name="shortBio"
                value={shortBio}
                onChange={(event) => setShortBio(event.target.value)}
                rows={4}
                placeholder="Ein kurzer Satz zu dir, deiner Werkstattpraxis oder deinem Schwerpunkt."
                className={`mt-1 ${fieldClassName}`}
              />
            </div>
            <Button type="submit" kind="primary" className="w-fit px-4 py-2">
              Profil speichern
            </Button>
            {profileError ? (
              <p className="text-destructive">{profileError}</p>
            ) : null}
            {profileStatus ? (
              <p className="font-bold">{profileStatus}</p>
            ) : null}
          </form>
        </section>

        <section id="sicherheit" className={panelClassName}>
          <h2 className="mb-1">Passwort ändern</h2>
          <p className="mb-4 text-muted-foreground">
            Wähle ein neues Passwort mit mindestens 8 Zeichen.
          </p>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div>
              <label className={labelClassName}>Neues Passwort</label>
              <PasswordInput
                name="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className={`mt-1 ${fieldClassName}`}
              />
            </div>
            <div>
              <label className={labelClassName}>Passwort bestätigen</label>
              <PasswordInput
                name="passwordConfirm"
                required
                minLength={8}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className={`mt-1 ${fieldClassName}`}
              />
            </div>
            <Button type="submit" kind="primary" className="w-fit px-4 py-2">
              Passwort aktualisieren
            </Button>
            {passwordError ? (
              <p className="text-destructive">{passwordError}</p>
            ) : null}
            {passwordStatus ? (
              <p className="font-bold">{passwordStatus}</p>
            ) : null}
          </form>
        </section>
      </div>

      {/* Zugangskarte und Ehrenamtsbonus sind noch nicht angebunden: die
          Kacheln zeigen Beispielwerte und tote Bedienelemente, damit die
          Struktur der Seite schon steht. Sobald es echte Daten gibt, fallen
          nur die Platzhalter-Werte und das SoonBadge weg. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_minmax(0,460px)]">
        <section id="zugangskarte" className={panelClassName}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="m-0">Zugangskarte</h2>
            <SoonBadge />
          </div>
          <p className="mb-4 text-muted-foreground">
            Deine Karte öffnet die Werkbereiche und bucht dabei Zugänge von
            deinem Tarif ab. Beispielwerte — die Anbindung an die Schließanlage
            folgt.
          </p>

          <div className="mb-4 grid gap-3.5 sm:grid-cols-2">
            <StatTile
              label="Verbleibende Zugänge"
              value="9"
              hint="von 15 · Quartal läuft bis 30.09.2026"
              percent={60}
              tone="rosa"
            />
            <StatTile
              label="Letzte Abbuchung"
              value="04.08.2026"
              hint="Werkbereich Holz · 1 Zugang"
              tone="grau"
            />
          </div>

          <div className="mb-4">
            <label
              className={labelClassName}
              htmlFor="account-zugangskarte-tarif"
            >
              Tarif wechseln
            </label>
            <select
              id="account-zugangskarte-tarif"
              value={accessCardPlan}
              onChange={(event) => setAccessCardPlan(event.target.value)}
              className={`mt-1 ${fieldClassName}`}
            >
              {ACCESS_CARD_PLANS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-muted-foreground">
              Ein Wechsel gilt ab dem nächsten Abrechnungsmonat.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" kind="primary" disabled>
              Tarif wechseln
            </Button>
            <Button type="button" kind="danger-secondary" disabled>
              Karte verloren
            </Button>
          </div>
        </section>

        <section id="ehrenamtsbonus" className={panelClassName}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="m-0">Ehrenamtsbonus beantragen</h2>
            <SoonBadge />
          </div>
          <p className="mb-4 text-muted-foreground">
            Für ehrenamtliche Arbeit im Verein kannst du je nach Umfang
            zusätzliche Zugangstage für das folgende Quartal bekommen oder
            bekommst sogar den 24/7-Zugang erlassen.
          </p>
          <Button type="button" kind="secondary" disabled>
            Antrag starten
          </Button>
        </section>
      </div>

      <section id="rechnungen" className="mt-[38px]">
        <div className="mb-3.5 flex flex-wrap items-baseline gap-3">
          <h2 className="m-0">Meine Rechnungen</h2>
          <span className="knglmrt-num text-muted-foreground">
            {invoicesLoading
              ? "Belege werden geladen …"
              : debtorAccount
                ? `Debitor ${campaiName || "Campai-Profil"} · Konto ${debtorAccount}`
                : "Kein Campai-Debitor im Profil hinterlegt"}
          </span>
        </div>

        <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2">
          <StatTile
            label="Offene Rechnungen"
            value={
              invoicesLoading
                ? "…"
                : openInvoices.length > 0
                  ? formatAmount(openInvoicesTotal, "EUR")
                  : "0,00 €"
            }
            hint={
              invoicesLoading
                ? "Belege werden geladen …"
                : openInvoices.length === 1
                  ? "1 offener Beleg"
                  : `${openInvoices.length} offene Belege`
            }
            tone="rosa"
          />
          <StatTile
            label="Belege gesamt"
            value={invoicesLoading ? "…" : String(campaiInvoices.length)}
            hint={
              invoicesLoading
                ? "Belege werden geladen …"
                : debtorAccount
                  ? `Debitor-Konto ${debtorAccount}`
                  : "Kein Campai-Debitor verknüpft"
            }
            tone="grau"
          />
        </div>

        {campaiError ? (
          <p className="text-destructive">{campaiError}</p>
        ) : (
          <Table>
            <THead>
              <Th>Beleg</Th>
              <Th>Ausgestellt</Th>
              <Th>Fällig</Th>
              <Th>Betrag</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Download</span>
              </Th>
            </THead>
            <TBody>
              {invoicesLoading ? (
                <TableEmpty colSpan={6}>Belege werden geladen …</TableEmpty>
              ) : campaiInvoices.length === 0 ? (
                <TableEmpty colSpan={6}>
                  {linkedDebtorAccount === null
                    ? "Dein Konto ist noch nicht mit einem Campai-Debitor verknüpft."
                    : `Keine Belege für Debitor-Konto ${debtorAccount} gefunden.`}
                </TableEmpty>
              ) : (
                campaiInvoices.map((invoice) => (
                  <Tr key={invoice.id} interactive>
                    <Td>
                      <span className="block font-bold">
                        {invoice.receiptNumber ?? "Beleg"}
                      </span>
                      {invoice.title ? (
                        <span className="block text-muted-foreground">
                          {invoice.title}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="knglmrt-num text-muted-foreground">
                      {formatDate(invoice.receiptDate)}
                    </Td>
                    <Td className="knglmrt-num text-muted-foreground">
                      {formatDate(invoice.dueDate)}
                    </Td>
                    <Td className="knglmrt-num whitespace-nowrap">
                      {formatAmount(invoiceTotal(invoice), invoice.currency)}
                    </Td>
                    <Td>
                      {invoice.status ? (
                        <Badge tone={invoiceBadgeTone(invoice)}>
                          {invoice.status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <a
                        href={`/api/campai/invoices/${invoice.id}/download`}
                        className="whitespace-nowrap font-bold text-primary"
                      >
                        Herunterladen
                      </a>
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        )}

        {debug && campaiDebug ? (
          <pre className="mt-4 max-h-64 overflow-auto bg-foreground p-4 text-xs text-background">
            {JSON.stringify(campaiDebug, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
