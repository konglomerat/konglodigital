"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Field from "@/components/knglmrt/Field";

export const dynamic = "force-dynamic";

const supabase = createSupabaseBrowserClient();

export default function PasswordResetPage() {
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
      "/password-reset/complete",
      window.location.origin,
    ).toString();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (resetError) {
      setError(
        resetError.message || "Passwort-Reset konnte nicht gestartet werden.",
      );
      setIsLoading(false);
      return;
    }

    setSuccess(
      "Wenn ein Konto mit dieser Mailadresse existiert, wurde ein Link zum Zuruecksetzen gesendet.",
    );
    form.reset();
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-6">
      <div className="knglmrt-border-section w-full max-w-md bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Passwort zuruecksetzen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gib deine Mailadresse ein. Wir senden dir einen Link, mit dem du ein
          neues Passwort setzen kannst.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            id="password-reset-email"
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />

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
            disabled={isLoading}
          >
            {isLoading ? "Link wird versendet ..." : "Reset-Link senden"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Zurueck zur{" "}
          <Link className="font-semibold text-primary" href="/login">
            Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
