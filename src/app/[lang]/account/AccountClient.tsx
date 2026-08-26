"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
import SectionNav, {
  type SectionNavItem,
} from "@/components/knglmrt/SectionNav";
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


type AccountSectionKey =
  | "uebersicht"
  | "profil"
  | "rechnungen"
  | "sicherheit";

const SECTION_KEYS: AccountSectionKey[] = [
  "uebersicht",
  "profil",
  "rechnungen",
  "sicherheit",
];

const SECTION_LABELS: Record<AccountSectionKey, string> = {
  uebersicht: "Übersicht",
  profil: "Profil",
  rechnungen: "Rechnungen",
  sicherheit: "Passwort",
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

const panelClassName = "border border-foreground bg-card p-[18px]";

type AccountClientProps = {
  canAccessBackOffice: boolean;
  canAccessFinanzen: boolean;
  backOfficeHref: string;
  roleLabels: string[];
};

export default function AccountClient({
  canAccessBackOffice,
  canAccessFinanzen,
  backOfficeHref,
  roleLabels,
}: AccountClientProps) {
  const searchParams = useSearchParams();
  const debug = useMemo(
    () => searchParams.get("debug") === "1",
    [searchParams],
  );
  const status = searchParams.get("status");
  const message = searchParams.get("message");
  const error = searchParams.get("error");

  const [user, setUser] = useState<AccountUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [shortBio, setShortBio] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [campaiInvoices, setCampaiInvoices] = useState<InvoicePayload[]>([]);
  const [campaiError, setCampaiError] = useState<string | null>(null);
  const [campaiDebug, setCampaiDebug] = useState<unknown>(null);
  const [debtorAccount, setDebtorAccount] = useState<number | null>(null);
  const [gravatarUrl, setGravatarUrl] = useState("");
  const [avatarCandidateIndex, setAvatarCandidateIndex] = useState(0);

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

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      setLoadingUser(true);
      setAccountLoadError(null);
      try {
        const data = await fetchJson<{ user: AccountUser }>("/api/account/me");
        if (!active) {
          return;
        }
        setUser(data.user);
        setAvatarUrl(readMetadataText(data.user.metadata, "avatar_url"));
        setShortBio(readMetadataText(data.user.metadata, "short_bio"));
      } catch (loadError) {
        if (active) {
          setUser(null);
          const errorMessage =
            loadError instanceof Error
              ? loadError.message
              : "Kontodaten konnten nicht geladen werden.";
          if (errorMessage !== "Unauthorized") {
            setAccountLoadError(errorMessage);
          }
        }
      } finally {
        if (active) {
          setLoadingUser(false);
        }
      }
    };

    loadUser();

    return () => {
      active = false;
    };
  }, []);

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
    if (!user || linkedDebtorAccount === null) {
      setCampaiInvoices([]);
      setDebtorAccount(null);
      setCampaiDebug(null);
      return;
    }

    let active = true;
    const loadInvoices = async () => {
      setCampaiError(null);
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
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [user, linkedDebtorAccount, debug]);

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

  const requestedSection = searchParams.get("bereich");
  const activeSection: AccountSectionKey = SECTION_KEYS.includes(
    requestedSection as AccountSectionKey,
  )
    ? (requestedSection as AccountSectionKey)
    : "uebersicht";

  const sectionNavItems: SectionNavItem[] = SECTION_KEYS.map((key) => ({
    key,
    label: SECTION_LABELS[key],
    href: key === "uebersicht" ? "/account" : `/account?bereich=${key}`,
  }));

  const openInvoices = useMemo(
    () => campaiInvoices.filter(isInvoiceOpen),
    [campaiInvoices],
  );

  const openInvoicesTotal = useMemo(
    () =>
      openInvoices.reduce((sum, invoice) => sum + (invoiceTotal(invoice) ?? 0), 0),
    [openInvoices],
  );

  const quickLinks = [
    {
      href: "/checkout",
      title: "Warenkorb",
      description: "Offene Positionen prüfen und abschließen.",
    },
    {
      href: "/products",
      title: "Produkte",
      description: "Was der Verein im Self-Service abgibt.",
    },
    {
      href: "/monatsbeitrag",
      title: "Mitgliedschaft & Beitrag",
      description: "Beitragsstufe einsehen und anpassen.",
    },
    ...(canAccessFinanzen
      ? [
          {
            href: "/receipts",
            title: "Belege",
            description: "Belege einbuchen und prüfen.",
          },
          {
            href: "/balance",
            title: "Guthaben",
            description: "Kontostand und Bewegungen.",
          },
        ]
      : []),
  ];

  if (loadingUser) {
    return (
      <p className="text-muted-foreground">Konto wird geladen …</p>
    );
  }

  if (accountLoadError) {
    return (
      <div className="border border-destructive-border bg-destructive-soft p-[18px]">
        <h2 className="mb-1 text-destructive">
          Konto konnte nicht geladen werden
        </h2>
        <p className="text-destructive">{accountLoadError}</p>
      </div>
    );
  }

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
          eine Mono-Zeile mit den harten Fakten. */}
      <header className="mb-[22px] flex flex-wrap items-center gap-4">
        {activeAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeAvatarUrl}
            alt={displayName || user.email || "Profilbild"}
            className="h-14 w-14 flex-none border border-foreground object-cover"
            onError={() => {
              setAvatarCandidateIndex((currentIndex) => currentIndex + 1);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center border border-foreground bg-primary-soft font-bold"
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

      <SectionNav
        items={sectionNavItems}
        activeKey={activeSection}
        ariaLabel="Profilbereiche"
        className="mb-[22px]"
      />

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

      {activeSection === "uebersicht" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <StatTile
                label="Offene Rechnungen"
                value={
                  openInvoices.length > 0
                    ? formatAmount(openInvoicesTotal, "EUR")
                    : "0,00 €"
                }
                hint={
                  openInvoices.length === 1
                    ? "1 offener Beleg"
                    : `${openInvoices.length} offene Belege`
                }
                tone="rosa"
              />
              <StatTile
                label="Belege gesamt"
                value={String(campaiInvoices.length)}
                hint={
                  debtorAccount
                    ? `Debitor-Konto ${debtorAccount}`
                    : "Kein Campai-Debitor verknüpft"
                }
                tone="grau"
              />
            </div>

            <section>
              <h2 className="mb-2.5">Schnellzugriff</h2>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {quickLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col gap-1.5 border border-foreground bg-card p-[18px] transition hover:bg-primary-soft"
                  >
                    <span className="knglmrt-card-title">{link.title}</span>
                    <span className="text-muted-foreground">
                      {link.description}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-3.5">
            <div className="bg-muted px-[18px] py-4">
              <div className="knglmrt-caption mb-2 text-muted-foreground">
                Mitgliedschaft
              </div>
              {[
                { label: "E-Mail", value: user.email || "—" },
                { label: "Campai", value: campaiName || "nicht verknüpft" },
                {
                  label: "Debitor",
                  value: debtorAccount ? `#${debtorAccount}` : "—",
                },
                { label: "Rollen", value: roleLabels.join(", ") || "—" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="knglmrt-num flex justify-between gap-3 border-t border-border py-1.5"
                >
                  <span>{row.label}</span>
                  <span className="truncate text-muted-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {canAccessBackOffice ? (
              <div className="flex flex-col gap-2.5 bg-[var(--knglmrt-dark-100)] px-[18px] py-4 text-white">
                <div className="knglmrt-caption text-[var(--knglmrt-dark-30)]">
                  Back-Office
                </div>
                <p>
                  Mitglieder, Einladungen und Raumbuchungen verwaltest du im
                  Back-Office.
                </p>
                {/* Auf der dunklen Fläche kehrt die sekundäre Taste um:
                    weiße Kontur statt schwarzer, sonst dieselben Maße. */}
                <Button
                  href={backOfficeHref}
                  kind="secondary"
                  size="chip"
                  className="w-fit border-white bg-transparent text-white hover:bg-white hover:text-[var(--knglmrt-dark-100)]"
                >
                  Back-Office öffnen
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {activeSection === "profil" ? (
        <section className={`${panelClassName} max-w-[640px]`}>
          <h2 className="mb-1">Profil</h2>
          <p className="mb-4 text-muted-foreground">
            Bild und Kurzbiografie erscheinen als Autoreninfo an deinen
            Projekten. Der Name kommt direkt aus Campai.
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
                value={user.email ?? ""}
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
            {profileStatus ? <p className="font-bold">{profileStatus}</p> : null}
          </form>
        </section>
      ) : null}

      {activeSection === "rechnungen" ? (
        <section>
          <div className="mb-2.5 flex flex-wrap items-baseline gap-3">
            <h2 className="m-0">Rechnungen</h2>
            <span className="knglmrt-num text-muted-foreground">
              {debtorAccount
                ? `Debitor ${campaiName || "Campai-Profil"} · Konto ${debtorAccount}`
                : "Kein Campai-Debitor im Profil hinterlegt"}
            </span>
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
                {campaiInvoices.length === 0 ? (
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
      ) : null}

      {activeSection === "sicherheit" ? (
        <section className={`${panelClassName} max-w-[460px]`}>
          <h2 className="mb-1">Passwort</h2>
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
      ) : null}
    </div>
  );
}
