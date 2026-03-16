"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "../components/Button";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
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

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Registrierung konnte nicht gestartet werden.");
      setIsLoading(false);
      return;
    }

    setSuccess(
      "Wenn zu dieser Mail ein aktives Mitgliedskonto existiert, wurde eine Nachricht versendet.",
    );
    form.reset();
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">Konto erstellen</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Gib deine Mailadresse ein. Wenn sie zu einem aktiven Mitgliedskonto passt, schicken wir dir einen Link zum Abschliessen der Registrierung.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Email
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
            <p className="text-xs text-zinc-500">
              Wir gleichen diese Adresse mit Campai ab und senden dir danach den Registrierungslink nur bei einem aktiven Mitgliedskonto.
            </p>
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
            {isLoading ? "Prüfung läuft ..." : "Registrierung starten"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Hast du bereits ein Konto?{" "}
          <Link className="font-semibold text-blue-600" href="/login">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
