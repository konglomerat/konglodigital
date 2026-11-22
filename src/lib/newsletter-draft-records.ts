import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type NewsletterDraftRow = {
  id: string; created_by: string; name: string; design: string;
  content: Record<string, unknown>; created_at: string; updated_at: string;
};
export const DRAFT_COLUMNS = "id, created_by, name, design, content, created_at, updated_at";

export function publicDraftContent(content: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(content).filter(([key]) => !key.startsWith("_")));
}

export function serializeNewsletterDraft(row: NewsletterDraftRow) {
  return {
    id: row.id, name: row.name, design: row.design, content: publicDraftContent(row.content ?? {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    revisions: Array.isArray(row.content?._revisions) ? row.content._revisions : [],
  };
}

/** Immutable output snapshots share the existing, user-owned draft storage. */
export async function recordNewsletterIssue(userId: string, issue: {
  name: string; design: string; action: "export" | "draft";
  content: Record<string, unknown>; sourceIds: string[]; mailingId?: number | null;
}) {
  const { error } = await createSupabaseAdminClient().from("newsletter_drafts").insert({
    created_by: userId, name: issue.name, design: issue.design,
    content: { ...publicDraftContent(issue.content), _kind: "issue", _output: {
      action: issue.action, sourceIds: issue.sourceIds, mailingId: issue.mailingId ?? null,
    } },
  });
  if (error) throw error;
}
