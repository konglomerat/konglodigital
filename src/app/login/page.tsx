"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";

import Button from "../components/Button";

export const dynamic = "force-dynamic";

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);

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

      await response.json().catch(() => ({}));
      window.location.replace(getSafeRedirect());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPinError(null);
    setIsPinLoading(true);

    try {
      const formData = new FormData(event.currentTarget);
      const pin = String(formData.get("pin") ?? "").trim();

      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setPinError(body.error ?? "Invalid PIN.");
        return;
      }

      await response.json().catch(() => ({}));
      window.location.replace(getSafeRedirect());
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "Invalid PIN.");
    } finally {
      setIsPinLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Use your Supabase credentials to access the dashboard.
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
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
          </div>
          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            kind="primary"
            className="w-full px-4 py-2 text-sm"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 border-t border-zinc-200 pt-6">
          <p className="text-sm font-semibold text-zinc-900">
            View-only access
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Enter the 4-digit PIN to browse content without edit permissions.
          </p>
          <form onSubmit={handlePinSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                PIN
              </label>
              <input
                name="pin"
                type="password"
                // inputMode="numeric"
                //pattern="\\d{4}"
                maxLength={4}
                minLength={4}
                required
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm"
              />
            </div>
            {pinError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {pinError}
              </p>
            ) : null}
            <Button
              type="submit"
              kind="secondary"
              className="w-full px-4 py-2 text-sm"
              disabled={isPinLoading}
            >
              {isPinLoading ? "Checking PIN..." : "Enter with PIN"}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          New here?{" "}
          <Link className="font-semibold text-blue-600" href="/register">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-zinc-900">Sign in</h1>
            <p className="mt-2 text-sm text-zinc-500">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
