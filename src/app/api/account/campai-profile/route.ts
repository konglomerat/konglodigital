import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  fetchCampaiContactProfile,
  fetchCampaiDepartments,
  missingAddressFields,
  updateCampaiContactProfile,
  type CampaiContactAddress,
  type CampaiContactLanguage,
  type CampaiContactProfile,
  type CampaiContactProfilePatch,
} from "@/lib/campai-contact-profile";
import {
  fetchCampaiMembership,
  type CampaiMembership,
} from "@/lib/campai-member-tariff";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Alles, was die Kontoseite aus Campai zeigt: der CRM-Kontakt (Stammdaten,
// Mitgliedschaft, Debitor) und seine Verträge (Tarif, Jahresbeitrag).
// Supabase liefert nur die Kontakt-ID; beides wird parallel
// direkt über sie abgerufen. Geschrieben werden nur die Stammdaten und die
// Abteilungen.
//
// Der Abruf steht nicht in der Server-Hülle von /account: er kostet Campai-
// Aufrufe und darf den ersten Paint nicht aufhalten. Die Rubriken rendern
// leer und füllen sich nach.

export const dynamic = "force-dynamic";

export type AccountCampaiProfileResponse = {
  profile: CampaiContactProfile | null;
  /** Nur beim Lesen; `null`, wenn die Verträge nicht abrufbar waren. */
  membership?: CampaiMembership | null;
  /** Ohne Kontakt-ID im Profil gibt es nichts zu zeigen und zu ändern. */
  linked: boolean;
};

const ADDRESS_FIELD_LABELS: Record<string, string> = {
  addressLine: "Straße und Hausnummer",
  zip: "PLZ",
  city: "Ort",
  country: "Land",
};

const toText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim().slice(0, maxLength);
};

const readAddress = (value: unknown): CampaiContactAddress | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    country: toText(raw.country, 2)?.toUpperCase() ?? "",
    state: toText(raw.state, 45) ?? "",
    zip: toText(raw.zip, 10) ?? "",
    city: toText(raw.city, 45) ?? "",
    addressLine: toText(raw.addressLine, 45) ?? "",
    details1: toText(raw.details1, 45) ?? "",
    details2: toText(raw.details2, 45) ?? "",
  };
};

const getContactId = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { user: null, contactId: null } as const;
  }

  const memberProfile = await getMemberProfileByUserId(
    supabase,
    data.user.id,
  ).catch(() => null);

  return {
    user: data.user,
    contactId: memberProfile?.campaiContactId ?? null,
  } as const;
};

export const GET = async (request: NextRequest) => {
  const { user, contactId } = await getContactId(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!contactId) {
    return NextResponse.json<AccountCampaiProfileResponse>({
      profile: null,
      membership: null,
      linked: false,
    });
  }

  // Ohne Campai bleiben die Rubriken bei „nicht abrufbar" — kein Fehlerfall
  // für die Seite. Kontakt und Verträge scheitern unabhängig voneinander.
  const [profile, membership] = await Promise.all([
    fetchCampaiContactProfile(contactId).catch(() => null),
    fetchCampaiMembership(contactId).catch(() => null),
  ]);

  return NextResponse.json<AccountCampaiProfileResponse>({
    profile,
    membership: profile ? membership : null,
    linked: true,
  });
};

export const POST = async (request: NextRequest) => {
  const { user, contactId } = await getContactId(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!contactId) {
    return NextResponse.json(
      {
        error:
          "Dein Konto ist noch nicht mit einem Campai-Kontakt verknüpft. Melde dich bitte beim Vorstand.",
      },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  // Der Patch trägt nur, was die jeweilige Kachel wirklich geschickt hat:
  // „Persönliche Daten" und „Kommunikation" speichern getrennt, und ein Feld,
  // das nicht im Rumpf steht, bleibt in Campai unangetastet.
  const patch: CampaiContactProfilePatch = {};

  if ("firstName" in body) {
    patch.firstName = toText(body.firstName, 40) ?? "";
  }
  if ("lastName" in body) {
    const lastName = toText(body.lastName, 40) ?? "";
    if (!lastName) {
      return NextResponse.json(
        { error: "Der Name darf nicht leer sein." },
        { status: 400 },
      );
    }
    patch.lastName = lastName;
  }
  if ("organizationName" in body) {
    patch.organizationName = toText(body.organizationName, 200) ?? "";
  }
  if ("language" in body) {
    const language = toText(body.language, 2);
    if (language !== "de" && language !== "en") {
      return NextResponse.json(
        { error: "Unbekannte Sprache." },
        { status: 400 },
      );
    }
    patch.language = language as CampaiContactLanguage;
  }
  if ("email" in body) {
    const email = toText(body.email, 200) ?? "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Die E-Mail-Adresse sieht nicht gültig aus." },
        { status: 400 },
      );
    }
    patch.email = email;
  }
  if ("phone" in body) {
    patch.phone = toText(body.phone, 40) ?? "";
  }
  if ("mobilePhone" in body) {
    patch.mobilePhone = toText(body.mobilePhone, 40) ?? "";
  }
  if ("address" in body) {
    const address = readAddress(body.address);
    if (!address) {
      return NextResponse.json(
        { error: "Die Adresse konnte nicht gelesen werden." },
        { status: 400 },
      );
    }

    // Das Land steht nicht mehr im Formular. Eine bestehende Adresse schickt
    // es unverändert mit; nur bei einer frisch angelegten fehlt es, und dann
    // ist DE die einzige sinnvolle Annahme — der Verein sitzt in Dresden.
    // Soll je ein anderes Land gesetzt werden, geht das in Campai selbst.
    if (!address.country && Object.values(address).some((entry) => entry)) {
      address.country = "DE";
    }

    // Campai nimmt entweder gar keine Adresse oder eine mit diesen vier
    // Feldern — eine halbe Adresse würde es mit einem 400 abweisen, das
    // niemandem sagt, was fehlt.
    const missing = missingAddressFields(address);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Für eine Adresse braucht Campai auch: ${missing
            .map((field) => ADDRESS_FIELD_LABELS[field] ?? field)
            .join(", ")}.`,
        },
        { status: 400 },
      );
    }

    patch.address = address;
  }

  if ("departmentIds" in body) {
    const ids = Array.isArray(body.departmentIds)
      ? body.departmentIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : null;
    if (!ids) {
      return NextResponse.json(
        { error: "Die Abteilungen konnten nicht gelesen werden." },
        { status: 400 },
      );
    }

    // Wählbar ist nur, was die Kontoseite auch anbietet — keine Kategorien,
    // keine Abteilungen anderer Kontakttypen, keine erfundenen IDs.
    const offered = await fetchCampaiDepartments().catch(() => null);
    if (!offered) {
      return NextResponse.json(
        { error: "Die Abteilungen sind gerade nicht abrufbar." },
        { status: 502 },
      );
    }
    const offeredIds = new Set(offered.map((department) => department.id));
    if (ids.some((id) => !offeredIds.has(id))) {
      return NextResponse.json(
        { error: "Diese Abteilung gibt es nicht zur Auswahl." },
        { status: 400 },
      );
    }

    patch.departmentIds = [...new Set(ids)];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Es gab nichts zu speichern." },
      { status: 400 },
    );
  }

  try {
    const profile = await updateCampaiContactProfile(contactId, patch);

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "Campai kennt den verknüpften Kontakt nicht mehr. Melde dich bitte beim Vorstand.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ profile, linked: true });
  } catch (updateError) {
    const message =
      updateError instanceof Error ? updateError.message : "Unbekannter Fehler";

    // Die Telefonfelder prüft Campai selbst und antwortet mit 400 — das ist
    // der häufigste Fall und verdient einen Satz, der weiterhilft. Ein 403
    // heißt dagegen, dass der API-Schlüssel diesen Kontakttyp nicht schreiben
    // darf; daran ändert keine Eingabe etwas.
    const onlyDepartments =
      Object.keys(patch).length === 1 && patch.departmentIds !== undefined;
    const friendly = /\b400\b/.test(message)
      ? onlyDepartments
        ? "Campai hat die Abteilungen nicht angenommen."
        : "Campai hat die Eingabe abgelehnt. Prüfe bitte Telefonnummern (z. B. +49 351 1234567) und die Adresse."
      : /\b403\b/.test(message)
        ? "Campai lässt diese Änderung für deinen Kontakt nicht zu. Melde dich bitte beim Vorstand."
        : "Die Änderung konnte nicht an Campai übertragen werden.";

    return NextResponse.json({ error: friendly }, { status: 502 });
  }
};
