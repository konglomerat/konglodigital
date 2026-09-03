"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";

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
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
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
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-6">
      <div className="knglmrt-border-section w-full max-w-md bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Konto erstellen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gib deine Mailadresse ein. Wenn sie zu einem aktiven Mitgliedskonto
          passt, schicken wir dir einen Link zum Abschliessen der Registrierung.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            id="register-email"
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            hint="Wir gleichen diese Adresse mit Campai ab und senden dir danach den Registrierungslink nur bei einem aktiven Mitgliedskonto."
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
            {isLoading ? "Prüfung läuft ..." : "Registrierung starten"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Hast du bereits ein Konto?{" "}
          <Link className="font-semibold text-primary" href="/login">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
