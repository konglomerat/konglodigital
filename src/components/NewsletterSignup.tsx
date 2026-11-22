"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";
import { RAPIDMAIL_SIGNUP_URL } from "@/lib/rapidmail-signup";

export default function NewsletterSignup() {
  const { tx, locale } = useI18n();
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    setState("sending");
    setErrors({});
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
        credentials: "omit",
      });
      if (response.status === 422) {
        const { validation_messages: messages } = await response.json();
        if (messages && typeof messages === "object") {
          setErrors(Object.fromEntries(Object.entries(messages).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          )));
        }
      } else if (response.status === 200 || response.status === 201) {
        // Rapidmail accepts the form with an empty body or a JSON response.
        const body = await response.text();
        if (body.trim()) JSON.parse(body);
        form.reset();
        setState("success");
        return;
      }
    } catch {
      // Keep all input so the visitor can retry after a network error.
    }
    setState("error");
  }

  return (
    <div className="max-w-2xl">
      <div role="status" aria-live="polite">
        {state === "success" && (
          <p className="knglmrt-border bg-card p-5 font-bold">
            {tx("Fast geschafft! Schau in dein Postfach und bestätige deine Anmeldung über den Link in der E-Mail.", "de")}
          </p>
        )}
      </div>
      {state !== "success" && (
        <form action={RAPIDMAIL_SIGNUP_URL} method="post" onSubmit={submit} className="grid gap-4">
          <Field name="email" type="email" autoComplete="email" required label={tx("E-Mail-Adresse", "de")} error={errors.email} />
          <details>
            <summary className="w-fit cursor-pointer font-bold underline underline-offset-4">
              {tx("Namen hinzufügen (optional)", "de")}
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field name="firstname" autoComplete="given-name" label={tx("Vorname", "de")} error={errors.firstname} />
              <Field name="lastname" autoComplete="family-name" label={tx("Nachname", "de")} error={errors.lastname} />
            </div>
          </details>
          <p className="text-sm">
            {tx("Mit deiner Anmeldung erhältst du den Newsletter des Konglomerat e.V. über Rapidmail. Du kannst dich jederzeit über den Link im Newsletter abmelden.", "de")}{" "}
            <Link href={localizePathname("/datenschutz", locale)} className="font-bold underline">{tx("Datenschutz", "de")}</Link>
          </p>
          {state === "error" && (
            <p role="alert" className="text-sm font-bold">
              {tx("Die Anmeldung hat nicht geklappt. Prüfe deine Eingaben oder versuche es später noch einmal.", "de")}{" "}
              <a href={RAPIDMAIL_SIGNUP_URL} className="underline">{tx("Formular bei Rapidmail öffnen", "de")}</a>
            </p>
          )}
          <Button type="submit" kind="primary" loading={state === "sending"} className="justify-self-start">
            {tx("Newsletter abonnieren", "de")}
          </Button>
        </form>
      )}
    </div>
  );
}
