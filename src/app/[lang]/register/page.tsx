"use client";

import { useState } from "react";
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";
import Field from "@/components/knglmrt/Field";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
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

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(tx(body.error ?? "Registrierung konnte nicht gestartet werden."));
        return;
      }
      setSuccess(tx("Wenn zu dieser Mail ein aktives Mitgliedskonto existiert, wurde eine Nachricht versendet. Falls nichts ankam war es entweder die falsche Adresse oder es ist im Spam gelandet."));
      form.reset();
    } catch {
      setError(tx("Verbindung fehlgeschlagen. Bitte versuche es erneut."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center py-6 md:py-12">
      <div className="knglmrt-border-section w-full max-w-md bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          {tx("Konto aktivieren")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tx("Gib die E-Mail-Adresse mit der du beim Verein registriert bist, um dein Konto für Konglo Digital zu aktivieren. Du bekommst dann an diese Adresse eine Mail mit einem Aktivierungslink. Falls du nicht mehr weißt, welche Adresse das war, schreib bitte eine kurze Nachricht an den Vorstand.")}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            id="register-email"
            label={tx("E-Mail-Adresse")}
            name="email"
            type="email"
            required
            autoComplete="email"
            hint= "Falls du nicht mehr weißt, mit welcher Adresse du registriert bist, schreib bitte eine kurze Nachricht an den Vorstand."
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
            {isLoading ? tx("Prüfung läuft ...") : tx("Aktivierungslink senden")}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {tx("Noch kein Mitglied?")} {" "}
          <Link className="font-semibold text-primary underline" href={localizePathname("/registration", locale)}>
            {tx("Mitglied werden")}
          </Link>
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {tx("Hast du bereits ein Konto?")}{" "}
          <Link className="font-semibold text-primary" href={localizePathname("/login", locale)}>
            {tx("Anmelden")}
          </Link>
        </p>
      </div>
    </div>
  );
}
