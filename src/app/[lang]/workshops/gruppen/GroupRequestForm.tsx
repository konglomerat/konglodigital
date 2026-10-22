"use client";

// Anfrageformular für Gruppen. Auf der Detailseite ist der Workshop fest
// (`workshop`), auf der Übersicht wählt man ihn (`options`).
import { useState, type FormEvent } from "react";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Face from "@/components/knglmrt/Face";
import Field from "@/components/knglmrt/Field";
import Notice from "@/components/knglmrt/Notice";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import Select from "@/components/knglmrt/Select";
import Stepper from "@/components/knglmrt/Stepper";
import Textarea from "@/components/knglmrt/Textarea";
import { useI18n } from "@/i18n/client";
import { WORKSHOP_REQUEST_EMAIL } from "@/lib/workshops";
import { ORG_TYPES, type OrgType } from "../content";

export const OTHER_WORKSHOP = "Etwas anderes / weiß noch nicht";

type FormState = {
  orgType: OrgType;
  contactName: string;
  organisation: string;
  email: string;
  phone: string;
  workshop: string;
  people: number;
  audience: string;
  period: string;
  message: string;
  privacy: boolean;
  website: string;
};

type Props = {
  /** Fester Workshop (Detailseite): kein Auswahlfeld, die Anfrage nennt ihn. */
  workshop?: { slug: string; title: string };
  /** Titel zur Auswahl, wenn der Workshop nicht feststeht (Übersicht). */
  options?: string[];
  minPeople?: number;
  maxPeople?: number;
  defaultPeople?: number;
  messageLabel?: string;
  sentText?: string;
  /** Betreff der Rückfall-Mail bei Fehlern. */
  mailSubject?: string;
};

export default function GroupRequestForm({
  workshop,
  options = [],
  minPeople = 4,
  maxPeople = 30,
  defaultPeople,
  messageLabel = "Was habt ihr vor?",
  sentText = "Danke! Deine Anfrage ist bei uns. Die vielen Gesichter melden sich innerhalb einer Woche.",
  mailSubject = "Workshop-Anfrage",
}: Props) {
  const { tx } = useI18n();
  const startPeople = Math.min(
    maxPeople,
    Math.max(minPeople, defaultPeople ?? Math.round((minPeople + maxPeople) / 2)),
  );
  const emptyForm: FormState = {
    orgType: "schule",
    contactName: "",
    organisation: "",
    email: "",
    phone: "",
    workshop: "",
    people: startPeople,
    audience: "",
    period: "",
    message: "",
    privacy: false,
    website: "",
  };
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const orgType = ORG_TYPES.find((entry) => entry.value === form.orgType) ?? ORG_TYPES[0];
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.privacy || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/workshops/anfrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          orgType: orgType.label,
          workshopSlug: workshop?.slug,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || tx("Die Anfrage ist nicht angekommen.", "de"));
      }
      setStatus("sent");
    } catch (submitError) {
      setStatus("idle");
      setError(
        submitError instanceof Error
          ? submitError.message
          : tx("Die Anfrage ist nicht angekommen.", "de"),
      );
    }
  };

  const reset = () => {
    setForm(emptyForm);
    setStatus("idle");
    setError(null);
  };

  if (status === "sent") {
    return (
      <div className="mt-7 flex flex-col items-start gap-4">
        <Notice tone="rosa" className="w-full">
          <div className="flex items-center gap-4">
            <Face number={3} size={56} title="" className="flex-none" />
            <p className="m-0" role="status">
              {tx(sentText, "de")}
            </p>
          </div>
        </Notice>
        <Button kind="quiet" onClick={reset}>
          {tx("Weitere Anfrage", "de")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="knglmrt-border mt-7 flex flex-col gap-5 p-5 md:p-7">
      <div className="flex flex-col gap-2">
        <span className="knglmrt-label">{tx("Wir sind", "de")}</span>
        <div className="overflow-x-auto">
          <SegmentedControl
            value={form.orgType}
            options={ORG_TYPES.map((entry) => ({
              value: entry.value,
              label: tx(entry.label, "de"),
            }))}
            onChange={(value) => update("orgType", value)}
            size="small"
            tone="ink"
          />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <Field
          label={tx("Ansprechperson", "de")}
          required
          autoComplete="name"
          value={form.contactName}
          onChange={(event) => update("contactName", event.target.value)}
        />
        <Field
          label={tx(orgType.org, "de")}
          required
          autoComplete="organization"
          value={form.organisation}
          onChange={(event) => update("organisation", event.target.value)}
        />
        <Field
          label={tx("E-Mail", "de")}
          required
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
        />
        <Field
          label={tx("Telefon (optional)", "de")}
          kind="mono"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => update("phone", event.target.value)}
        />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-5">
        {workshop ? null : (
          <Select
            label={tx("Workshop", "de")}
            value={form.workshop}
            placeholder={tx("Bitte wählen", "de")}
            options={[
              ...options.map((title) => ({ value: title, label: tx(title, "de") })),
              { value: OTHER_WORKSHOP, label: tx(OTHER_WORKSHOP, "de") },
            ]}
            onChange={(value) => update("workshop", value)}
          />
        )}
        <Stepper
          label={tx("Teilnehmende", "de")}
          value={form.people}
          unit={tx("Pers.", "de")}
          min={minPeople}
          max={maxPeople}
          hint={`${minPeople}–${maxPeople} ${tx("Personen", "de")}`}
          onChange={(value) => update("people", value)}
        />
        <Field
          label={tx(orgType.audience, "de")}
          value={form.audience}
          onChange={(event) => update("audience", event.target.value)}
        />
        <Field
          label={tx("Wunschzeitraum", "de")}
          kind="mono"
          placeholder={tx("z. B. KW 48", "de")}
          value={form.period}
          onChange={(event) => update("period", event.target.value)}
        />
      </div>
      <Textarea
        label={tx(messageLabel, "de")}
        placeholder={tx("Anlass, Vorkenntnisse, besondere Wünsche …", "de")}
        rows={workshop ? 3 : 4}
        maxLength={800}
        counter={800}
        value={form.message}
        onChange={(event) => update("message", event.target.value)}
      />
      {/* Honeypot — für Menschen unsichtbar. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px opacity-0"
        value={form.website}
        onChange={(event) => update("website", event.target.value)}
      />
      {error ? (
        <Notice tone="gelb">
          <p className="m-0" role="alert">
            {error}{" "}
            <a
              href={`mailto:${WORKSHOP_REQUEST_EMAIL}?subject=${encodeURIComponent(mailSubject)}`}
              className="font-bold text-primary"
            >
              {tx("Mail schreiben", "de")}
            </a>
          </p>
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Choice
          label={tx(
            "Ich bin einverstanden, dass ihr meine Angaben für die Anfrage speichert.",
            "de",
          )}
          checked={form.privacy}
          onChange={(event) => update("privacy", event.target.checked)}
        />
        <Button
          type="submit"
          kind="primary"
          disabled={!form.privacy}
          loading={status === "sending"}
        >
          {tx("Anfrage senden", "de")}
        </Button>
      </div>
    </form>
  );
}
