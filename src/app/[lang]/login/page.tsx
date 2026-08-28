"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";

import Button from "@/components/knglmrt/Button";
import PasswordInput from "../components/PasswordInput";
import Field from "@/components/knglmrt/Field";
import FieldShell from "@/components/knglmrt/FieldShell";

export const dynamic = "force-dynamic";

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getSafeRedirect = () => {
    const redirectedFrom = searchParams.get("redirectedFrom") ?? "/";
    return redirectedFrom.startsWith("/") ? redirectedFrom : "/";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "").trim();

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
        setError(body.error ?? "Unable to sign in.");
        return;
      }

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Anmeldung nicht möglich.");
        setIsLoading(false);
      }
      window.location.replace(getSafeRedirect());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Anmeldung nicht möglich.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md knglmrt-border bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">Anmelden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Melde dich mit deinen Zugangsdaten an.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field label="Email" name="email" type="email" required />
          <FieldShell as="div" label="Passwort">
            <PasswordInput
              name="password"
              required
              showLabel="Anzeigen"
              hideLabel="Ausblenden"
            />
          </FieldShell>
          <p className="text-right text-sm text-muted-foreground">
            <Link
              className="font-semibold text-primary hover:text-primary/80"
              href="/password-reset"
            >
              Passwort vergessen?
            </Link>
          </p>
          {error ? (
            <p className="bg-destructive-soft px-4 py-3 text-foreground">
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
            {isLoading ? "Anmeldung läuft ..." : "Anmelden"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="knglmrt-border-section w-full max-w-md bg-card p-8">
            <h1 className="text-2xl font-semibold text-foreground">Anmelden</h1>
            <p className="mt-2 text-sm text-muted-foreground">Lädt ...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
