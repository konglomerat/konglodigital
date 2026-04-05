"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import Button from "../../components/Button";
import PasswordInput from "../../components/PasswordInput";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

export default function PasswordResetCompletePage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      setIsLoading(true);
      setError(null);

      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && isMounted) {
          setError("Der Reset-Link ist ungueltig oder abgelaufen.");
          setIsLoading(false);
          return;
        }
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError || !user) {
        setError("Der Reset-Link ist ungueltig oder abgelaufen.");
        setIsLoading(false);
        return;
      }

      setIsReady(true);
      setIsLoading(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (session?.user) {
        setIsReady(true);
        setError(null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "").trim();
    const passwordConfirmation = String(
      formData.get("passwordConfirmation") ?? "",
    ).trim();

    if (password.length < 8) {
      setError("Bitte verwende ein Passwort mit mindestens 8 Zeichen.");
      setIsSaving(false);
      return;
    }

    if (password !== passwordConfirmation) {
      setError("Die Passwoerter stimmen nicht ueberein.");
      setIsSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsSaving(false);
      return;
    }

    await supabase.auth.signOut();
    setSuccess(
      "Dein Passwort wurde gespeichert. Du kannst dich jetzt anmelden.",
    );
    setIsSaving(false);
    form.reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Neues Passwort setzen
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Vergib jetzt ein neues Passwort fuer dein Konto.
        </p>

        {isLoading ? (
          <p className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Reset-Link wird geprueft ...
          </p>
        ) : null}

        {isReady ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="password-reset-complete-password"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
              >
                Neues Passwort
              </label>
              <PasswordInput
                id="password-reset-complete-password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password-reset-complete-password-confirmation"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
              >
                Passwort wiederholen
              </label>
              <PasswordInput
                id="password-reset-complete-password-confirmation"
                name="passwordConfirmation"
                minLength={8}
                required
                autoComplete="new-password"
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <p>{success}</p>
                <Link className="font-semibold underline" href="/login">
                  Zur Anmeldung
                </Link>
              </div>
            ) : null}

            <Button
              type="submit"
              kind="primary"
              className="w-full px-4 py-2 text-sm"
              disabled={isSaving}
            >
              {isSaving
                ? "Passwort wird gespeichert ..."
                : "Neues Passwort speichern"}
            </Button>
          </form>
        ) : null}

        {!isLoading && !isReady && error ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            <p>{error}</p>
            <Link className="font-semibold underline" href="/password-reset">
              Neuen Reset-Link anfordern
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
