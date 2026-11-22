import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { loadCmsRedirects } from "./cms-redirects";

vi.mock("./cms-redirects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cms-redirects")>()),
  loadCmsRedirects: vi.fn(
    async () =>
      new Map([
        ["/aktuelles", "/showcase?ansicht=archiv"],
        ["/en/old", "/en/showcase/article"],
      ]),
  ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("CMS redirects in the actual middleware", () => {
  it("returns a permanent redirect without allowing browser cache to hide CMS updates", async () => {
    const response = await middleware(
      new NextRequest(
        "https://digital.konglomerat.org/aktuelles?utm_source=test",
      ),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://digital.konglomerat.org/showcase?ansicht=archiv&utm_source=test",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps the English path", async () => {
    const response = await middleware(
      new NextRequest("https://digital.konglomerat.org/en/old"),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://digital.konglomerat.org/en/showcase/article",
    );
  });

  it("does not load redirect rules for submissions, API/static files, protected pages or authentication", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    for (const path of [
      "/api/posts",
      "/api",
      "/auth/callback",
      "/en/login",
      "/password-reset",
      "/register",
      "/registration",
      "/oauth/consent",
      "/admin",
      "/account",
      "/_next/test.js",
      "/image.png",
    ]) {
      await middleware(
        new NextRequest("https://digital.konglomerat.org" + path),
      );
    }
    await middleware(
      new NextRequest("https://digital.konglomerat.org/aktuelles", {
        method: "POST",
      }),
    );
    expect(loadCmsRedirects).not.toHaveBeenCalled();
  });
});
