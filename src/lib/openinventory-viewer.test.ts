import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: () => ({ supabase: { auth: { getUser: mocks.getUser } } }) }));
import { hasInventoryViewer } from "./openinventory-viewer";
const request = (session?: string) => new NextRequest("https://digital.konglomerat.org/api/openinventory/resources", { headers: session ? { Cookie: `sb-supabase-auth-token=${session}` } : {} });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("inventory viewer authentication", () => {
  it("rejects anonymous access without contacting the auth service", async () => {
    expect(await hasInventoryViewer(request())).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("coalesces concurrent images and reuses a successful session check", async () => {
    let resolve!: (value: unknown) => void;
    mocks.getUser.mockImplementation(() => new Promise(done => { resolve = done; }));
    const pending = Array.from({ length: 30 }, () => hasInventoryViewer(request("gallery")));
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
    resolve({ data: { user: { id: "one" } }, error: null });
    expect((await Promise.all(pending)).every(Boolean)).toBe(true);
    expect(await hasInventoryViewer(request("gallery"))).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
  it("never shares a check between different sessions or retains a failed check", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "two" } }, error: null }).mockResolvedValue({ data: { user: null }, error: { message: "revoked" } });
    expect(await hasInventoryViewer(request("valid-session"))).toBe(true);
    expect(await hasInventoryViewer(request("other-session"))).toBe(false);
    expect(await hasInventoryViewer(request("other-session"))).toBe(false);
    expect(mocks.getUser).toHaveBeenCalledTimes(3);
  });
  it("rechecks expired authentication and drops rejected network requests", async () => {
    vi.useFakeTimers();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "three" } }, error: null });
    expect(await hasInventoryViewer(request("expiring"))).toBe(true);
    vi.advanceTimersByTime(15001);
    mocks.getUser.mockRejectedValueOnce(new Error("offline"));
    await expect(hasInventoryViewer(request("expiring"))).rejects.toThrow("offline");
    expect(await hasInventoryViewer(request("expiring"))).toBe(true);
    expect(mocks.getUser).toHaveBeenCalledTimes(3);
  });
});
