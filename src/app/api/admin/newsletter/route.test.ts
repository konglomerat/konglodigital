import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unzipSync, strFromU8 } from "fflate";

const mocks = vi.hoisted(() => ({ sources: vi.fn(), events: vi.fn(), draft: vi.fn(), archive: vi.fn(), can: vi.fn() }));
vi.mock("@/lib/newsletter-draft-records", () => ({ recordNewsletterIssue: mocks.archive }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: "editor" } } }) } } }) }));
vi.mock("@/lib/access/server", () => ({ loadUserAccess: async () => ({}) }));
vi.mock("@/lib/access/access", () => ({ can: mocks.can }));
vi.mock("@/lib/newsletter-sources", () => ({ loadNewsletterSources: mocks.sources }));
vi.mock("@/app/[lang]/calendar/calendar-data", () => ({ TIME_ZONE: "Europe/Berlin", getUpcomingEvents: mocks.events }));
vi.mock("@/lib/rapidmail", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/rapidmail")>(), createRapidmailDraft: mocks.draft }));
vi.mock("@/lib/newsletter-gif", () => ({ MAX_NEWSLETTER_GIF_FRAMES: 12, normalizeGifFrameDuration: () => 1000, createNewsletterGifAsset: vi.fn(), createNewsletterImageAsset: vi.fn() }));
import { POST } from "./route";

const request = (body: Record<string, unknown>) => POST(new NextRequest("https://digital.konglomerat.org/api/admin/newsletter", {
  method: "POST", body: JSON.stringify({ action: "preview", title: "Testausgabe", subject: "Testbetreff", intro: "Hallo zusammen", includeCalendar: false, items: [], ...body }),
}));

describe("Newsletter with mixed content and no required post", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.can.mockReturnValue(true);
    mocks.archive.mockResolvedValue(undefined);
    mocks.sources.mockResolvedValue([]);
    mocks.events.mockResolvedValue([]);
    mocks.draft.mockResolvedValue({ id: 42, status: "draft" });
  });
  it.each(["konglomerat", "volkshaus-cotta"])("renders free text and links without a calendar in %s", async design => {
    const response = await request({ design, items: [{ type: "banner", title: "Werkstattnachricht", content: "Unser freier Hinweis" }, { type: "button", title: "Anmelden", href: "https://example.org/anmeldung" }] });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Unser freier Hinweis");
    expect(html).toContain("https://example.org/anmeldung");
    expect(html).not.toContain("calendar-section");
    expect(html).not.toContain("keine öffentlichen Termine");
    expect(mocks.events).not.toHaveBeenCalled();
  });
  it("exports a ZIP containing a free-text-only newsletter", async () => {
    const response = await request({ action: "export", items: [{ type: "banner", content: "Nur ein Hinweis" }] });
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.values(files).map(bytes => strFromU8(bytes)).join("\n")).toContain("Nur ein Hinweis");
  });
  it("creates a Rapidmail draft without posts", async () => {
    const response = await request({ action: "draft", fromName: "Konglo", fromEmail: "test@example.org", recipientListId: 1, items: [{ type: "banner", content: "Hinweis" }] });
    expect(response.status).toBe(200);
    expect(mocks.draft).toHaveBeenCalledOnce();
    expect((await response.json()).counts.showcases).toBe(0);
  });
  it("renders a calendar-only newsletter and keeps old drafts' calendar default", async () => {
    mocks.events.mockResolvedValue([{ id: "e1", summary: "Offene Holzwerkstatt", start: new Date(), allDay: true }]);
    const response = await request({ intro: "", includeCalendar: undefined });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Offene Holzwerkstatt");
  });
  it("uses the public page URL for selected CMS pages", async () => {
    mocks.sources.mockResolvedValue([{ id: "page:3", name: "Holzwerkstatt", description: "Sägen und bauen", images: [], href: "/werkbereiche/holz", kind: "workshop" }]);
    const response = await request({ items: [{ type: "showcase", showcaseId: "page:3" }] });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Sägen und bauen");
    expect(html).toContain("/werkbereiche/holz");
    expect(html).not.toContain("/showcase/page");
  });
  it("rejects unpublished or unavailable selected sources", async () => {
    mocks.sources.mockResolvedValue([null]);
    expect((await request({ items: [{ type: "showcase", showcaseId: "page:3" }] })).status).toBe(400);
  });
  it("rejects oversized explicit excerpts instead of silently truncating them", async () => {
    const response = await request({ items: [{ type: "showcase", showcaseId: "one", excerpt: "x".repeat(521) }] });
    expect(response.status).toBe(400);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
  it("records output snapshots only for completed outputs, not previews", async () => {
    await request({});
    expect(mocks.archive).not.toHaveBeenCalled();
    await request({ action: "export", items: [{ type: "banner", content: "Snapshot" }], fromName: "Sender" });
    expect(mocks.archive).toHaveBeenCalledWith("editor", expect.objectContaining({ action: "export", sourceIds: [], content: expect.objectContaining({ fromName: "Sender" }) }));
  });
  it("reports a history failure without turning successful Rapidmail creation into a retryable failure", async () => {
    mocks.archive.mockRejectedValue(new Error("offline"));
    const response = await request({ action: "draft", fromName: "Konglo", fromEmail: "test@example.org", recipientListId: 1 });
    expect(response.status).toBe(200);
    expect((await response.json()).warning).toContain("Verlauf");
    expect(mocks.draft).toHaveBeenCalledOnce();
  });
  it("still enforces access and disallows sending", async () => {
    mocks.can.mockReturnValue(false);
    expect((await request({})).status).toBe(403);
    mocks.can.mockReturnValue(true);
    expect((await request({ status: "sent" })).status).toBe(400);
    expect(mocks.draft).not.toHaveBeenCalled();
  });
});
