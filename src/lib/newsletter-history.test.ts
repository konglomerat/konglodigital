import { describe, expect, it } from "vitest";
import { newsletterUsage, isNewNewsletterSource, type NewsletterIssue } from "./newsletter-history";
const issue = (id: string, date: string, design: string, ids: string[]): NewsletterIssue => ({ id, name: id, design, createdAt: date, updatedAt: date, content: {}, output: { action: "export", sourceIds: ids } });
describe("Newsletter usage", () => {
  it("retains older usage and selects the latest output within the same design", () => {
    const usage = newsletterUsage([
      issue("old", "2026-10-01", "konglomerat", ["old-source", "both"]),
      issue("other", "2026-12-01", "volkshaus-cotta", ["other-source"]),
      issue("new", "2026-11-01", "konglomerat", ["both"]),
    ], "konglomerat");
    expect(usage.lastIssue?.id).toBe("new");
    expect(usage.used.get("old-source")?.id).toBe("old");
    expect(usage.used.get("both")?.id).toBe("new");
    expect(usage.used.has("other-source")).toBe(false);
  });
  it("does not confuse future event dates or unknown dates with new publications", () => {
    expect(isNewNewsletterSource({ kind: "event", publishDate: "2026-12-01" }, "2026-11-01")).toBe(false);
    expect(isNewNewsletterSource({ kind: "project", publishDate: "2026-11-02" }, "2026-11-01")).toBe(true);
    expect(isNewNewsletterSource({ kind: "page", publishDate: null, createdAt: "2026-11-02" }, "2026-11-01")).toBe(true);
    expect(isNewNewsletterSource({ kind: "page", publishDate: null }, "2026-11-01")).toBe(false);
    expect(isNewNewsletterSource({ kind: "project", publishDate: "2026-11-02" })).toBe(false);
  });
});
