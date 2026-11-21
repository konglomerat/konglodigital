// src/app/[lang]/registration/page.tsx — Mitgliedsantrag.
//
// Öffentlich: Wer hier ankommt, ist noch kein Mitglied und hat kein Konto.
// Der Antrag geht über /api/registration an Campai (CRM → Anträge →
// „Mitgliedsantrag (konglodigital)") und wird dort geprüft und angenommen;
// dabei legt Campai den Kontakt mit Jahresbeitrag und Zugangskarte an.
//
// Links können Beitrag, Schnuppertarif, Karte und Beitrittsdatum vorwählen:
// /registration?fee=180&trial=1&card=gross&date=2026-11-01
import type { Metadata } from "next";

import Face from "@/components/knglmrt/Face";
import {
  ANNUAL_FEE_OPTIONS,
  type AccessTariff,
  type AnnualFee,
} from "@/lib/campai-registration";
import PageTitle from "../components/PageTitle";
import RegistrationForm, { type RegistrationPreset } from "./RegistrationForm";

export const metadata: Metadata = {
  title: "Mitgliedsantrag",
};

const CARD_PARAMS: Record<string, AccessTariff> = {
  keine: "none",
  klein: "small",
  gross: "large",
  punkte: "punchCard",
};

const single = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const readPreset = (
  params: Record<string, string | string[] | undefined>,
): RegistrationPreset => {
  const fee = Number(single(params.fee));
  const card = CARD_PARAMS[single(params.card) ?? ""];
  const date = single(params.date);
  return {
    ...(ANNUAL_FEE_OPTIONS.includes(fee as AnnualFee)
      ? { annualFee: fee as AnnualFee }
      : {}),
    ...(single(params.trial) === "1" ? { trialRate: true } : {}),
    ...(card ? { accessTariff: card } : {}),
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { entryAt: date } : {}),
  };
};

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const preset = readPreset(await searchParams);

  return (
    <div className="flex flex-col gap-10">
      <PageTitle
        title="Mitgliedsantrag"
        titleClassName="text-primary!"
        customActions={<Face number={14} size={72} title="" />}
      />
      <RegistrationForm preset={preset} />
    </div>
  );
}
