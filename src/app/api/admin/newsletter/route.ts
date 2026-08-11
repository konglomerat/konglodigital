import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  TIME_ZONE,
  getUpcomingEvents,
} from "@/app/[lang]/calendar/calendar-data";
import {
  DEFAULT_LOCALE,
  localizePathname,
  normalizeLocale,
} from "@/i18n/config";
import {
  NEWSLETTER_ASPECTS,
  normalizeNewsletterAspect,
  normalizeNewsletterLayout,
  renderNewsletter,
  type NewsletterAspect,
  type NewsletterCalendar,
  type NewsletterItem,
  type NewsletterProject,
} from "@/lib/newsletter-builder";
import { buildProjectPath } from "@/lib/project-path";
import { createHtmlZip, createRapidmailDraft } from "@/lib/rapidmail";
import {
  getSupabaseRenderedImageUrl,
  isImageUrl,
} from "@/lib/resource-media";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

type ProjectRow = {
  id: string;
  pretty_title?: string | null;
  name: string;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  publish_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type RawProjectItem = {
  type: "project";
  projectId: string;
  layout?: unknown;
  aspect?: unknown;
  imageUrl?: unknown;
  showLink?: unknown;
  linkText?: unknown;
};

type RawButtonItem = {
  type: "button";
  title?: unknown;
  href?: unknown;
};

type RawBannerItem = {
  type: "banner";
  title?: unknown;
  content?: unknown;
};

type RawNewsletterItem = RawProjectItem | RawButtonItem | RawBannerItem;

type NewsletterRequestBody = {
  action?: unknown;
  locale?: unknown;
  title?: unknown;
  subject?: unknown;
  intro?: unknown;
  showProjectsHeading?: unknown;
  items?: unknown;
  projectIds?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
  recipientListId?: unknown;
  sendAt?: unknown;
  send_at?: unknown;
  status?: unknown;
};

const ASPECT_DIMENSIONS: Record<
  NewsletterAspect,
  { width: number; height: number } | null
> = {
  original: null,
  "1:1": { width: 1, height: 1 },
  "4:3": { width: 4, height: 3 },
  "3:2": { width: 3, height: 2 },
  "16:9": { width: 16, height: 9 },
  "4:5": { width: 4, height: 5 },
  "3:4": { width: 3, height: 4 },
};

const MAX_ITEMS = 80;
const MAX_PROJECTS = 24;
const MAX_HTML_BYTES = 90_000;
const CALENDAR_TIMEOUT_MS = 15_000;
const NEWSLETTER_ACTIONS = ["preview", "export", "draft"] as const;
type NewsletterAction = (typeof NEWSLETTER_ACTIONS)[number];

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const textValue = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const normalizeIdList = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((entry) => textValue(entry, 200))
        .filter(Boolean)
        .slice(0, MAX_PROJECTS),
    ),
  );
};

const normalizeRawItems = (body: NewsletterRequestBody) => {
  const source = Array.isArray(body.items)
    ? body.items
    : normalizeIdList(body.projectIds).map((projectId) => ({
        type: "project",
        projectId,
      }));
  const items: RawNewsletterItem[] = [];
  const usedProjectIds = new Set<string>();

  for (const candidate of source.slice(0, MAX_ITEMS)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;

    if (raw.type === "project") {
      const projectId = textValue(raw.projectId, 200);
      if (!projectId || usedProjectIds.has(projectId)) continue;
      items.push({
        type: "project",
        projectId,
        layout: raw.layout,
        aspect: raw.aspect,
        imageUrl: raw.imageUrl,
        showLink: raw.showLink,
        linkText: raw.linkText,
      });
      usedProjectIds.add(projectId);
      continue;
    }

    if (raw.type === "button") {
      items.push({ type: "button", title: raw.title, href: raw.href });
      continue;
    }

    if (raw.type === "banner") {
      items.push({
        type: "banner",
        title: raw.title,
        content: raw.content,
      });
    }
  }

  return items;
};

const getPublicSiteUrl = (request: NextRequest) => {
  const fallback = new URL(request.url).origin;
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return fallback;

  try {
    const parsed = new URL(configured);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.origin
      : fallback;
  } catch {
    return fallback;
  }
};

const projectImages = (row: ProjectRow) =>
  Array.from(
    new Set(
      [row.image, ...(row.images ?? [])].filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value) && isImageUrl(value),
      ),
    ),
  );

const resolveProjectImage = (
  row: ProjectRow,
  requested: unknown,
  aspect: NewsletterAspect,
) => {
  const images = projectImages(row);
  const requestedImage = textValue(requested, 2_000);
  const source = images.includes(requestedImage)
    ? requestedImage
    : (images[0] ?? null);
  if (!source) return null;

  const ratio = ASPECT_DIMENSIONS[aspect];
  return ratio
    ? getSupabaseRenderedImageUrl(source, {
        width: 1_080,
        height: Math.round((1_080 * ratio.height) / ratio.width),
        resize: "cover",
      })
    : getSupabaseRenderedImageUrl(source, { width: 1_080 });
};

const createExcerpt = (value: string | null | undefined) => {
  const text = String(value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}(?:[-*+] |\d+\. )/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Noch keine Beschreibung hinterlegt.";
  return text.length <= 520 ? text : `${text.slice(0, 519).trimEnd()}…`;
};

const createFilename = (title: string) => {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${new Date().toISOString().slice(0, 10)}-${slug || "newsletter"}.zip`;
};

const loadNewsletterCalendar = unstable_cache(
  async () => {
    const events = await new Promise<
      Awaited<ReturnType<typeof getUpcomingEvents>>
    >((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Kalender konnte nicht rechtzeitig geladen werden.")),
        CALENDAR_TIMEOUT_MS,
      );
      getUpcomingEvents().then(resolve, reject).finally(() => clearTimeout(timeout));
    });
    return events.map((event) => ({
      id: event.id,
      title: event.summary,
      start: event.start.toISOString(),
      end: event.end?.toISOString(),
      allDay: event.allDay,
      location: event.location ?? null,
      url: null,
    }));
  },
  ["admin-newsletter-calendar-v1"],
  { revalidate: 300 },
);

const getCalendar = async (calendarUrl: string): Promise<NewsletterCalendar> => ({
  events: await loadNewsletterCalendar(),
  daysAhead: 7,
  timeZone: TIME_ZONE,
  calendarUrl,
});

export const POST = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return unauthorized();
    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return forbidden();
    }

    const body = (await request.json().catch(() => ({}))) as NewsletterRequestBody;
    const requestedAction = textValue(body.action, 20);
    if (!NEWSLETTER_ACTIONS.includes(requestedAction as NewsletterAction)) {
      return NextResponse.json(
        { error: "Unbekannte Newsletter-Aktion." },
        { status: 400 },
      );
    }
    const action = requestedAction as NewsletterAction;

    if (
      body.sendAt ||
      body.send_at ||
      body.status === "scheduled" ||
      body.status === "sent"
    ) {
      return NextResponse.json(
        {
          error:
            "Versand und Terminierung sind deaktiviert. Hier kann nur ein Entwurf angelegt werden.",
        },
        { status: 400 },
      );
    }

    const title = textValue(body.title, 240);
    const subject = textValue(body.subject, 240) || title;
    const intro = textValue(body.intro, 5_000);
    if (!title) {
      return NextResponse.json({ error: "Der Newsletter-Titel fehlt." }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ error: "Die Betreffzeile fehlt." }, { status: 400 });
    }

    const rawItems = normalizeRawItems(body);
    const projectItems = rawItems.filter(
      (item): item is RawProjectItem => item.type === "project",
    );
    if (projectItems.length === 0) {
      return NextResponse.json(
        { error: "Wähle mindestens ein Projekt aus." },
        { status: 400 },
      );
    }
    if (projectItems.length > MAX_PROJECTS) {
      return NextResponse.json(
        { error: `Es können höchstens ${MAX_PROJECTS} Projekte verwendet werden.` },
        { status: 400 },
      );
    }

    const adminSupabase = createSupabaseAdminClient();
    const { data: projectRows, error: projectError } = await adminSupabase
      .from("resources")
      .select(
        "id, pretty_title, name, description, image, images, publish_date, updated_at, created_at, type",
      )
      .in(
        "id",
        projectItems.map((item) => item.projectId),
      )
      .ilike("type", "project");

    if (projectError) throw projectError;
    const rowById = new Map(
      ((projectRows ?? []) as ProjectRow[]).map((row) => [row.id, row]),
    );
    if (rowById.size !== projectItems.length) {
      return NextResponse.json(
        { error: "Mindestens ein ausgewähltes Projekt ist nicht mehr verfügbar." },
        { status: 400 },
      );
    }

    const locale =
      typeof body.locale === "string"
        ? normalizeLocale(body.locale)
        : DEFAULT_LOCALE;
    const baseUrl = getPublicSiteUrl(request);
    const projects: NewsletterProject[] = projectItems.map((item) => {
      const row = rowById.get(item.projectId)!;
      const aspect = NEWSLETTER_ASPECTS.includes(
        String(item.aspect) as NewsletterAspect,
      )
        ? normalizeNewsletterAspect(item.aspect)
        : "original";
      const href = new URL(
        localizePathname(
          buildProjectPath({
            id: row.id,
            prettyTitle: row.pretty_title ?? null,
          }),
          locale,
        ),
        baseUrl,
      ).toString();

      return {
        id: row.id,
        title: row.name,
        description: createExcerpt(row.description),
        date:
          row.publish_date ?? row.updated_at ?? row.created_at ?? "",
        url: href,
        imageUrl: resolveProjectImage(row, item.imageUrl, aspect),
        layout: normalizeNewsletterLayout(item.layout),
        aspect,
        showLink: item.showLink !== false,
        linkText: textValue(item.linkText, 80) || "Weiterlesen",
      };
    });

    const items: NewsletterItem[] = rawItems.map((item) => {
      if (item.type === "project") {
        return { type: "project", projectId: item.projectId };
      }
      if (item.type === "button") {
        return {
          type: "button",
          title: textValue(item.title, 80),
          href: textValue(item.href, 2_000),
        };
      }
      return {
        type: "banner",
        title: textValue(item.title, 100),
        content: textValue(item.content, 1_000),
      };
    });

    const html = renderNewsletter({
      projects,
      items,
      title,
      subject,
      intro,
      baseUrl,
      calendar: await getCalendar(
        new URL(localizePathname("/calendar", locale), baseUrl).toString(),
      ),
      showProjectsHeading: body.showProjectsHeading !== false,
      membershipUrl:
        process.env.NEWSLETTER_MEMBERSHIP_URL ??
        "https://konglomerat.org/der-verein/mitglied-werden",
      webviewHref:
        process.env.NEWSLETTER_WEBVIEW_PLACEHOLDER ?? "{WEBVIEW_LINK}",
      unsubscribeHref:
        process.env.NEWSLETTER_UNSUBSCRIBE_PLACEHOLDER ??
        "{UNSUBSCRIBE_LINK}",
    });

    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return NextResponse.json(
        {
          error:
            "Der Newsletter ist zu groß für eine zuverlässige E-Mail-Zustellung. Kürze die Auswahl oder die freien Textblöcke.",
        },
        { status: 400 },
      );
    }

    if (action === "preview") {
      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const zip = createHtmlZip(html);
    if (action === "export") {
      return new NextResponse(new Uint8Array(zip), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${createFilename(title)}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const fromName = textValue(body.fromName, 160);
    const fromEmail = textValue(body.fromEmail, 320);
    const recipientListId = Number(body.recipientListId);
    if (!fromName) {
      return NextResponse.json({ error: "Der Absendername fehlt." }, { status: 400 });
    }
    if (!fromEmail || !/^\S+@\S+\.\S+$/.test(fromEmail)) {
      return NextResponse.json(
        { error: "Die Absender-E-Mail ist ungültig." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(recipientListId) || recipientListId <= 0) {
      return NextResponse.json(
        { error: "Die Empfängerliste fehlt." },
        { status: 400 },
      );
    }

    const mailing = await createRapidmailDraft({
      fromName,
      fromEmail,
      subject,
      title,
      recipientListId,
      zip,
    });

    return NextResponse.json({
      ok: true,
      mailing,
      counts: { projects: projects.length },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Newsletter konnte nicht erzeugt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
