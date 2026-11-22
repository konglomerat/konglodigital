import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ responses: [] as Array<{ data: unknown; error: unknown }>, queries: [] as Array<Record<string, ReturnType<typeof vi.fn>>>, can: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } } }) }));
vi.mock("@/lib/access/server", () => ({ loadUserAccess: async () => ({}) }));
vi.mock("@/lib/access/access", () => ({ can: mocks.can }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: () => {
  const result = mocks.responses.shift() ?? { data: null, error: null };
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "order", "range", "insert", "update"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve));
  mocks.queries.push(query);
  return query;
} }) }));
import { GET, POST } from "./route";
const old = { id: "draft-1", created_by: "owner", name: "Ausgabe", design: "konglomerat", content: { version: 2, title: "Alt" }, created_at: "2026-11-01T10:00:00.000Z", updated_at: "2026-11-01T10:00:00.000Z" };
const post = (body: Record<string, unknown>) => POST(new NextRequest("https://example.org/api/admin/newsletter-drafts", { method: "POST", body: JSON.stringify({ name: "Ausgabe", design: "konglomerat", content: { version: 2, title: "Neu" }, ...body }) }));
const result = (data: unknown, error: unknown = null) => ({ data, error });

describe("Newsletter draft persistence", () => {
  beforeEach(() => { mocks.responses.length = 0; mocks.queries.length = 0; mocks.can.mockReturnValue(true); });
  it("saves a revision and uses an atomic version check for updates", async () => {
    mocks.responses.push(result(old), result({ ...old, content: { title: "Neu" }, updated_at: "2026-11-02T00:00:00Z" }));
    const response = await post({ id: old.id, expectedUpdatedAt: old.updated_at });
    expect(response.status).toBe(200);
    expect(mocks.queries[0].eq).toHaveBeenCalledWith("created_by", "owner");
    expect(mocks.queries[1].eq).toHaveBeenCalledWith("updated_at", old.updated_at);
    expect(mocks.queries[1].update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.objectContaining({ _revisions: [expect.objectContaining({ content: old.content })] }) }));
  });
  it("rejects stale tabs without writing", async () => {
    mocks.responses.push(result(old));
    const response = await post({ id: old.id, expectedUpdatedAt: "2026-10-01T00:00:00Z" });
    expect(response.status).toBe(409);
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0].update).not.toHaveBeenCalled();
  });
  it("handles a simultaneous write between the read and update", async () => {
    mocks.responses.push(result(old), result(null));
    expect((await post({ id: old.id, expectedUpdatedAt: old.updated_at })).status).toBe(409);
  });
  it("retries creation with the same ID without inserting a duplicate", async () => {
    mocks.responses.push(result(null, { code: "23505" }), result({ ...old, content: { title: "Neu", version: 2 } }));
    expect((await post({ id: old.id, create: true })).status).toBe(200);
    expect(mocks.queries[0].insert).toHaveBeenCalledWith(expect.objectContaining({ id: old.id, created_by: "owner" }));
  });
  it("prevents editing archived output snapshots or forging internal metadata", async () => {
    mocks.responses.push(result({ ...old, content: { _kind: "issue" } }));
    expect((await post({ id: old.id, expectedUpdatedAt: old.updated_at })).status).toBe(404);
    mocks.responses.push(result(old));
    expect((await post({ create: true, content: { title: "Okay", _kind: "issue", _revisions: ["fake"] } })).status).toBe(201);
    expect(mocks.queries[1].insert).toHaveBeenCalledWith(expect.objectContaining({ content: { title: "Okay" } }));
  });
  it("separates output history from editable drafts and exposes restore points", async () => {
    const revision = { name: "Vorher", content: { title: "Vorher" } };
    mocks.responses.push(result([{ ...old, content: { ...old.content, _revisions: [revision] } }, { ...old, id: "issue", content: { title: "Export", _kind: "issue", _output: { action: "export", sourceIds: ["one"] } } }]));
    const response = await GET(new NextRequest("https://example.org/api/admin/newsletter-drafts"));
    const data = await response.json();
    expect(data.drafts).toHaveLength(1);
    expect(data.drafts[0].revisions).toEqual([revision]);
    expect(data.drafts[0].content._revisions).toBeUndefined();
    expect(data.issues[0].output.sourceIds).toEqual(["one"]);
  });
  it("rejects unauthorized access", async () => {
    mocks.can.mockReturnValue(false);
    expect((await post({})).status).toBe(403);
    expect(mocks.queries).toHaveLength(0);
  });
});
