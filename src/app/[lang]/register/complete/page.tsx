"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import Button from "../../components/Button";
import PasswordInput from "../../components/PasswordInput";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowserClient();

type RegistrationProfile = {
  firstName: string;
  lastName: string;
  memberNumber: string;
};

const getRegistrationProfile = async (
  user: User | null,
): Promise<RegistrationProfile | null> => {
  if (!user) {
    return null;
  }

  const firstName =
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name.trim()
      : "";
  const lastName =
    typeof user.user_metadata?.last_name === "string"
      ? user.user_metadata.last_name.trim()
      : "";

  if (!firstName || !lastName) {
    return null;
  }

  const { data, error } = await supabase
    .from("member_profiles")
    .select("campai_member_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const memberNumber =
    typeof data?.campai_member_number === "string"
      ? data.campai_member_number.trim()
      : "";

  return { firstName, lastName, memberNumber };
};

export default function RegisterCompletePage() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<RegistrationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      setIsLoading(true);
      setError(null);

      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && isMounted) {
          setError("Der Registrierungslink ist ungueltig oder abgelaufen.");
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

      if (userError) {
        setError("Der Registrierungslink konnte nicht geladen werden.");
        setIsLoading(false);
        return;
      }

      let nextProfile: RegistrationProfile | null = null;

      try {
        nextProfile = await getRegistrationProfile(user);
      } catch {
        setError("Der Registrierungslink konnte nicht geladen werden.");
        setIsLoading(false);
        return;
      }

      if (!nextProfile) {
        setError(
          "Dieser Registrierungslink ist ungueltig, unvollstaendig oder bereits abgelaufen.",
        );
        setIsLoading(false);
        return;
      }

      setProfile(nextProfile);
      setIsLoading(false);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) {
          return;
        }

        try {
          const nextProfile = await getRegistrationProfile(
            session?.user ?? null,
          );
          if (nextProfile) {
            setProfile(nextProfile);
            setError(null);
            setIsLoading(false);
          }
        } catch {
          setError("Der Registrierungslink konnte nicht geladen werden.");
          setIsLoading(false);
        }
      })();
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
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Registrierung abschliessen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vergib jetzt dein Passwort. Die Stammdaten stammen direkt aus deinem
          Mitgliedskonto.
        </p>

        {isLoading ? (
          <p className="mt-6 rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Registrierungslink wird geladen ...
          </p>
        ) : null}

        {profile ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="register-complete-first-name"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
                >
                  Vorname
                </label>
                <input
                  id="register-complete-first-name"
                  value={profile.firstName}
                  disabled
                  autoComplete="off"
                  className="w-full rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="register-complete-last-name"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
                >
                  Nachname
                </label>
                <input
                  id="register-complete-last-name"
                  value={profile.lastName}
                  disabled
                  autoComplete="off"
                  className="w-full rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
                />
              </div>
            </div>

            {profile.memberNumber ? (
              <div className="space-y-2">
                <label
                  htmlFor="register-complete-member-number"
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
                >
                  Mitgliedsnummer
                </label>
                <input
                  id="register-complete-member-number"
                  value={profile.memberNumber}
                  disabled
                  autoComplete="off"
                  className="w-full rounded-md border border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor="register-complete-password"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
              >
                Passwort
              </label>
              <PasswordInput
                id="register-complete-password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="register-complete-password-confirmation"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
              >
                Passwort wiederholen
              </label>
              <PasswordInput
                id="register-complete-password-confirmation"
                name="passwordConfirmation"
                minLength={8}
                required
                autoComplete="new-password"
                showLabel="Anzeigen"
                hideLabel="Ausblenden"
                className="w-full rounded-md border border-border bg-card px-4 py-2 text-sm"
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="space-y-2 rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
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
                : "Registrierung abschliessen"}
            </Button>
          </form>
        ) : null}

        {!isLoading && !profile && error ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-4 text-sm text-destructive">
            <p>{error}</p>
            <Link className="font-semibold underline" href="/register">
              Neue Registrierung starten
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
