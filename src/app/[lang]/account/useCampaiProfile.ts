"use client";

// src/app/[lang]/account/useCampaiProfile.ts — der Campai-Kontakt des
// angemeldeten Mitglieds samt seinen Verträgen, einmal geladen für die ganze
// Seite.
//
// Fast jede Rubrik hängt daran: „Mitgliedschaft" und „Zugangskarte" an Kontakt
// und Verträgen, „Persönliche Daten" und „Kommunikation" zeigen und schreiben
// die Stammdaten, „Belege" braucht das Debitorenkonto. Der Abruf kostet
// Campai-Aufrufe und läuft deshalb erst nach dem ersten Paint — bis dahin
// stehen die Felder auf „…".
import { useCallback, useEffect, useState } from "react";

import type { AccountCampaiProfileResponse } from "@/app/api/account/campai-profile/route";
import type { CampaiContactProfile } from "@/lib/campai-contact-profile";
import type { CampaiMembership } from "@/lib/campai-member-tariff";

type ProfileResponse = AccountCampaiProfileResponse & { error?: string };

export type CampaiProfileState = {
  profile: CampaiContactProfile | null;
  /** Tarif und Jahresbeitrag aus den Verträgen. */
  membership: CampaiMembership | null;
  loading: boolean;
  /** Ein Satz, warum gerade nichts zu sehen und zu ändern ist, sonst `null`. */
  unavailableHint: string | null;
  /** Gesperrt, solange es keinen Kontakt gibt, an dem etwas zu ändern wäre. */
  locked: boolean;
  save: (patch: Record<string, unknown>) => Promise<CampaiContactProfile>;
};

export default function useCampaiProfile(): CampaiProfileState {
  const [profile, setProfile] = useState<CampaiContactProfile | null>(null);
  const [membership, setMembership] = useState<CampaiMembership | null>(null);
  const [linked, setLinked] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/account/campai-profile");
        const data = (await response.json()) as ProfileResponse;
        if (!active) {
          return;
        }
        setLinked(data.linked);
        setProfile(data.profile);
        setMembership(data.membership ?? null);
      } catch {
        // Ohne Campai bleiben die Felder leer und gesperrt — die Kontoseite
        // steht trotzdem.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  // Jeder Dialog schickt nur seine eigenen Felder. Die Route lässt alles
  // unangetastet, was nicht im Rumpf steht — so fasst ein Speichern in der
  // einen Rubrik die Felder der anderen in Campai nicht an.
  const save = useCallback(async (patch: Record<string, unknown>) => {
    const response = await fetch("/api/account/campai-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as ProfileResponse;

    if (!response.ok || !data.profile) {
      throw new Error(data.error ?? "Speichern fehlgeschlagen.");
    }

    // Campai darf Werte normalisieren (Telefonformat, Land) — danach zeigt die
    // Seite das, was dort wirklich steht, und nicht den Entwurf.
    setProfile(data.profile);
    return data.profile;
  }, []);

  const unavailableHint = loading
    ? "Daten werden geladen …"
    : !linked
      ? "Dein Konto ist noch nicht mit einem Campai-Kontakt verknüpft."
      : !profile
        ? "Die Daten aus Campai sind gerade nicht abrufbar."
        : null;

  return {
    profile,
    membership,
    loading,
    unavailableHint,
    locked: loading || !profile,
    save,
  };
}
