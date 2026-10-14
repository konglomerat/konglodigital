"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";
import Field from "@/components/knglmrt/Field";

export const dynamic = "force-dynamic";

const supabase = createSupabaseBrowserClient();

export default function PasswordResetPage() {
  const { tx, locale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();

    const redirectTo = new URL(
      localizePathname("/password-reset/complete", locale),
      window.location.origin,
    ).toString();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (resetError) {
      setError(
        tx(resetError.message || "Passwort-Reset konnte nicht gestartet werden."),
      );
      setIsLoading(false);
      return;
    }

    setSuccess(
      tx("Wenn ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen gesendet."),
    );
    form.reset();
    setIsLoading(false);
  };

  return (
    <div className="flex items-center justify-center py-6 md:py-12">
      <div className="knglmrt-border-section w-full max-w-md bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          {tx("Passwort zurücksetzen")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tx("Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues Passwort setzen kannst.")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            id="password-reset-email"
            label={tx("E-Mail-Adresse")}
            name="email"
            type="email"
            required
            autoComplete="email"
          />

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {success ? (
            <div role="status" className="space-y-2 rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
              <p>{success}</p>
              <Link className="font-semibold underline" href={localizePathname("/login", locale)}>
                {tx("Zur Anmeldung")}
              </Link>
            </div>
          ) : null}

          <Button
            fullWidth
            size="small"
            type="submit"
            kind="primary"
            disabled={isLoading}
          >
            {isLoading ? tx("Link wird versendet ...") : tx("Reset-Link senden")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {tx("Zurück zur Anmeldung:")}{" "}
          <Link className="font-semibold text-primary" href={localizePathname("/login", locale)}>
            {tx("Anmelden")}
          </Link>
        </p>
      </div>
    </div>
  );
}
