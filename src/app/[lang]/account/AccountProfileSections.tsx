"use client";

// src/app/[lang]/account/AccountProfileSections.tsx — „Persönliche Daten" und
// „Kommunikation".
//
// Beide Rubriken zeigen im Ruhezustand nur, was in der Mitgliederverwaltung
// steht. Geändert wird über die Tasten in der Kopfzeile: jede klappt unter dem
// Raster ihren eigenen Dialog auf, und es ist immer höchstens einer offen.
//
// Der Zuschnitt der Dialoge folgt dem, was zusammen gehört und zusammen
// gespeichert werden kann: Name, Sprache und Adresse, die Kontaktwege — und
// das Passwort, das als einziges nicht nach Campai geht, sondern zum
// Supabase-Konto.
import { useEffect, useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faArrowUpRightFromSquare,
  faKey,
  faPen,
} from "@fortawesome/free-solid-svg-icons";

import Field from "@/components/knglmrt/Field";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import PasswordInput from "../components/PasswordInput";
import {
  AccountSection,
  DataField,
  DataGrid,
  EditToggle,
  InlineEditor,
} from "./AccountSection";
import type { CampaiProfileState } from "./useCampaiProfile";
import {
  EMPTY_CAMPAI_CONTACT_ADDRESS,
  type CampaiContactAddress,
  type CampaiContactLanguage,
  type CampaiContactProfile,
} from "@/lib/campai-contact-profile";

const LANGUAGE_LABELS: Record<CampaiContactLanguage, string> = {
  de: "Deutsch",
  en: "Englisch",
};

type EditorKey = "daten" | "passwort" | "kontakt";

type PersonalDraft = {
  firstName: string;
  lastName: string;
  organizationName: string;
  language: CampaiContactLanguage;
};

type ContactDraft = {
  email: string;
  phone: string;
  mobilePhone: string;
};

const EMPTY_PERSONAL: PersonalDraft = {
  firstName: "",
  lastName: "",
  organizationName: "",
  language: "de",
};

const EMPTY_CONTACT: ContactDraft = {
  email: "",
  phone: "",
  mobilePhone: "",
};

const toPersonalDraft = (profile: CampaiContactProfile): PersonalDraft => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  organizationName: profile.organizationName,
  language: profile.language,
});

const toContactDraft = (profile: CampaiContactProfile): ContactDraft => ({
  email: profile.email,
  phone: profile.phone,
  mobilePhone: profile.mobilePhone,
});

export type AccountProfileSectionsProps = {
  campai: CampaiProfileState;
  /** Die E-Mail des Supabase-Kontos — davon unabhängig ist die in Campai. */
  accountEmail: string;
};

export default function AccountProfileSections({
  campai,
  accountEmail,
}: AccountProfileSectionsProps) {
  const { profile, loading, unavailableHint, locked, save } = campai;

  const [openEditor, setOpenEditor] = useState<EditorKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Die Bestätigung gehört unter die Rubrik, in der gespeichert wurde — sonst
  // stünde „Gespeichert." nach einer Änderung der Kontaktwege bei den
  // persönlichen Daten.
  const [status, setStatus] = useState<{
    key: EditorKey;
    message: string;
  } | null>(null);

  const [personal, setPersonal] = useState<PersonalDraft>(EMPTY_PERSONAL);
  const [address, setAddress] = useState<CampaiContactAddress>(
    EMPTY_CAMPAI_CONTACT_ADDRESS,
  );
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // Die Entwürfe hängen am geladenen Kontakt. Sie werden hier nachgezogen und
  // nicht erst beim Öffnen: kommt Campai später als der erste Klick, stünde im
  // Dialog sonst ein leeres Formular.
  useEffect(() => {
    if (!profile) {
      return;
    }
    setPersonal(toPersonalDraft(profile));
    setAddress({ ...profile.address });
    setContact(toContactDraft(profile));
  }, [profile]);

  const closeEditor = () => {
    if (profile) {
      setPersonal(toPersonalDraft(profile));
      setAddress({ ...profile.address });
      setContact(toContactDraft(profile));
    }
    setPassword("");
    setPasswordConfirm("");
    setError(null);
    setOpenEditor(null);
  };

  const toggleEditor = (key: EditorKey) => {
    setError(null);
    setStatus(null);
    setOpenEditor((current) => (current === key ? null : key));
  };

  // Alle vier Dialoge laufen durch denselben Ablauf; unterschiedlich ist nur,
  // was gespeichert wird und was danach als Bestätigung dasteht.
  const runSave = async (
    key: EditorKey,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (saving) {
      return;
    }
    setError(null);
    setStatus(null);
    setSaving(true);
    try {
      await action();
      setOpenEditor(null);
      setStatus({ key, message: successMessage });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePersonalSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Die Adresse nimmt Campai nur als vollständigen Block. Unverändert geht
    // sie deshalb gar nicht erst mit — sonst scheitert eine Namensänderung an
    // einer Adresse, die schon vorher unvollständig war.
    const addressChanged =
      !profile ||
      (Object.keys(address) as (keyof CampaiContactAddress)[]).some(
        (field) => address[field] !== profile.address[field],
      );
    void runSave(
      "daten",
      async () => {
        await save({
          firstName: personal.firstName,
          lastName: personal.lastName,
          organizationName: personal.organizationName,
          language: personal.language,
          ...(addressChanged ? { address } : {}),
        });
      },
      "Deine Daten sind gespeichert.",
    );
  };

  const handleContactSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSave(
      "kontakt",
      async () => {
        await save({
          email: contact.email,
          phone: contact.phone,
          mobilePhone: contact.mobilePhone,
        });
      },
      "Deine Kontaktwege sind gespeichert.",
    );
  };

  const handlePasswordSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runSave(
      "passwort",
      async () => {
        const response = await fetch("/api/account/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, passwordConfirm }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(
            data.error ?? "Passwort konnte nicht aktualisiert werden.",
          );
        }
        setPassword("");
        setPasswordConfirm("");
      },
      "Passwort aktualisiert.",
    );
  };

  const setAddressField = (
    field: keyof CampaiContactAddress,
    value: string,
  ) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const placeholder = loading ? "…" : "";
  const fullName = profile
    ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
    : "";

  // Die Adresse steht zweizeilig wie auf einem Briefumschlag — Straße, dann
  // PLZ und Ort.
  const addressLines = profile
    ? [
        profile.address.addressLine,
        profile.address.details1,
        [profile.address.zip, profile.address.city].filter(Boolean).join(" "),
      ].filter(Boolean)
    : [];

  return (
    <>
      <AccountSection
        id="profil"
        title="Persönliche Daten"
        actions={
          <>
            <EditToggle
              open={openEditor === "daten"}
              controls="account-editor-daten"
              icon={faPen}
              disabled={locked}
              onClick={() => toggleEditor("daten")}
            >
              Daten anpassen
            </EditToggle>
            <EditToggle
              open={openEditor === "passwort"}
              controls="account-editor-passwort"
              icon={faKey}
              onClick={() => toggleEditor("passwort")}
            >
              Passwort ändern
            </EditToggle>
          </>
        }
      >
        <DataGrid>
          <DataField label="Name" value={fullName || placeholder} />
          <DataField
            label="Sprache"
            value={profile ? LANGUAGE_LABELS[profile.language] : placeholder}
          />
          <DataField
            label="Adresse"
            value={
              addressLines.length > 0
                ? addressLines.map((line) => <div key={line}>{line}</div>)
                : placeholder
            }
          />
          {/* Nur nötig, wenn die Mitgliedschaft über eine Firma oder einen
              Verein läuft — sonst steht die Zeile gar nicht erst da. */}
          {profile?.organizationName ? (
            <DataField label="Organisation" value={profile.organizationName} />
          ) : null}
          <DataField label="Passwort" value="••••••••" />
        </DataGrid>

        {openEditor === "daten" ? (
          <InlineEditor
            id="account-editor-daten"
            title="Daten anpassen"
            saving={saving}
            error={error}
            onSubmit={handlePersonalSubmit}
            onCancel={closeEditor}
          >
            <Field
              id="account-first-name"
              label="Vorname"
              type="text"
              value={personal.firstName}
              maxLength={40}
              autoComplete="given-name"
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
            />
            <Field
              id="account-last-name"
              label="Name"
              type="text"
              required
              value={personal.lastName}
              maxLength={40}
              autoComplete="family-name"
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
            />
            <Field
              id="account-organization"
              label="Name der Organisation"
              type="text"
              value={personal.organizationName}
              maxLength={200}
              autoComplete="organization"
              hint="Nur nötig, wenn die Mitgliedschaft über eine Firma oder einen Verein läuft."
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current,
                  organizationName: event.target.value,
                }))
              }
            />
            <NativeSelect
              id="account-language"
              label="Sprache"
              value={personal.language}
              hint="In dieser Sprache schreibt der Verein dich an."
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current,
                  language: event.target.value as CampaiContactLanguage,
                }))
              }
            >
              {(Object.keys(LANGUAGE_LABELS) as CampaiContactLanguage[]).map(
                (language) => (
                  <option key={language} value={language}>
                    {LANGUAGE_LABELS[language]}
                  </option>
                ),
              )}
            </NativeSelect>
            {/* Land, Bundesland und der zweite Zusatz stehen nicht im
                Formular — sie bleiben im Entwurf, wie Campai sie führt, und
                gehen unverändert zurück. */}
            <Field
              id="account-address-line"
              label="Straße und Hausnummer"
              type="text"
              value={address.addressLine}
              maxLength={45}
              autoComplete="street-address"
              onChange={(event) =>
                setAddressField("addressLine", event.target.value)
              }
            />
            <Field
              id="account-address-details1"
              label="Adresszusatz"
              type="text"
              value={address.details1}
              maxLength={45}
              onChange={(event) =>
                setAddressField("details1", event.target.value)
              }
            />
            <div className="grid gap-4 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
              <Field
                id="account-address-zip"
                label="PLZ"
                kind="mono"
                type="text"
                value={address.zip}
                maxLength={10}
                autoComplete="postal-code"
                onChange={(event) => setAddressField("zip", event.target.value)}
              />
              <Field
                id="account-address-city"
                label="Ort"
                type="text"
                value={address.city}
                maxLength={45}
                autoComplete="address-level2"
                onChange={(event) =>
                  setAddressField("city", event.target.value)
                }
              />
            </div>
          </InlineEditor>
        ) : null}

        {openEditor === "passwort" ? (
          <InlineEditor
            id="account-editor-passwort"
            title="Passwort ändern"
            saving={saving}
            error={error}
            onSubmit={handlePasswordSubmit}
            onCancel={closeEditor}
          >
            <PasswordInput
              id="account-password"
              name="password"
              label="Neues Passwort"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              showLabel="Anzeigen"
              hideLabel="Ausblenden"
            />
            <PasswordInput
              id="account-password-confirm"
              name="passwordConfirm"
              label="Passwort bestätigen"
              required
              minLength={8}
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              showLabel="Anzeigen"
              hideLabel="Ausblenden"
              hint="Mindestens 8 Zeichen."
            />
          </InlineEditor>
        ) : null}

        {unavailableHint && !openEditor ? (
          <p className="mt-4 text-muted-foreground">{unavailableHint}</p>
        ) : null}
        {status && status.key !== "kontakt" && !openEditor ? (
          <p className="mt-4 font-bold">{status.message}</p>
        ) : null}
      </AccountSection>

      <AccountSection
        id="kommunikation"
        title="Kommunikation"
        actions={
          <EditToggle
            open={openEditor === "kontakt"}
            controls="account-editor-kontakt"
            icon={faAddressBook}
            disabled={locked}
            onClick={() => toggleEditor("kontakt")}
          >
            Kontaktwege anpassen
          </EditToggle>
        }
      >
        <DataGrid>
          <DataField
            label="E-Mail"
            value={profile?.email || placeholder}
            mono
          />
          <DataField
            label="Telefon"
            value={profile?.phone || placeholder}
            mono
          />
          <DataField
            label="Mobiltelefon"
            value={profile?.mobilePhone || placeholder}
            mono
          />
          <DataField
            label="Mail Verteiler"
            value={
              <a
                href="https://listen.konglomerat.org/postorius/lists/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-primary hover:text-[var(--ui-action-hover)]"
              >
                listen.konglomerat.org
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="h-3 w-3"
                  aria-hidden="true"
                />
                <span className="sr-only">(öffnet in neuem Tab)</span>
              </a>
            }
            hint="Hier kannst du die Mailing Listen der Werkbereiche abonnieren"
          />
        </DataGrid>

        {openEditor === "kontakt" ? (
          <InlineEditor
            id="account-editor-kontakt"
            title="Kontaktwege anpassen"
            saving={saving}
            error={error}
            onSubmit={handleContactSubmit}
            onCancel={closeEditor}
          >
            <Field
              id="account-campai-email"
              label="E-Mail"
              type="email"
              value={contact.email}
              autoComplete="email"
              hint={
                accountEmail &&
                contact.email &&
                contact.email.toLowerCase() !== accountEmail.toLowerCase()
                  ? `Die Anmeldung hier läuft weiter über ${accountEmail}.`
                  : undefined
              }
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <Field
              id="account-phone"
              label="Telefon"
              kind="mono"
              type="tel"
              value={contact.phone}
              autoComplete="tel"
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
            />
            <Field
              id="account-mobile-phone"
              label="Mobiltelefon"
              kind="mono"
              type="tel"
              value={contact.mobilePhone}
              autoComplete="tel"
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  mobilePhone: event.target.value,
                }))
              }
            />
          </InlineEditor>
        ) : null}

        {status && status.key === "kontakt" && !openEditor ? (
          <p className="mt-4 font-bold">{status.message}</p>
        ) : null}
        {unavailableHint && !openEditor ? (
          <p className="mt-4 text-muted-foreground">{unavailableHint}</p>
        ) : null}
      </AccountSection>
    </>
  );
}
