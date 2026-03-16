"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { type InvoicePayload } from "@/lib/campai-invoices";
import Button from "../components/Button";

type AccountUser = {
  email: string;
  metadata: Record<string, unknown>;
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
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [campaiInvoices, setCampaiInvoices] = useState<InvoicePayload[]>([]);
  const [campaiError, setCampaiError] = useState<string | null>(null);
  const [campaiDebug, setCampaiDebug] = useState<unknown>(null);
  const [debtorAccount, setDebtorAccount] = useState<number | null>(null);

  const fullName = useMemo(() => {
    const first = typeof user?.metadata.first_name === "string"
      ? user.metadata.first_name.trim()
      : "";
    const last = typeof user?.metadata.last_name === "string"
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

  useEffect(() => {
    let active = true;
    const loadUser = async () => {
      setLoadingUser(true);
      try {
        const data = await fetchJson<{ user: AccountUser }>("/api/account/me");
        if (!active) {
          return;
        }
        setUser(data.user);
        setFirstName(
          typeof data.user.metadata.first_name === "string"
            ? data.user.metadata.first_name
            : "",
        );
        setLastName(
          typeof data.user.metadata.last_name === "string"
            ? data.user.metadata.last_name
            : "",
        );
      } catch {
        if (active) {
          setUser(null);
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
        body: JSON.stringify({ firstName, lastName }),
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-zinc-600">
          Verwalte deine Profildaten und dein Passwort.
        </p>
      </header>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {decodeURIComponent(error)}
        </section>
      ) : null}

      {status ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message ? decodeURIComponent(message) : "Gespeichert."}
        </section>
      ) : null}

      {loadingUser ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">Konto wird geladen ...</p>
        </section>
      ) : !user ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Anmeldung erforderlich
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
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
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Profil</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Halte deinen Namen aktuell.
            </p>
            <form onSubmit={handleProfileSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Vorname
                  </label>
                  <input
                    name="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Nachname
                  </label>
                  <input
                    name="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Email
                </label>
                <input
                  type="email"
                  value={user.email ?? ""}
                  disabled
                  className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-500"
                />
              </div>
              <Button
                type="submit"
                kind="primary"
                className="w-full px-4 py-2 text-sm"
              >
                Profil speichern
              </Button>
              {profileError ? (
                <p className="text-sm text-rose-600">{profileError}</p>
              ) : null}
              {profileStatus ? (
                <p className="text-sm text-emerald-700">{profileStatus}</p>
              ) : null}
            </form>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Passwort</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Wähle ein neues Passwort mit mindestens 8 Zeichen.
            </p>
            <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Neues Passwort
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Passwort bestätigen
                </label>
                <input
                  name="passwordConfirm"
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                <p className="text-sm text-rose-600">{passwordError}</p>
              ) : null}
              {passwordStatus ? (
                <p className="text-sm text-emerald-700">{passwordStatus}</p>
              ) : null}
            </form>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Meine Belege
                </h2>
                <p className="text-sm text-zinc-500">
                  {debtorAccount
                    ? `Debitor: ${campaiName || "Campai-Profil"} · Konto ${debtorAccount}`
                    : campaiName
                      ? `Debitor: ${campaiName}`
                      : "Kein Campai-Debitor im Profil hinterlegt"}
                </p>
              </div>
              <p className="text-xs font-semibold text-zinc-500">
                {campaiInvoices.length} Belege
              </p>
            </div>

            {campaiError ? (
              <p className="mt-4 text-sm text-rose-600">{campaiError}</p>
            ) : linkedDebtorAccount === null ? (
              <p className="mt-4 text-sm text-zinc-500">
                Dein Konto ist noch nicht mit einem Campai-Debitor verknpft.
              </p>
            ) : campaiInvoices.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                Keine Belege für Debitor-Konto {debtorAccount} gefunden.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {campaiInvoices.map((invoice) => {
                  const total = invoice.totalGross ?? invoice.totalNet ?? null;
                  return (
                    <article
                      key={invoice.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 px-4 py-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-zinc-900">
                          {invoice.receiptNumber ?? "Beleg"}
                          {invoice.title ? ` · ${invoice.title}` : ""}
                        </p>
                        <p className="text-xs text-zinc-500">
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
                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                            {invoice.status}
                          </span>
                        ) : null}
                        <span className="font-semibold text-zinc-900">
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
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-zinc-950 p-4 text-xs text-zinc-100">
                {JSON.stringify(campaiDebug, null, 2)}
              </pre>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
