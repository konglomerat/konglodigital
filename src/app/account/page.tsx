"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { type InvoicePayload } from "@/lib/campai-invoices";
import Button from "../components/Button";

type AccountUser = {
  email: string;
  metadata: Record<string, unknown>;
};

const CAMPAI_DEBTOR_NUMBER = "100226";

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
    throw new Error(data.error ?? "Request failed");
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
    if (!user) {
      setCampaiInvoices([]);
      return;
    }

    let active = true;
    const loadInvoices = async () => {
      setCampaiError(null);
      try {
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
          setCampaiError(
            fetchError instanceof Error
              ? fetchError.message
              : "Unable to load Campai invoices.",
          );
        }
      }
    };

    loadInvoices();

    return () => {
      active = false;
    };
  }, [user, debug]);

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
      setProfileStatus("Profile saved.");
    } catch (submitError) {
      setProfileError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save profile.",
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
      setPasswordStatus("Password updated.");
      setPassword("");
      setPasswordConfirm("");
    } catch (submitError) {
      setPasswordError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update password.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-zinc-600">
          Update your profile details and password.
        </p>
      </header>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {decodeURIComponent(error)}
        </section>
      ) : null}

      {status ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message ? decodeURIComponent(message) : "Saved."}
        </section>
      ) : null}

      {loadingUser ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-500">Loading account...</p>
        </section>
      ) : !user ? (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            Sign in required
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Please sign in to manage your account settings.
          </p>
          <Button
            href="/login?redirectedFrom=/account"
            kind="primary"
            className="mt-4 px-4 py-2 text-sm"
          >
            Sign in
          </Button>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Profile</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Keep your name up to date.
            </p>
            <form onSubmit={handleProfileSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    First name
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
                    Last name
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
                Save profile
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
            <h2 className="text-lg font-semibold text-zinc-900">Password</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Choose a new password at least 8 characters long.
            </p>
            <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  New password
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
                  Confirm password
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
                Update password
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
                  Campai invoices
                </h2>
                <p className="text-sm text-zinc-500">
                  Debtor {CAMPAI_DEBTOR_NUMBER}
                </p>
              </div>
              <p className="text-xs font-semibold text-zinc-500">
                {campaiInvoices.length} invoices
              </p>
            </div>

            {campaiError ? (
              <p className="mt-4 text-sm text-rose-600">{campaiError}</p>
            ) : campaiInvoices.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No invoices found.</p>
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
                          {invoice.receiptNumber ?? "Invoice"}
                          {invoice.title ? ` · ${invoice.title}` : ""}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {invoice.customerName
                            ? `${invoice.customerName} · `
                            : ""}
                          Issued {formatDate(invoice.receiptDate)}
                          {invoice.dueDate
                            ? ` · Due ${formatDate(invoice.dueDate)}`
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
