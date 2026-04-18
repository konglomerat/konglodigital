import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PageTitle from "../../components/PageTitle";
import {
  CALENDAR_URL,
  TIME_ZONE,
  extractTags,
  getTimeRange,
  getUpcomingEvents,
  tagIconMap,
  type CalendarEvent,
} from "../calendar-data";

export const revalidate = 300;
export const runtime = "nodejs";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export default async function CalendarEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  let events: CalendarEvent[] = [];
  let errorMessage: string | null = null;

  try {
    events = await getUpcomingEvents();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Kalender konnte nicht geladen werden.";
  }

  const { eventId } = await params;
  const decodedEventId = decodeURIComponent(eventId);
  const event = events.find((entry) => entry.id === decodedEventId);
  const tags = event ? extractTags(event.description) : [];

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Kalender"
        title="Termin-Details"
        subTitle="Informationen zu einem ausgewählten Termin."
        className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
        backLink={{ href: "/calendar", label: "Zurück zur Übersicht" }}
        links={[
          {
            href: CALENDAR_URL,
            label: "Google Kalender öffnen",
            target: "_blank",
            rel: "noreferrer",
            size: "medium",
            className:
              "rounded-full border-blue-600 text-blue-600 hover:border-blue-600 hover:bg-blue-50 hover:text-blue-600",
          },
        ]}
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {!errorMessage && !event ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          Dieser Termin ist nicht mehr in den nächsten 7 Tagen verfügbar.
        </div>
      ) : null}

      {event ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-zinc-900">
                {event.summary}
              </h2>
              <p className="text-sm text-zinc-600">
                {dateFormatter.format(event.start)}
                {event.allDay
                  ? " • Ganztägig"
                  : ` • ${getTimeRange(event.start, event.end)}`}
              </p>
              {event.location ? (
                <p className="text-sm text-zinc-500">{event.location}</p>
              ) : null}
            </div>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {tags.map((tag) => {
                  const entry = tagIconMap[tag];
                  return (
                    <span
                      key={tag}
                      title={entry.label}
                      className={`inline-flex items-center justify-center text-xl ${entry.colorClassName}`}
                    >
                      <FontAwesomeIcon icon={entry.icon} className="h-5 w-5" />
                      <span className="sr-only">{entry.label}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Beschreibung
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-700">
              {event.description || "Keine Beschreibung hinterlegt."}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
