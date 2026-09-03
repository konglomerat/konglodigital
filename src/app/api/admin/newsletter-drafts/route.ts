import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const runtime = "nodejs";

const NEWSLETTER_DESIGNS = ["konglomerat", "volkshaus-cotta"] as const;
type NewsletterDesign = (typeof NEWSLETTER_DESIGNS)[number];

type NewsletterDraftRow = {
  id: string;
  created_by: string;
  name: string;
  design: NewsletterDesign;
  content: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

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

  return JSON.parse(serialized) as Record<string, unknown>;
};

const serializeDraft = (row: NewsletterDraftRow) => ({
  id: row.id,
  name: row.name,
  design: normalizeDesign(row.design),
  content: row.content ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requireAdmin = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return { response: unauthorized(), userId: null };
  }
  if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
    return { response: forbidden(), userId: null };
  }

  return { response: null, userId: data.user.id };
};

export const GET = async (request: NextRequest) => {
  try {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    if (!auth.userId) return unauthorized();

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("newsletter_drafts")
      .select("id, created_by, name, design, content, created_at, updated_at")
      .eq("created_by", auth.userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({
      drafts: ((data ?? []) as NewsletterDraftRow[]).map(serializeDraft),
    });
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
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    if (!auth.userId) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      name?: unknown;
      design?: unknown;
      content?: unknown;
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

    if (id) {
      const { data, error } = await supabase
        .from("newsletter_drafts")
        .update({ name, design, content, updated_at: now })
        .eq("id", id)
        .eq("created_by", auth.userId)
        .select("id, created_by, name, design, content, created_at, updated_at")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "Der Newsletter-Entwurf wurde nicht gefunden." },
          { status: 404 },
        );
      }

      return NextResponse.json({ draft: serializeDraft(data as NewsletterDraftRow) });
    }

    const { data, error } = await supabase
      .from("newsletter_drafts")
      .insert({
        created_by: auth.userId,
        name,
        design,
        content,
        updated_at: now,
      })
      .select("id, created_by, name, design, content, created_at, updated_at")
      .single();

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
