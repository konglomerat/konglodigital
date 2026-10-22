// src/app/[lang]/workshops/[eventId]/page.tsx — einen Workshop-Termin buchen.
//
// Lädt den Termin frisch aus Campai (freie Plätze, Tarife, Zahlarten) und
// übergibt ihn dem Buchungsformular. Angemeldete Mitglieder buchen mit ihrem
// Campai-Kontakt und sehen die Mitgliedertarife.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { getWorkshop, listUpcomingWorkshops } from "@/lib/campai-events";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { getServerSession } from "@/lib/server-session";
import {
  formatDate,
  type WorkshopEvent,
} from "@/lib/workshops";
import PageTitle from "../../components/PageTitle";
import WorkshopBooking, { type BookingViewer } from "./WorkshopBooking";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ eventId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getWorkshop(eventId).catch(() => null);
  if (!event) return { title: "Workshop" };
  return {
    title: `${event.title} · ${event.dateOpen ? "Termin offen" : formatDate(event.start)}`,
    description: event.description || undefined,
  };
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const loadViewer = async (): Promise<BookingViewer> => {
  const { supabase, user } = await getServerSession();
  if (!user) {
    return { authenticated: false, isMember: false, name: "", email: "" };
  }
  const profile = await getMemberProfileByUserId(supabase, user.id).catch(
    () => null,
  );
  const metadata = user.user_metadata ?? {};
  const name =
    [text(metadata.first_name), text(metadata.last_name)].filter(Boolean).join(" ") ||
    text(profile?.campaiName) ||
    text(metadata.campai_name);
  return {
    authenticated: true,
    isMember: Boolean(profile?.campaiContactId && profile?.campaiMemberNumber),
    name,
    email: user.email ?? "",
  };
};

export default async function WorkshopBookingPage({ params }: Params) {
  const { eventId } = await params;
  const [{ tx, locale }, event, viewer] = await Promise.all([
    getServerI18n(),
    getWorkshop(eventId),
    loadViewer(),
  ]);
  if (!event) notFound();

  // Weitere Termine derselben Reihe — als Sprung zu einem anderen Datum.
  let otherDates: WorkshopEvent[] = [];
  if (event.seriesId) {
    const upcoming = await listUpcomingWorkshops().catch(() => []);
    otherDates = upcoming
      .filter((entry) => entry.seriesId === event.seriesId && entry.id !== event.id)
      .slice(0, 8);
  }

  const overviewHref = localizePathname("/workshops", locale);

  return (
    <div className="mx-auto w-full max-w-[1120px] md:px-3">
      <PageTitle
        backLink={{ href: `${overviewHref}#termine`, label: tx("Alle Termine", "de") }}
        title={<span className="break-words">{event.title}</span>}
      />
      <div className="mt-8">
        <WorkshopBooking
          event={event}
          viewer={viewer}
          otherDates={otherDates}
          loginHref={`${localizePathname("/login", locale)}?redirectedFrom=${encodeURIComponent(
            localizePathname(`/workshops/${event.id}`, locale),
          )}`}
          overviewHref={overviewHref}
        />
      </div>
    </div>
  );
}
