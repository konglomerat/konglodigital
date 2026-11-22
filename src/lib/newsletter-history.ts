export type NewsletterIssue = {
  id: string; name: string; design: string; createdAt: string; updatedAt: string;
  content: Record<string, unknown>;
  output: { action: "export" | "draft"; sourceIds: string[]; mailingId?: number | null };
};

export function newsletterUsage(issues: NewsletterIssue[], design: string) {
  const matching = issues.filter(issue => issue.design === design)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const used = new Map<string, NewsletterIssue>();
  for (const issue of matching) {
    for (const id of issue.output.sourceIds ?? []) {
      if (!used.has(id)) used.set(id, issue);
    }
  }
  return { lastIssue: matching[0] ?? null, used };
}

export function isNewNewsletterSource(source: { kind: string; createdAt?: string | null; publishDate: string | null }, since?: string) {
  // An event's start date does not tell us when it was first published.
  if (!since || source.kind === "event") return false;
  const published = source.publishDate ?? source.createdAt;
  return Boolean(published && Date.parse(published) > Date.parse(since));
}
