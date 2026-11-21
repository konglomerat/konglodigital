import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import {
  WorkshopBookingError,
  createWorkshopBooking,
  getWorkshop,
} from "@/lib/campai-events";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import type { WorkshopPaymentMethod } from "@/lib/workshops";

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const PAYMENT_METHODS: WorkshopPaymentMethod[] = [
  "sepaCreditTransfer",
  "cash",
  "online",
];

// Angemeldete Mitglieder buchen mit ihrem Campai-Kontakt — dann greifen
// Mitgliedertarife, und die Buchung landet in ihrer Kontakthistorie.
const loadMember = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const profile = await getMemberProfileByUserId(supabase, data.user.id);
  const contactId = profile?.campaiContactId ?? null;
  return {
    contactId,
    membershipNumber: profile?.campaiMemberNumber ?? null,
    isMember: Boolean(contactId && profile?.campaiMemberNumber),
  };
};

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) => {
  const { eventId } = await context.params;

  // Workshops sind noch „Coming Soon“ und nur angemeldet erreichbar.
  const member = await loadMember(request);
  if (!member) {
    return NextResponse.json(
      { error: "Bitte melde dich an, um zu buchen." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  // Honeypot: Menschen sehen das Feld nicht, Bots füllen es aus.
  if (text(body.website)) {
    return NextResponse.json({ success: true, bookingId: null, waitlisted: false });
  }

  if (body.acceptTerms !== true) {
    return NextResponse.json(
      { error: "Bitte bestätige die Teilnahme- und Stornobedingungen." },
      { status: 400 },
    );
  }

  try {
    const event = await getWorkshop(eventId);
    if (!event) {
      return NextResponse.json(
        { error: "Diesen Termin gibt es nicht (mehr)." },
        { status: 404 },
      );
    }

    const applicant = (body.applicant ?? {}) as Record<string, unknown>;
    const address = body.address as Record<string, unknown> | null | undefined;
    const paymentMethod = PAYMENT_METHODS.find(
      (method) => method === body.paymentMethod,
    );

    const result = await createWorkshopBooking(event, {
      rateId: text(body.rateId, 40) || null,
      seats: body.seats === undefined ? 1 : Number(body.seats),
      applicant: {
        name: text(applicant.name, 81),
        email: text(applicant.email, 100),
        phone: text(applicant.phone, 40),
      },
      attendeeNames: Array.isArray(body.attendeeNames)
        ? body.attendeeNames.map((name) => text(name, 81))
        : [],
      address: address
        ? {
            addressLine: text(address.addressLine, 120),
            zip: text(address.zip, 10),
            city: text(address.city, 80),
          }
        : null,
      paymentMethod: paymentMethod ?? null,
      contactId: member?.contactId ?? null,
      membershipNumber: member?.membershipNumber ?? null,
      isMember: member?.isMember ?? false,
    });

    // Freie Plätze auf der Übersicht sofort neu zählen.
    revalidateTag("campai-events", { expire: 0 });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof WorkshopBookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[workshops] booking failed", error);
    return NextResponse.json(
      { error: "Die Buchung hat nicht geklappt. Bitte versuch es noch einmal." },
      { status: 500 },
    );
  }
};
