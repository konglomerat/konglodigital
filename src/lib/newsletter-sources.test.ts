import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ posts: vi.fn(), post: vi.fn(), events: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/[lang]/showcase/showcase-data", () => ({ loadAllShowcases: mocks.posts, loadShowcaseByIdentifier: mocks.post }));
vi.mock("@/app/[lang]/calendar/calendar-data", () => ({ getUpcomingEvents: mocks.events }));
vi.mock("@/lib/payload-cms", () => ({ getPayloadCmsBaseUrl: () => "https://cms.example.org" }));
import { loadNewsletterLibrary, loadNewsletterSources } from "./newsletter-sources";

const page = { id: 3, slug: "werkbereich-holz", title: "Holz", _status: "published", layout: [{ columns: [{ richText: { root: { type: "paragraph", children: [{ type: "text", text: "Gemeinsam bauen" }] } } }] }] };
describe("Newsletter sources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.posts.mockResolvedValue([]);
    mocks.events.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ docs: [], hasNextPage: false })));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("loads posts beyond the previous 180 limit and classifies archive news", async () => {
    mocks.posts.mockResolvedValue(Array.from({ length: 181 }, (_, i) => ({ id: String(i), name: `Beitrag ${i}`, prettyTitle: `beitrag-${i}`, images: [], isLegacyNews: i === 180 })));
    const { entries } = await loadNewsletterLibrary();
    expect(entries).toHaveLength(181);
    expect(entries[180].kind).toBe("archive");
    expect(mocks.posts).toHaveBeenCalledWith();
  });
  it("paginates pages, excludes drafts, and resolves work-area routes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ docs: [page, { ...page, id: 4, _status: "draft" }], hasNextPage: true }))
      .mockResolvedValueOnce(Response.json({ docs: [{ ...page, id: 5, slug: "verein" }], hasNextPage: false }));
    const { entries } = await loadNewsletterLibrary();
    expect(entries.map(entry => entry.href)).toEqual(["/werkbereiche/holz", "/verein"]);
    expect(entries[0].kind).toBe("workshop");
    expect(entries[0].description).toBe("Gemeinsam bauen");
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("page=2");
  });
  it("keeps recurring events distinct and includes Berlin time and location", async () => {
    mocks.events.mockResolvedValue([0, 1].map(day => ({ id: "recurring", summary: "Offene Werkstatt", start: new Date(`2026-11-${23 + day}T18:00:00Z`), location: "Holzraum", allDay: false })));
    const { entries } = await loadNewsletterLibrary();
    expect(new Set(entries.map(entry => entry.id)).size).toBe(2);
    expect(entries[0].excerpt).toContain("19:00");
    expect(entries[0].excerpt).toContain("Holzraum");
    expect(mocks.events).toHaveBeenCalledWith(28);
  });
  it("reports failed sources while keeping usable contents", async () => {
    mocks.events.mockRejectedValue(new Error("offline"));
    vi.mocked(fetch).mockResolvedValue(Response.json({ docs: [page] }));
    const { entries, warnings } = await loadNewsletterLibrary();
    expect(entries).toHaveLength(1);
    expect(warnings).toEqual([expect.stringContaining("Termine")]);
  });
  it("reads the pages collection once when resolving multiple selections", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ docs: [page, { ...page, id: 4 }] }));
    const entries = await loadNewsletterSources(["page:3", "page:4", "page:missing"]);
    expect(entries.map(entry => entry?.id ?? null)).toEqual(["page:3", "page:4", null]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
