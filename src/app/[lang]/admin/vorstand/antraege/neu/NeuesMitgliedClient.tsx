"use client";

// Vorstand → Anträge → Neues Mitglied: einen unterschriebenen Papierantrag
// übertragen. Links die Felder wie beim Bearbeiten eines Antrags, rechts der
// Scan zum Abschreiben. „Mitglied anlegen" speichert den Antrag und nimmt ihn
// gleich an — danach geht es in der Antragsliste unter „Onboarding" weiter.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import Button from "@/components/knglmrt/Button";
import FieldShell from "@/components/knglmrt/FieldShell";
import FormSection from "@/components/knglmrt/FormSection";
import Notice from "@/components/knglmrt/Notice";
import { emptyRegistration, type RegistrationErrors } from "@/lib/campai-registration";
import {
  MAX_SCAN_BYTES,
  type ApplicationData,
  type MembershipApplication,
} from "@/lib/membership-applications/types";

import ApplicationEditForm from "../ApplicationEditForm";

const LIST_HREF = "/admin/vorstand/antraege";

const emptyApplication = (): ApplicationData => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, sepaSignature, ...data } = emptyRegistration();
  return data;
};

const isPdfFile = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

export default function NeuesMitgliedClient() {
  const router = useRouter();
  const [initial] = useState(emptyApplication);
  const [scan, setScan] = useState<File | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  // Gespeichert, aber das Annehmen in Campai ist abgebrochen.
  const [savedId, setSavedId] = useState<string | null>(null);

  const scanUrl = useMemo(() => (scan ? URL.createObjectURL(scan) : null), [scan]);
  useEffect(
    () => () => {
      if (scanUrl) URL.revokeObjectURL(scanUrl);
    },
    [scanUrl],
  );

  const pickScan = (file: File | null) => {
    setScanError(null);
    if (file && !isPdfFile(file)) {
      setScan(null);
      setScanError("Bitte eine PDF-Datei wählen.");
      return;
    }
    if (file && file.size > MAX_SCAN_BYTES) {
      setScan(null);
      setScanError("Das PDF ist größer als 10 MB. Bitte kleiner scannen.");
      return;
    }
    setScan(file);
  };

  const submit = async (data: ApplicationData) => {
    setError(null);
    setFieldErrors({});
    if (!scan) {
      setScanError("Bitte den unterschriebenen Antrag als PDF hochladen.");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.set("data", JSON.stringify(data));
      body.set("scan", scan);
      const response = await fetch("/api/admin/applications", { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as {
        application?: MembershipApplication;
        error?: string;
        fieldErrors?: RegistrationErrors;
      };
      if (response.ok && payload.application) {
        router.push(`${LIST_HREF}?antrag=${payload.application.id}`);
        return;
      }
      if (payload.application) setSavedId(payload.application.id);
      setFieldErrors(payload.fieldErrors ?? {});
      setError(payload.error ?? "Das hat nicht geklappt.");
    } catch {
      setError("Das hat nicht geklappt. Bitte die Verbindung prüfen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SubPageTitle
        ressort="vorstand"
        title="Neues Mitglied"
        backHref={LIST_HREF}
        subTitle="Einen unterschriebenen Papierantrag übertragen. Beim Anlegen entsteht das Mitglied in Campai — mit Verträgen, Rechnungsentwurf und dem PDF als Dokument. Danach geht es unter „Onboarding“ weiter wie bei Online-Anträgen."
      />

      {savedId ? (
        <Notice tone="gelb" title="Antrag gespeichert, Annehmen abgebrochen">
          <p>{error}</p>
          <p className="mt-2">
            Der Antrag steht unter „Offen“. Dort lässt sich die Annahme mit
            „Annahme fortsetzen“ abschließen — bitte nicht noch einmal anlegen.
          </p>
          <Button
            href={`${LIST_HREF}?antrag=${savedId}`}
            kind="primary"
            size="small"
            className="mt-3"
          >
            Zum Antrag
          </Button>
        </Notice>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <FormSection title="Antragsdaten">
            <ApplicationEditForm
              initial={initial}
              saving={saving}
              fieldErrors={fieldErrors}
              submitLabel="Mitglied anlegen"
              trialHint="Danach gilt der Jahresbeitrag oben — laut Papierformular ermäßigt (120 €)."
              onSave={(data) => void submit(data)}
              onCancel={() => router.push(LIST_HREF)}
            >
              <FieldShell
                as="div"
                label="Unterschriebener Antrag (PDF)"
                required
                error={scanError ?? undefined}
                hint="Alle Seiten, höchstens 10 MB. Hängt danach als Dokument am Campai-Kontakt."
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={saving}
                  onChange={(event) => pickScan(event.target.files?.item(0) ?? null)}
                  className="block w-full text-foreground file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:font-bold file:text-primary-foreground"
                />
              </FieldShell>
              {error ? (
                <Notice tone="gelb" title="Das hat nicht geklappt">
                  {error}
                </Notice>
              ) : null}
            </ApplicationEditForm>
          </FormSection>

          <FormSection title="Papierantrag" className="xl:sticky xl:top-6">
            {scanUrl ? (
              <iframe
                src={scanUrl}
                title="Hochgeladener Papierantrag"
                className="knglmrt-border h-[75vh] w-full bg-muted"
              />
            ) : (
              <p className="text-muted-foreground">
                Nach dem Hochladen steht der Antrag hier zum Abschreiben.
              </p>
            )}
          </FormSection>
        </div>
      )}
    </div>
  );
}
