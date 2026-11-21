"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import Button from "@/components/knglmrt/Button";
import PasswordInput from "../../components/PasswordInput";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Field from "@/components/knglmrt/Field";

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

const LINK_INVALID_MESSAGE =
  "Dieser Registrierungslink ist abgelaufen oder wurde bereits verwendet.";

// Ein abgelaufener Link verrät nicht, zu wem er gehört — deshalb fragt das
// Formular die Adresse ab. Die Antwort bleibt neutral, ob es ein Konto gibt.
const ResendInviteForm = () => {
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? "Die Einladung konnte nicht gesendet werden.");
        return;
      }
      setIsSent(true);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setIsSending(false);
    }
  };

  if (isSent) {
    return (
      <p
        role="status"
        className="mt-6 rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm text-success"
      >
        Wenn zu dieser Adresse eine Einladung gehört, ist eine neue Mail
        unterwegs. Schau bitte auch im Spam-Ordner nach.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <p className="text-foreground">
        Du kannst dir selbst einen neuen Link schicken: Gib dafür hier die
        E-Mail-Adresse ein, an die deine Einladung gegangen ist, und klicke auf
        „Neue Einladung senden“. Du bekommst dann eine neue Mail und kannst
        deine Registrierung abschließen.
      </p>
      <Field
        id="register-complete-resend-email"
        label="E-Mail-Adresse"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <Button
        fullWidth
        size="small"
        type="submit"
        kind="primary"
        disabled={isSending}
      >
        {isSending ? "Einladung wird gesendet ..." : "Neue Einladung senden"}
      </Button>
    </form>
  );
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
          setError(LINK_INVALID_MESSAGE);
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

      // Ohne gültigen Link gibt es keine Sitzung, auch das landet hier.
      if (userError) {
        setError(LINK_INVALID_MESSAGE);
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
        setError(LINK_INVALID_MESSAGE);
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
      <div className="knglmrt-border-section w-full max-w-md bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Registrierung abschliessen
        </h1>
        {isLoading || profile ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Vergib jetzt dein Passwort. Die Stammdaten stammen direkt aus deinem
            Mitgliedskonto.
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-6 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Registrierungslink wird geladen ...
          </p>
        ) : null}

        {profile ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Vorname"
                id="register-complete-first-name"
                value={profile.firstName}
                disabled
                autoComplete="off"
              />
              <Field
                label="Nachname"
                id="register-complete-last-name"
                value={profile.lastName}
                disabled
                autoComplete="off"
              />
            </div>

            {profile.memberNumber ? (
              <Field
                label="Mitgliedsnummer"
                id="register-complete-member-number"
                value={profile.memberNumber}
                disabled
                autoComplete="off"
              />
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
              <p className="rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {success ? (
              <div className="space-y-2 rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
                <p>{success}</p>
                <Link className="font-semibold underline" href="/login">
                  Zur Anmeldung
                </Link>
              </div>
            ) : null}

            <Button
              fullWidth
              size="small"
              type="submit"
              kind="primary"
              disabled={isSaving}
            >
              {isSaving
                ? "Passwort wird gespeichert ..."
                : "Registrierung abschliessen"}
            </Button>
          </form>
        ) : null}

        {!isLoading && !profile && error ? (
          <>
            <p className="mt-6 rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
              {error}
            </p>
            <ResendInviteForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link className="font-semibold underline" href="/login">
                Zur Anmeldung
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
