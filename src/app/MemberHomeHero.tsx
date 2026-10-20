// Startseiten-Kopf für angemeldete Mitglieder: dunkles Band mit Avatar,
// Begrüßung mit Rufnamen und Mitgliedsnummer, rechts der große Weg ins
// eigene Profil. Der Gast-Kopf mit „Über uns" und der Weg zur Mitgliedschaft
// sind für sie überflüssig.
import { Suspense } from "react";
import type { User } from "@supabase/supabase-js";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import Button from "@/components/knglmrt/Button";
import Face from "@/components/knglmrt/Face";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { fetchCampaiContactProfile } from "@/lib/campai-contact-profile";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { getServerSession } from "@/lib/server-session";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

// Wie auf der Kontoseite: der Rufname, nicht der ganze Name.
const greetingNameOf = (user: User) =>
  text(user.user_metadata?.first_name) ||
  text(user.user_metadata?.campai_name).split(/\s+/)[0] ||
  "";

// „03/2024" — Campai liefert das Eintrittsdatum als ISO-Datum.
const formatMonth = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
};

// Das Eintrittsdatum steht nur in Campai. Der Abruf läuft gestreamt, damit
// die Startseite nicht auf Campai wartet; schlägt er fehl, fehlt die Angabe.
async function MemberSince({
  contactId,
  label,
}: {
  contactId: string;
  label: string;
}) {
  const profile = await fetchCampaiContactProfile(contactId).catch(() => null);
  const month = profile?.memberSince ? formatMonth(profile.memberSince) : null;
  return month ? <span>{`${label} ${month}`}</span> : null;
}

export default async function MemberHomeHero({ user }: { user: User }) {
  const [{ tx, locale }, { supabase }] = await Promise.all([
    getServerI18n(),
    getServerSession(),
  ]);
  const memberProfile = await getMemberProfileByUserId(supabase, user.id);
  const greetingName = greetingNameOf(user);
  const memberNumber = memberProfile?.campaiMemberNumber ?? null;
  const contactId = memberProfile?.campaiContactId ?? null;

  // Maße aus dem Entwurf „Startseite v3": dunkles Band, links Avatar und
  // Begrüßung, rechts eine schmale weiße Karte mit dem Weg ins Profil. Der
  // innere Abstand richtet den Inhalt an den Sektionen darunter aus.
  return (
    <section className="relative left-1/2 -mt-4 w-[100dvw] -translate-x-1/2 bg-[var(--knglmrt-dark-100)] py-10 text-[var(--knglmrt-paper)] md:-mt-10 md:py-14">
      <div className="mx-auto w-full max-w-[1600px] px-3 md:px-7">
        <div className="flex flex-wrap items-center justify-between gap-8 px-6 md:px-10">
          <div className="flex min-w-0 flex-col items-start gap-4">
            <p className="knglmrt-caption m-0 text-[var(--knglmrt-pink-60)]">
              {tx("Mitgliederbereich", "de")}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-6">
              <span
                aria-hidden
                className="flex h-24 w-24 flex-none items-center justify-center knglmrt-border bg-[var(--knglmrt-tint-avatar)]"
              >
                <Face number={4} size={84} color="var(--knglmrt-ink)" />
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="m-0 break-words font-[family-name:var(--font-display)] text-[clamp(40px,6vw,59px)] font-black leading-none text-[var(--knglmrt-paper)]">
                  {greetingName
                    ? `${tx("Hallo", "de")} ${greetingName}.`
                    : tx("Hallo.", "de")}
                </h1>
                <p className="m-0 flex flex-wrap gap-x-1.5 knglmrt-num text-[var(--knglmrt-dark-30)] empty:hidden">
                  {contactId ? (
                    <Suspense fallback={null}>
                      <MemberSince
                        contactId={contactId}
                        label={tx("Mitglied seit", "de")}
                      />
                    </Suspense>
                  ) : null}
                  {memberNumber ? (
                    <span className="[span+&]:before:mr-1.5 [span+&]:before:content-['·']">
                      {`${tx("Nr.", "de")} ${memberNumber}`}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>

          <div className="flex max-w-[380px] flex-col items-start gap-3.5 bg-[var(--knglmrt-paper)] px-7 py-6 text-[var(--knglmrt-ink)] shadow-[inset_0_0_0_3px_var(--knglmrt-paper-pink)]">
            <p className="m-0 text-pretty">
              {tx(
                "Persönliche Daten, Tarif, Selfservices – alles auf deiner persönlichen Seite.",
                "de",
              )}
            </p>
            <Button
              href={localizePathname("/account", locale)}
              kind="emphasis"
              icon={faArrowRight}
              iconPosition="right"
            >
              {tx("Zu meinem Profil", "de")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
