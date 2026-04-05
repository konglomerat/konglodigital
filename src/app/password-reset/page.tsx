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
      setError(resetError.message || "Passwort-Reset konnte nicht gestartet werden.");
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Passwort zuruecksetzen
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Gib deine Mailadresse ein. Wir senden dir einen Link, mit dem du ein
          neues Passwort setzen kannst.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="password-reset-email"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
            >
              Email
            </label>
            <input
              id="password-reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
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
            disabled={isLoading}
          >
            {isLoading ? "Link wird versendet ..." : "Reset-Link senden"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Zurueck zur{" "}
          <Link className="font-semibold text-blue-600" href="/login">
            Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
