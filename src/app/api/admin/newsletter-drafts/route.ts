import { isDeepStrictEqual } from "node:util";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

import { DRAFT_COLUMNS, publicDraftContent, serializeNewsletterDraft as serializeDraft, type NewsletterDraftRow } from "@/lib/newsletter-draft-records";

export const runtime = "nodejs";

const NEWSLETTER_DESIGNS = ["konglomerat", "volkshaus-cotta"] as const;
type NewsletterDesign = (typeof NEWSLETTER_DESIGNS)[number];

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const normalizeDesign = (value: unknown): NewsletterDesign =>
  NEWSLETTER_DESIGNS.includes(value as NewsletterDesign)
    ? (value as NewsletterDesign)
    : "konglomerat";

const normalizeName = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 160) : "";

const normalizeContent = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 120_000) {
    return null;
  }

  return publicDraftContent(JSON.parse(serialized) as Record<string, unknown>);
};

const requireNewsletterAccess = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return { response: unauthorized(), userId: null };
  }
  if (!can(await loadUserAccess(supabase, data.user), "newsletter.manage")) {
    return { response: forbidden(), userId: null };
  }

  return { response: null, userId: data.user.id };
};

export const GET = async (request: NextRequest) => {
  try {
    const auth = await requireNewsletterAccess(request);
    if (auth.response) return auth.response;
    if (!auth.userId) return unauthorized();

    const supabase = createSupabaseAdminClient();
    const rows: NewsletterDraftRow[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.from("newsletter_drafts")
        .select(DRAFT_COLUMNS).eq("created_by", auth.userId)
        .order("updated_at", { ascending: false }).order("id").range(offset, offset + 99);
      if (error) throw error;
      rows.push(...(data ?? []) as NewsletterDraftRow[]);
      if (!data || data.length < 100) break;
    }
    return NextResponse.json({
      drafts: rows.filter(row => row.content?._kind !== "issue").map(serializeDraft),
      issues: rows.filter(row => row.content?._kind === "issue").map(row => ({
        ...serializeDraft(row), output: row.content._output,
      })),
    }, { headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Newsletter-Entwürfe konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const auth = await requireNewsletterAccess(request);
    if (auth.response) return auth.response;
    if (!auth.userId) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      name?: unknown;
      design?: unknown;
      content?: unknown;
      expectedUpdatedAt?: unknown;
      create?: unknown;
    };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = normalizeName(body.name);
    const design = normalizeDesign(body.design);
    const content = normalizeContent(body.content);

    if (!name) {
      return NextResponse.json(
        { error: "Der Entwurfsname fehlt." },
        { status: 400 },
      );
    }
    if (!content) {
      return NextResponse.json(
        { error: "Der Entwurf ist ungültig oder zu groß." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date().toISOString();

    if (id && body.create !== true) {
      const { data: previous, error: readError } = await supabase.from("newsletter_drafts")
        .select(DRAFT_COLUMNS).eq("id", id).eq("created_by", auth.userId).maybeSingle();
      if (readError) throw readError;
      if (!previous || previous.content?._kind === "issue") {
        return NextResponse.json({ error: "Der Newsletter-Entwurf wurde nicht gefunden." }, { status: 404 });
      }
      if (typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt !== previous.updated_at) {
        return NextResponse.json({ error: "Dieser Entwurf wurde inzwischen an anderer Stelle geändert. Lade den Serverstand oder sichere deine Änderungen als Kopie.", conflict: true }, { status: 409 });
      }
      const revisions = [
        { name: previous.name, design: previous.design, content: publicDraftContent(previous.content), updatedAt: previous.updated_at },
        ...(Array.isArray(previous.content._revisions) ? previous.content._revisions : []),
      ].slice(0, 10);
      const updatedAt = new Date(Math.max(Date.now(), new Date(previous.updated_at).getTime() + 1)).toISOString();
      const { data, error } = await supabase.from("newsletter_drafts")
        .update({ name, design, content: { ...content, _revisions: revisions }, updated_at: updatedAt })
        .eq("id", id).eq("created_by", auth.userId).eq("updated_at", body.expectedUpdatedAt)
        .select(DRAFT_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Der Entwurf wurde gleichzeitig geändert. Bitte lade den Serverstand oder sichere eine Kopie.", conflict: true }, { status: 409 });
      return NextResponse.json({ draft: serializeDraft(data as NewsletterDraftRow) });
    }

    const { data, error } = await supabase
      .from("newsletter_drafts")
      .insert({
        ...(id ? { id } : {}),
        created_by: auth.userId,
        name,
        design,
        content,
        updated_at: now,
      })
      .select("id, created_by, name, design, content, created_at, updated_at")
      .single();

    if (error?.code === "23505" && id && body.create === true) {
      const { data: existing } = await supabase.from("newsletter_drafts").select(DRAFT_COLUMNS)
        .eq("id", id).eq("created_by", auth.userId).maybeSingle();
      if (existing && existing.content?._kind !== "issue" && existing.name === name && existing.design === design && isDeepStrictEqual(publicDraftContent(existing.content), content)) {
        return NextResponse.json({ draft: serializeDraft(existing as NewsletterDraftRow) });
      }
      return NextResponse.json({ error: "Dieser Entwurf existiert bereits. Lade den Serverstand oder sichere eine Kopie.", conflict: true }, { status: 409 });
    }
    if (error) throw error;

    return NextResponse.json(
      { draft: serializeDraft(data as NewsletterDraftRow) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Newsletter-Entwurf konnte nicht gespeichert werden.",
      },
      { status: 500 },
    );
  }
};
