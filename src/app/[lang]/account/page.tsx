"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { type InvoicePayload } from "@/lib/campai-invoices";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";
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

export default function AccountPage() {
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

  return (
    <div className="space-y-6">
      <PageTitle
        title="Konto"
        subTitle="Verwalte deine Profildaten und dein Passwort."
      />

      {error ? (
        <section className="rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {decodeURIComponent(error)}
        </section>
      ) : null}

      {status ? (
        <section className="rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
          {message ? decodeURIComponent(message) : "Gespeichert."}
        </section>
      ) : null}

      {loadingUser ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Konto wird geladen ...</p>
        </section>
      ) : accountLoadError ? (
        <section className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-destructive">
            Konto konnte nicht geladen werden
          </h2>
          <p className="mt-2 text-sm text-destructive">{accountLoadError}</p>
        </section>
      ) : !user ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Anmeldung erforderlich
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Bitte melde dich an, um deine Kontoeinstellungen zu verwalten.
          </p>
          <Button
            href="/login?redirectedFrom=/account"
            kind="primary"
            className="mt-4 px-4 py-2 text-sm"
          >
            Anmelden
          </Button>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Profil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dein Name wird direkt aus Campai übernommen.
            </p>
            <form onSubmit={handleProfileSubmit} className="mt-6 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-muted/50 px-4 py-4">
                {activeAvatarUrl ? (
                  <img
                    src={activeAvatarUrl}
                    alt={displayName || user.email || "Profilbild"}
                    className="h-16 w-16 rounded-full object-cover"
                    onError={() => {
                      setAvatarCandidateIndex(
                        (currentIndex) => currentIndex + 1,
                      );
                    }}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-lg font-semibold text-muted-foreground">
                    {getInitials(displayName || user.email || "?")}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    {displayName || "Dein Profil"}
                  </p>
                  <p>
                    Das Bild und die Kurzbiografie werden bei Projekten als
                    Autoreninfo angezeigt.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Name in Campai
                </label>
                <input
                  type="text"
                  value={campaiName}
                  readOnly
                  placeholder="Kein Campai-Kontakt verknüpft"
                  className="w-full rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Wenn der Name geändert werden soll, ändere ihn bitte direkt in
                  Campai.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Email
                </label>
                <input
                  type="email"
                  value={user.email ?? ""}
                  disabled
                  className="w-full rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Profilbild URL
                </label>
                <input
                  name="avatarUrl"
                  type="url"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Verwende eine öffentlich erreichbare Bild-URL. Wenn keine URL
                  gesetzt ist oder das Bild nicht lädt, verwenden wir dein
                  Gravatar anhand deiner E-Mail-Adresse.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Kurzbiografie
                </label>
                <textarea
                  name="shortBio"
                  value={shortBio}
                  onChange={(event) => setShortBio(event.target.value)}
                  rows={4}
                  placeholder="Ein kurzer Satz zu dir, deiner Werkstattpraxis oder deinem Schwerpunkt."
                  className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Diese Kurzinfo erscheint in der Autorenbox deiner Projekte.
                </p>
              </div>
              <Button
                type="submit"
                kind="primary"
                className="w-full px-4 py-2 text-sm"
              >
                Profil speichern
              </Button>
              {profileError ? (
                <p className="text-sm text-destructive">{profileError}</p>
              ) : null}
              {profileStatus ? (
                <p className="text-sm text-success">{profileStatus}</p>
              ) : null}
            </form>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Passwort</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wähle ein neues Passwort mit mindestens 8 Zeichen.
            </p>
            <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Neues Passwort
                </label>
                <PasswordInput
                  name="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  showLabel="Anzeigen"
                  hideLabel="Ausblenden"
                  className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                  Passwort bestätigen
                </label>
                <PasswordInput
                  name="passwordConfirm"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  showLabel="Anzeigen"
                  hideLabel="Ausblenden"
                  className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
                />
              </div>
              <Button
                type="submit"
                kind="primary"
                className="w-full px-4 py-2 text-sm"
              >
                Passwort aktualisieren
              </Button>
              {passwordError ? (
                <p className="text-sm text-destructive">{passwordError}</p>
              ) : null}
              {passwordStatus ? (
                <p className="text-sm text-success">{passwordStatus}</p>
              ) : null}
            </form>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Meine Belege
                </h2>
                <p className="text-sm text-muted-foreground">
                  {debtorAccount
                    ? `Debitor: ${campaiName || "Campai-Profil"} · Konto ${debtorAccount}`
                    : campaiName
                      ? `Debitor: ${campaiName}`
                      : "Kein Campai-Debitor im Profil hinterlegt"}
                </p>
              </div>
              <p className="text-xs font-semibold text-muted-foreground">
                {campaiInvoices.length} Belege
              </p>
            </div>

            {campaiError ? (
              <p className="mt-4 text-sm text-destructive">{campaiError}</p>
            ) : linkedDebtorAccount === null ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Dein Konto ist noch nicht mit einem Campai-Debitor verknpft.
              </p>
            ) : campaiInvoices.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Keine Belege für Debitor-Konto {debtorAccount} gefunden.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {campaiInvoices.map((invoice) => {
                  const total = invoice.totalGross ?? invoice.totalNet ?? null;
                  return (
                    <article
                      key={invoice.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/60 px-4 py-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {invoice.receiptNumber ?? "Beleg"}
                          {invoice.title ? ` · ${invoice.title}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {invoice.customerName
                            ? `${invoice.customerName} · `
                            : ""}
                          Ausgestellt {formatDate(invoice.receiptDate)}
                          {invoice.dueDate
                            ? ` · Fällig ${formatDate(invoice.dueDate)}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {invoice.status ? (
                          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {invoice.status}
                          </span>
                        ) : null}
                        <span className="font-semibold text-foreground">
                          {formatAmount(total, invoice.currency)}
                        </span>
                        <Button
                          size="small"
                          onClick={() => {
                            window.location.href = `/api/campai/invoices/${invoice.id}/download`;
                          }}
                        >
                          Herunterladen
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {debug && campaiDebug ? (
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-foreground p-4 text-xs text-background">
                {JSON.stringify(campaiDebug, null, 2)}
              </pre>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
