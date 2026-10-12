"use client";

import { useEffect, useMemo, useState } from "react";

import Button from "@/components/knglmrt/Button";
import { createSupabaseCookieBrowserClient } from "@/lib/supabase/cookie-browser";

type AuthorizationDetails = {
  client: {
    name: string;
    uri: string;
  };
  scope: string;
  user: {
    email: string;
  };
};

type ViewState =
  | { status: "loading" }
  | { status: "ready"; details: AuthorizationDetails }
  | { status: "denied" }
  | { status: "error"; message: string };

const getReturnPath = () =>
  `${window.location.pathname}${window.location.search}`;

export default function OAuthConsentClient({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const supabase = useMemo(() => createSupabaseCookieBrowserClient(), []);
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const load = async () => {
      if (!authorizationId) {
        setView({
          status: "error",
          message: "Die OAuth-Anfrage enthält keine Autorisierungs-ID.",
        });
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        const redirectedFrom = encodeURIComponent(getReturnPath());
        window.location.replace(`/login?redirectedFrom=${redirectedFrom}`);
        return;
      }

      const { data: access, error: accessError } = await supabase
        .from("user_access")
        .select("roles")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!isCurrent) return;

      if (accessError) {
        setView({
          status: "error",
          message: "Die Backend-Berechtigung konnte nicht geprüft werden.",
        });
        return;
      }

      const roles = Array.isArray(access?.roles) ? access.roles : [];
      if (!roles.includes("backend")) {
        setView({ status: "denied" });
        return;
      }

      const { data, error } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (!isCurrent) return;

      if (error || !data) {
        setView({
          status: "error",
          message: error?.message ?? "Die OAuth-Anfrage ist nicht mehr gültig.",
        });
        return;
      }

      if (data.redirect_url) {
        window.location.assign(data.redirect_url);
        return;
      }

      setView({ status: "ready", details: data });
    };

    void load();

    return () => {
      isCurrent = false;
    };
  }, [authorizationId, supabase]);

  const decide = async (decision: "approve" | "deny") => {
    setIsSubmitting(true);

    const result =
      decision === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });

    if (result.error || !result.data?.redirect_url) {
      setView({
        status: "error",
        message:
          result.error?.message ?? "Die Entscheidung konnte nicht gespeichert werden.",
      });
      setIsSubmitting(false);
      return;
    }

    window.location.assign(result.data.redirect_url);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-lg knglmrt-border bg-card p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Backend-Zugriff
        </h1>

        {view.status === "loading" ? (
          <p className="mt-3 text-muted-foreground">Berechtigung wird geprüft …</p>
        ) : null}

        {view.status === "denied" ? (
          <div className="mt-5 bg-destructive-soft p-4 text-foreground">
            <p className="font-semibold">Kein Zugriff</p>
            <p className="mt-1 text-sm">
              Deinem Konto fehlt die Rolle „Backend“. Eine Anmeldung am CMS
              ist deshalb nicht möglich.
            </p>
          </div>
        ) : null}

        {view.status === "error" ? (
          <div className="mt-5 bg-destructive-soft p-4 text-foreground">
            <p className="font-semibold">Anmeldung nicht möglich</p>
            <p className="mt-1 text-sm">{view.message}</p>
          </div>
        ) : null}

        {view.status === "ready" ? (
          <>
            <p className="mt-3 text-muted-foreground">
              <strong>{view.details.client.name}</strong> möchte dich als
              {" "}
              <strong>{view.details.user.email}</strong> anmelden.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Du erlaubst dem CMS, dich mit deinem bestehenden Konto anzumelden
              und deine Backend-Berechtigung zu prüfen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                kind="primary"
                size="small"
                disabled={isSubmitting}
                onClick={() => void decide("approve")}
              >
                Backend öffnen
              </Button>
              <Button
                kind="secondary"
                size="small"
                disabled={isSubmitting}
                onClick={() => void decide("deny")}
              >
                Abbrechen
              </Button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
