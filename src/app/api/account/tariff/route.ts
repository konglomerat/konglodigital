import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchCampaiContactProfile } from "@/lib/campai-contact-profile";
import type { CampaiAccessTariff } from "@/lib/campai-plans";
import {
  applyTariffChange,
  fetchTariffChangeState,
  TariffChangeError,
  type TariffChangeResult,
  type TariffChangeState,
  type TariffPaymentMethod,
} from "@/lib/campai-tariff-change";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { sendTemplateMessage } from "@/lib/membership-applications/campai";
import { CARD_TARIFF_INSTRUCTIONS_TEMPLATE_ID } from "@/lib/membership-applications/config";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Tarifwechsel der Zugangskarte als Self-Service. GET liefert, was die
// Tarifseite zum Entscheiden braucht (laufender und vorgemerkter Tarif,
// Quartalsgrenzen, Bankdaten), POST trägt den Wechsel in Campai ein. Die
// Regeln dazu stehen in `campai-tariff-change.ts`.

export const dynamic = "force-dynamic";

export type AccountTariffResponse = {
  state: TariffChangeState | null;
  /** Für Mail und Hinweise im Dialog — die Adresse, an die Campai schickt. */
  email: string | null;
  linked: boolean;
  error?: string;
};

export type AccountTariffChangeResponse = {
  result?: TariffChangeResult;
  error?: string;
};

const TARGETS: readonly CampaiAccessTariff[] = [
  "abo_klein",
  "abo_gross",
  "punktekarte",
  "keiner",
];
const PAYMENT_METHODS: readonly TariffPaymentMethod[] = [
  "sepaCreditTransfer",
  "sepaDirectDebit",
];

const loadMember = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const memberProfile = await getMemberProfileByUserId(
    supabase,
    data.user.id,
  ).catch(() => null);
  const contactId = memberProfile?.campaiContactId ?? null;

  return { user: data.user, contactId };
};

export const GET = async (request: NextRequest) => {
  const member = await loadMember(request);
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!member.contactId) {
    return NextResponse.json<AccountTariffResponse>({
      state: null,
      email: null,
      linked: false,
    });
  }

  try {
    const profile = await fetchCampaiContactProfile(member.contactId);
    if (!profile) {
      return NextResponse.json<AccountTariffResponse>({
        state: null,
        email: null,
        linked: true,
      });
    }
    const state = await fetchTariffChangeState(member.contactId, {
      debtorMethod: profile.debtor?.paymentMethod ?? null,
      isInstitution: profile.isInstitution,
    });
    return NextResponse.json<AccountTariffResponse>({
      state,
      email: profile.email || null,
      linked: true,
    });
  } catch (error) {
    console.error("Tarifstand aus Campai nicht abrufbar", error);
    return NextResponse.json<AccountTariffResponse>(
      {
        state: null,
        email: null,
        linked: true,
        error: "Dein Tarif ist gerade nicht abrufbar.",
      },
      { status: 502 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  const member = await loadMember(request);
  if (!member) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!member.contactId) {
    return NextResponse.json<AccountTariffChangeResponse>(
      { error: "Dein Konto ist noch nicht mit Campai verknüpft." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const target = TARGETS.find((entry) => entry === body?.target);
  if (!target) {
    return NextResponse.json<AccountTariffChangeResponse>(
      { error: "Unbekannter Tarif." },
      { status: 400 },
    );
  }
  const paymentMethod =
    PAYMENT_METHODS.find((entry) => entry === body?.paymentMethod) ?? null;

  try {
    const profile = await fetchCampaiContactProfile(member.contactId);
    if (!profile) {
      return NextResponse.json<AccountTariffChangeResponse>(
        { error: "Dein Campai-Kontakt ist gerade nicht abrufbar." },
        { status: 502 },
      );
    }

    const memberName = profile.isInstitution
      ? profile.organizationName
      : [profile.firstName, profile.lastName].filter(Boolean).join(" ");

    const result = await applyTariffChange({
      contactId: member.contactId,
      target,
      paymentMethod,
      requestCard: body?.requestCard === true,
      memberName: memberName || member.user.email || "",
      isInstitution: profile.isInstitution,
      debtorMethod: profile.debtor?.paymentMethod ?? null,
    });

    // Wer neu eine Karte will und per Überweisung zahlt, bekommt die
    // Anleitung (Dauerauftrag, Roseguarden) zusätzlich per Mail. Scheitert
    // der Versand, steht der Wechsel trotzdem.
    if (result.cardRequested && result.transfer) {
      result.instructionsMailSent = await sendTemplateMessage(
        member.contactId,
        CARD_TARIFF_INSTRUCTIONS_TEMPLATE_ID,
      )
        .then(() => true)
        .catch((error: unknown) => {
          console.error("Campai: Mail zum Tarifwechsel nicht verschickt", error);
          return false;
        });
    }

    return NextResponse.json<AccountTariffChangeResponse>({ result });
  } catch (error) {
    if (error instanceof TariffChangeError) {
      return NextResponse.json<AccountTariffChangeResponse>(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Tarifwechsel in Campai fehlgeschlagen", error);
    return NextResponse.json<AccountTariffChangeResponse>(
      {
        error:
          "Der Wechsel ließ sich in Campai nicht eintragen. Bitte versuch es später noch einmal.",
      },
      { status: 502 },
    );
  }
};
