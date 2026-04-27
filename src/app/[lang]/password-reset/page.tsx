"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "../components/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Passwort zuruecksetzen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gib deine Mailadresse ein. Wir senden dir einen Link, mit dem du ein
          neues Passwort setzen kannst.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="password-reset-email"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80"
            >
              Email
            </label>
            <input
              id="password-reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
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
