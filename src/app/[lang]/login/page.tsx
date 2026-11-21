"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";

import Button from "@/components/knglmrt/Button";
import PasswordInput from "../components/PasswordInput";
import Field from "@/components/knglmrt/Field";
import FieldShell from "@/components/knglmrt/FieldShell";
import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";

export const dynamic = "force-dynamic";

function LoginForm() {
  const { tx, locale } = useI18n();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getSafeRedirect = () => {
    const fallback = localizePathname("/", locale);
    const redirectedFrom = searchParams.get("redirectedFrom") ?? fallback;
    return redirectedFrom.startsWith("/") && !redirectedFrom.startsWith("//") && !redirectedFrom.includes("\\")
      ? redirectedFrom
      : fallback;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");

      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error === "Invalid login credentials"
          ? tx("E-Mail-Adresse oder Passwort ist falsch.")
          : tx(body.error ?? "Anmeldung nicht möglich. Bitte versuche es erneut."));
        setIsLoading(false);
        return;
      }

      // Bis die Weiterleitung greift, bleibt die Taste gesperrt.
      window.location.replace(getSafeRedirect());
    } catch {
      setError(tx("Verbindung fehlgeschlagen. Bitte versuche es erneut."));
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center bg-background py-6 md:py-12">
      <div className="w-full max-w-md knglmrt-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-foreground">{tx("Anmelden")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tx("Melde dich mit deinen Zugangsdaten an.")}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label={tx("E-Mail-Adresse")} name="email" type="email" autoComplete="username" required />
          <FieldShell as="div" label={tx("Passwort")} htmlFor="login-password" required>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              required
              showLabel={tx("Anzeigen")}
              hideLabel={tx("Ausblenden")}
            />
          </FieldShell>
          <p className="text-right text-sm text-muted-foreground">
            <Link
              className="font-semibold text-primary hover:text-primary/80"
              href={localizePathname("/password-reset", locale)}
            >
              {tx("Passwort vergessen?")}
            </Link>
          </p>
          {error ? (
            <p role="alert" className="bg-destructive-soft px-4 py-3 text-foreground">
              {error}
            </p>
          ) : null}
          <Button
            fullWidth
            size="small"
            type="submit"
            kind="primary"
            disabled={isLoading}
          >
            {isLoading ? tx("Anmeldung läuft ...") : tx("Anmelden")}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {tx("Schon Mitglied, aber noch kein Konto?")} {" "}
          <Link className="font-semibold text-primary underline" href={localizePathname("/register", locale)}>
            {tx("Konto aktivieren")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-80 animate-pulse bg-muted/50" />}>
      <LoginForm />
    </Suspense>
  );
}
