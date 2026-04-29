import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  DEFAULT_LOCALE,
  normalizeLocale,
  localizePathname,
} from "@/i18n/config";
import { createRapidmailDraft } from "@/lib/rapidmail";
import { buildProjectPath } from "@/lib/project-path";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { getSupabaseRenderedImageUrl, isImageUrl } from "@/lib/resource-media";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type ContentRow = {
  id: string;
  pretty_title?: string | null;
  name: string;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  updated_at?: string | null;
};

type DraftRequestBody = {
  fromName?: unknown;
  fromEmail?: unknown;
  subject?: unknown;
  recipientListId?: unknown;
  resourceIds?: unknown;
  projectIds?: unknown;
  locale?: unknown;
};

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const stripMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[>#*_~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeIdList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean),
    ),
  );
};

const resolveImageUrl = (row: ContentRow) => {
  const firstImage = row.images?.find(
    (entry): entry is string => typeof entry === "string" && Boolean(entry),
  );
  const candidate = firstImage ?? row.image ?? null;

  if (!candidate || !isImageUrl(candidate)) {
    return null;
  }

  return getSupabaseRenderedImageUrl(candidate, {
    width: 1200,
    resize: "cover",
  });
};

const createCardMarkup = ({
  href,
  imageUrl,
  kicker,
  title,
  description,
  cta,
}: {
  href: string;
  imageUrl: string | null;
  kicker: string;
  title: string;
  description: string;
  cta: string;
}) => `
  <tr>
    <td style="padding:0 0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e4e4e7;border-radius:20px;overflow:hidden;background:#ffffff;">
        ${
          imageUrl
            ? `<tr>
          <td style="padding:0;">
            <a href="${escapeHtml(href)}" style="display:block;">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto;border:0;aspect-ratio:16/9;object-fit:cover;background:#f4f4f5;" />
            </a>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:24px;">
            <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;margin-bottom:10px;">${escapeHtml(
              kicker,
            )}</div>
            <h2 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:24px;line-height:1.2;color:#18181b;">
              <a href="${escapeHtml(href)}" style="color:#18181b;text-decoration:none;">${escapeHtml(
                title,
              )}</a>
            </h2>
            <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#52525b;">${escapeHtml(
              description,
            )}</p>
            <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#2563eb;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(
              cta,
            )}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

const createNewsletterHtml = ({
  siteUrl,
  locale,
  subject,
  resources,
  projects,
}: {
  siteUrl: string;
  locale: string;
  subject: string;
  resources: ContentRow[];
  projects: ContentRow[];
}) => {
  const resourceCards = resources
    .map((resource) => {
      const href = new URL(
        localizePathname(
          buildResourcePath({
            id: resource.id,
            prettyTitle: resource.pretty_title ?? null,
          }),
          locale === DEFAULT_LOCALE ? DEFAULT_LOCALE : normalizeLocale(locale),
        ),
        siteUrl,
      ).toString();
      const description = truncate(
        stripMarkdown(
          resource.description ?? "Noch keine Beschreibung hinterlegt.",
        ),
        220,
      );

      return createCardMarkup({
        href,
        imageUrl: resolveImageUrl(resource),
        kicker: "Ressource",
        title: resource.name,
        description,
        cta: "Zur Ressource",
      });
    })
    .join("");

  const projectCards = projects
    .map((project) => {
      const href = new URL(
        localizePathname(
          buildProjectPath({
            id: project.id,
            prettyTitle: project.pretty_title ?? null,
          }),
          locale === DEFAULT_LOCALE ? DEFAULT_LOCALE : normalizeLocale(locale),
        ),
        siteUrl,
      ).toString();
      const description = truncate(
        stripMarkdown(
          project.description ?? "Noch keine Beschreibung hinterlegt.",
        ),
        220,
      );

      return createCardMarkup({
        href,
        imageUrl: resolveImageUrl(project),
        kicker: "Projekt",
        title: project.name,
        description,
        cta: "Zum Projekt",
      });
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(normalizeLocale(locale))}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f5f7fb;">
      <tr>
        <td style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:720px;margin:0 auto;background:#ffffff;border-radius:28px;overflow:hidden;">
            <tr>
              <td style="padding:40px 32px 24px;background:linear-gradient(135deg,#eff6ff 0%,#fef3c7 100%);">
                <div style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#334155;margin-bottom:12px;">Konglomerat Digitale Werkstaetten</div>
                <h1 style="margin:0;font-family:Arial,sans-serif;font-size:34px;line-height:1.1;color:#111827;">${escapeHtml(
                  subject,
                )}</h1>
                <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#334155;">Eine neue Auswahl aus Ressourcen und Projekten aus den Werkstaetten.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${
                  resourceCards
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 0 18px;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#18181b;">Ressourcen</td>
                  </tr>
                  ${resourceCards}
                </table>`
                    : ""
                }
                ${
                  projectCards
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;${resourceCards ? "margin-top:8px;" : ""}">
                  <tr>
                    <td style="padding:0 0 18px;font-family:Arial,sans-serif;font-size:22px;font-weight:700;color:#18181b;">Projekte</td>
                  </tr>
                  ${projectCards}
                </table>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 36px;border-top:1px solid #e4e4e7;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#71717a;">
                Mehr aus dem Konglomerat findest du auf <a href="${escapeHtml(
                  siteUrl,
                )}" style="color:#2563eb;text-decoration:none;">${escapeHtml(
                  siteUrl,
                )}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const POST = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return createUnauthorizedResponse();
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return createForbiddenResponse();
    }

    const body = (await request.json().catch(() => ({}))) as DraftRequestBody;
    const fromName =
      typeof body.fromName === "string" ? body.fromName.trim() : "";
    const fromEmail =
      typeof body.fromEmail === "string" ? body.fromEmail.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const recipientListId = Number(body.recipientListId);
    const locale =
      typeof body.locale === "string"
        ? normalizeLocale(body.locale)
        : DEFAULT_LOCALE;
    const resourceIds = normalizeIdList(body.resourceIds);
    const projectIds = normalizeIdList(body.projectIds);

    if (!fromName) {
      return NextResponse.json(
        { error: "Absendername fehlt." },
        { status: 400 },
      );
    }

    if (!fromEmail || !fromEmail.includes("@")) {
      return NextResponse.json(
        { error: "Absender-E-Mail ist ungueltig." },
        { status: 400 },
      );
    }

    if (!subject) {
      return NextResponse.json({ error: "Betreff fehlt." }, { status: 400 });
    }

    if (!Number.isInteger(recipientListId) || recipientListId <= 0) {
      return NextResponse.json(
        { error: "Empfaengerliste fehlt." },
        { status: 400 },
      );
    }

    if (resourceIds.length === 0 && projectIds.length === 0) {
      return NextResponse.json(
        { error: "Waehle mindestens eine Ressource oder ein Projekt aus." },
        { status: 400 },
      );
    }

    const adminSupabase = createSupabaseAdminClient();
    const [resourceResult, projectResult] = await Promise.all([
      resourceIds.length > 0
        ? adminSupabase
            .from("resources")
            .select(
              "id, pretty_title, name, description, image, images, updated_at, type",
            )
            .in("id", resourceIds)
            .not("type", "ilike", "project")
        : Promise.resolve({ data: [] as ContentRow[], error: null }),
      projectIds.length > 0
        ? adminSupabase
            .from("resources")
            .select(
              "id, pretty_title, name, description, image, images, updated_at, type",
            )
            .in("id", projectIds)
            .ilike("type", "project")
        : Promise.resolve({ data: [] as ContentRow[], error: null }),
    ]);

    if (resourceResult.error) {
      throw resourceResult.error;
    }

    if (projectResult.error) {
      throw projectResult.error;
    }

    const resourceMap = new Map(
      (resourceResult.data ?? []).map((entry) => [
        entry.id,
        entry as ContentRow,
      ]),
    );
    const projectMap = new Map(
      (projectResult.data ?? []).map((entry) => [
        entry.id,
        entry as ContentRow,
      ]),
    );

    const selectedResources = resourceIds
      .map((id) => resourceMap.get(id))
      .filter((entry): entry is ContentRow => Boolean(entry));
    const selectedProjects = projectIds
      .map((id) => projectMap.get(id))
      .filter((entry): entry is ContentRow => Boolean(entry));

    if (selectedResources.length === 0 && selectedProjects.length === 0) {
      return NextResponse.json(
        { error: "Die ausgewaehlten Inhalte konnten nicht geladen werden." },
        { status: 400 },
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      new URL(request.url).origin;

    const html = createNewsletterHtml({
      siteUrl,
      locale,
      subject,
      resources: selectedResources,
      projects: selectedProjects,
    });

    const mailing = await createRapidmailDraft({
      fromName,
      fromEmail,
      subject,
      title: subject,
      recipientListId,
      html,
    });

    return NextResponse.json({
      ok: true,
      mailing,
      counts: {
        resources: selectedResources.length,
        projects: selectedProjects.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Newsletter-Entwurf konnte nicht erstellt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
