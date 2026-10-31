import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resource: vi.fn(), fetch: vi.fn(), viewer: vi.fn() }));
vi.mock("@/lib/openinventory", () => ({ inventoryRawResource: mocks.resource, inventoryFetch: mocks.fetch, InventoryApiError: class extends Error {} }));
vi.mock("@/lib/openinventory-viewer", () => ({ hasInventoryViewer: mocks.viewer }));
import { GET } from "./route";
const resourceId = "00000000-0000-4000-8000-000000000001";
const mediaId = "00000000-0000-4000-8000-000000000002";
const params = { resourceId, mediaId, filename: "video.mp4" };
const item = { id: mediaId, resourceId, kind: "video", mimeType: "video/mp4", url: "/api/files/video.mp4" };
const request = (suffix = "", headers = {}) => new NextRequest(`https://digital.konglomerat.org/api/openinventory/media/${resourceId}/${mediaId}/video.mp4${suffix}`, { headers });
beforeEach(() => { vi.clearAllMocks(); mocks.viewer.mockResolvedValue(true); mocks.resource.mockResolvedValue({ media: [item] }); mocks.fetch.mockResolvedValue(new Response("abcd", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-3/99", "set-cookie": "secret=hidden" } })); });
describe("authenticated media proxy", () => {
  it("rejects anonymous access before fetching inventory data", async () => {
    mocks.viewer.mockResolvedValue(false);
    expect((await GET(request(), { params: Promise.resolve(params) })).status).toBe(401);
    expect(mocks.resource).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("streams Range responses and only safe response headers", async () => {
    const result = await GET(request("", { Range: "bytes=0-3" }), { params: Promise.resolve(params) });
    expect(result.status).toBe(206);
    expect(await result.text()).toBe("abcd");
    expect(mocks.fetch).toHaveBeenCalledWith("/api/files/video.mp4", { Range: "bytes=0-3" });
    expect(result.headers.get("content-range")).toBe("bytes 0-3/99");
    expect(result.headers.get("set-cookie")).toBeNull();
  });
  it.each(["https://evil.example/steal", "/api/files/../tokens", "/api/files/%2e%2e/tokens", "/api/files/a?token=secret"])("rejects unsafe upstream path %s", async url => {
    mocks.resource.mockResolvedValue({ media: [{ ...item, url }] });
    expect((await GET(request(), { params: Promise.resolve(params) })).status).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects foreign media and invalid IDs before fetching any file", async () => {
    mocks.resource.mockResolvedValue({ media: [{ ...item, resourceId: mediaId }] });
    expect((await GET(request(), { params: Promise.resolve(params) })).status).toBe(404);
    expect((await GET(request(), { params: Promise.resolve({ ...params, resourceId: "../tokens" }) })).status).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects active content and unbounded image transformations", async () => {
    mocks.resource.mockResolvedValue({ media: [{ ...item, mimeType: "text/html" }] });
    expect((await GET(request(), { params: Promise.resolve(params) })).status).toBe(404);
    mocks.resource.mockResolvedValue({ media: [item] });
    expect((await GET(request("?w=999999"), { params: Promise.resolve(params) })).status).toBe(400);
  });
});
