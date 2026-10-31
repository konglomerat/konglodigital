import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/openinventory-viewer", () => ({ hasInventoryViewer: mocks.viewer }));
vi.mock("@/lib/openinventory", () => ({ listInventory: mocks.list }));
import { GET } from "./route";
const request = (query = "") => new NextRequest(`https://digital.konglomerat.org/api/openinventory/resources${query}`);
beforeEach(() => { vi.clearAllMocks(); mocks.viewer.mockResolvedValue(true); mocks.list.mockResolvedValue({ resources: [{ id: "one" }], count: 596, errorMessage: null }); });
describe("inventory list API", () => {
  it("requires Konglodigital authentication", async () => {
    mocks.viewer.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("forwards pagination and filters, without caching member data publicly", async () => {
    const response = await GET(request("?offset=100&limit=100&q=Bohrer&type=object"));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ offset: 100, limit: 100, query: "Bohrer", type: "object" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).count).toBe(596);
  });
  it("preserves the showcase editor's 1500-item inventory selector", async () => {
    expect((await GET(request("?limit=1500&offset=0"))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({ offset: 0, limit: 1500, query: "", type: "" });
  });
  it.each(["?limit=1501", "?offset=-1", "?limit=NaN", "?offset=1.5"])("rejects invalid pagination %s", async query => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("fails closed without leaking upstream error details or using the old database", async () => {
    mocks.list.mockRejectedValue(new Error("Authorization: secret"));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  });
});
