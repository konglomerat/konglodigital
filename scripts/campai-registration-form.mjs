#!/usr/bin/env node

// Legt das Antragsformular an, über das /registration Mitgliedsanträge an
// Campai schickt — oder aktualisiert es, wenn eine ID übergeben wird.
//
//   node scripts/campai-registration-form.mjs            # neu anlegen
//   node scripts/campai-registration-form.mjs <formId>   # aktualisieren
//
// Das Formular sieht niemand: /registration zeigt seine eigene Oberfläche und
// nutzt es nur als Datenvertrag. Es ist deshalb schlicht — keine Bedingungen,
// keine berechneten Felder, keine Texte. Die Feld-IDs sind die Schlüssel, die
// /registration beim Einreichen schreibt; wer hier etwas umbenennt, muss es
// dort nachziehen.
//
// Warum ein eigenes Formular: Im Campai-Editor lässt sich pro Antrag nur ein
// Vertrag wählen. Wir brauchen den Jahresbeitrag (Pflicht) und daneben
// wahlweise einen Monatsbeitrag. Campai führt Verträge als Liste; eine
// wiederholbare Gruppe mit einem Feld auf `contracts.plan` ergibt einen
// Vertrag je Eintrag.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readEnv = async () => {
  const content = await fs.readFile(path.join(projectRoot, ".env.local"), "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...env, ...process.env };
};

/** Die Beitragsarten, die ein Antrag anlegen darf. */
const PLANS = [
  { id: "685a87790afb4b4a84815a53", label: "Jahresbeitrag (Vereinsmitgliedschaft)" },
  { id: "6ab6fadb71bd5601926b8af2", label: "Monatsmehrbeitrag - Abo Groß" },
  { id: "6ab6f8b7744be89ef4ced0d3", label: "Monatsmehrbeitrag - Abo Klein" },
  { id: "685a90649f62e6eb504b1de4", label: "10er Karte (Zugangskarte)" },
];

const form = {
  contactType: "member",
  name: "Mitgliedsantrag (konglodigital)",
  customAcceptanceAction: null,
  notificationUserIds: [],
  form: {
    pageMode: "flow",
    introText: "",
    schema: {
      groups: [
        {
          id: "person",
          label: "Person",
          fields: [
            { id: "firstName", type: "text", format: "text", label: "Vorname", bindPropertyPath: "person.firstName", required: true },
            { id: "lastName", type: "text", format: "text", label: "Nachname", bindPropertyPath: "person.lastName", required: true },
            { id: "entryAt", type: "date", label: "Eintrittsdatum", bindPropertyPath: "member.entryAt", required: true },
            {
              // /registration fragt das nicht mehr ab und schickt immer „Aktivmitglied".
              id: "membershipType",
              type: "select",
              label: "Art der Mitgliedschaft",
              required: true,
              options: [
                { id: "active", value: "Aktivmitglied", label: "Aktivmitglied" },
                { id: "supporting", value: "Fördermitglied", label: "Fördermitglied" },
              ],
            },
          ],
        },
        {
          id: "contact",
          label: "Kontakt",
          fields: [
            { id: "address", type: "address", label: "Adresse", bindPropertyPath: "address", defaultCountry: "DE", hasDetails: false, required: true },
            { id: "email", type: "text", format: "email", label: "E-Mail", bindPropertyPath: "communication.email", required: true },
            // Mobil und Festnetz sind beide optional.
            { id: "phone", type: "text", format: "phone", label: "Telefon", bindPropertyPath: "communication.phone", phone: { defaultCountry: "DE" } },
            { id: "mobilePhone", type: "text", format: "phone", label: "Mobil", bindPropertyPath: "communication.mobilePhone", phone: { defaultCountry: "DE" } },
          ],
        },
        {
          id: "fee",
          label: "Jahresbeitrag",
          fields: [
            { id: "annualFee", type: "number", label: "Jahresbeitrag (€)", bindPropertyPath: "customFields.member.iSsJ-bIIVANYkzHDLnbcx", required: true, min: 0 },
            { id: "trialRate", type: "boolean", label: "Schnuppertarif im ersten Jahr", bindPropertyPath: "customFields.member.yuJULD" },
          ],
        },
        {
          // Ein Eintrag je Vertrag: der Jahresbeitrag und optional ein Monatsbeitrag.
          id: "contracts",
          label: "Verträge",
          minItems: 1,
          maxItems: 2,
          itemCaption: "Vertrag",
          itemMode: "noHeader",
          fields: [
            {
              id: "plan",
              type: "select",
              label: "Beitragsart",
              bindPropertyPath: "contracts.plan",
              required: true,
              options: PLANS.map((plan) => ({ id: plan.id, value: plan.id, label: plan.label })),
            },
          ],
        },
        {
          id: "payment",
          label: "Zahlung",
          fields: [
            // Kontoinhaber:in bei Lastschrift. Lastschrift selbst ist erst
            // erlaubt, wenn sie in Campai eingerichtet ist — dann hier
            // "sepaDirectDebit" ergänzen und SEPA_DIRECT_DEBIT_ENABLED in
            // src/lib/campai-registration.ts einschalten.
            { id: "payerName", type: "text", format: "text", label: "Kontoinhaber:in", bindPropertyPath: "debtor.name" },
            { id: "paymentMethod", type: "paymentMethod", label: "Zahlungsmethode", allowedPaymentMethods: ["sepaCreditTransfer"], paymentMode: "recurring", required: true },
          ],
        },
        {
          id: "consent",
          label: "Zustimmung",
          fields: [
            { id: "statutesRead", type: "boolean", label: "Vereinssatzung gelesen", required: true },
            { id: "feeRulesRead", type: "boolean", label: "Beitragsordnung gelesen", required: true },
            { id: "signature", type: "signature", label: "Unterschrift Mitgliedsantrag", required: true },
            { id: "sepaSignature", type: "signature", label: "Unterschrift SEPA-Lastschriftmandat" },
          ],
        },
      ],
    },
  },
  submit: {
    submitCaption: "Absenden",
    useCaptcha: false,
    denyApplyWithExistingEmail: false,
    submittedText: "Vielen Dank für deinen Mitgliedsantrag. Wir bestätigen hiermit den Eingang.",
    navigateUrl: "",
    navigateWaitSeconds: 0,
  },
  confirmation: {
    confirmationMail: null,
    mustConfirmEmail: false,
    expressaTemplate: null,
  },
};

const env = await readEnv();
const formId = process.argv[2];
const base = `https://cloud.campai.com/api/${env.CAMPAI_ORGANIZATION_ID}/${env.CAMPAI_MANDATE_ID}/crm/applications/forms`;

const response = await fetch(formId ? `${base}/${formId}` : base, {
  method: "POST",
  headers: { "X-API-Key": env.CAMPAI_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify(form),
});
const text = await response.text();

if (!response.ok) {
  console.error(`Campai ${response.status}: ${text}`);
  process.exit(1);
}

console.log(formId ? `Formular ${formId} aktualisiert.` : `Formular angelegt: ${text}`);
