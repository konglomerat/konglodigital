import { describe, expect, it, vi } from "vitest";
import {
  buildCmsRedirectMap,
  createCmsRedirectLoader,
  resolveCmsRedirect,
} from "./cms-redirects";

const custom = (from: string, url: string) => ({
  from,
  to: { type: "custom", url },
});
const origin = "https://digital.konglomerat.org";

describe("CMS redirect resolution", () => {
  it("maps old news and English paths exactly, preserving query values with destination precedence", () => {
    const rules = buildCmsRedirectMap([
      custom("/aktuelles", "/showcase?ansicht=archiv"),
      custom(
        "/en/aktuelles/2024-1/article",
        "/en/showcase/archiv-2024-article",
      ),
    ]);
    expect(
      resolveCmsRedirect(
        new URL(`${origin}/aktuelles?ansicht=grid&tag=a&tag=b`),
        rules,
      )?.href,
    ).toBe(`${origin}/showcase?ansicht=archiv&tag=a&tag=b`);
    expect(
      resolveCmsRedirect(
        new URL(`${origin}/en/aktuelles/2024-1/article`),
        rules,
      )?.pathname,
    ).toBe("/en/showcase/archiv-2024-article");
    expect(
      resolveCmsRedirect(new URL(`${origin}/aktuelles/unmapped`), rules),
    ).toBeNull();
  });

  it("resolves populated page/post references using website routes and the source locale", () => {
    const rules = buildCmsRedirectMap([
      {
        from: "/holz",
        to: {
          type: "reference",
          reference: {
            relationTo: "pages",
            value: { slug: "werkbereich-holz" },
          },
        },
      },
      {
        from: "/en/news",
        to: {
          type: "reference",
          reference: { relationTo: "posts", value: { slug: "article" } },
        },
      },
      {
        from: "/hidden",
        to: {
          type: "reference",
          reference: { relationTo: "posts", value: 123 },
        },
      },
    ]);
    expect(rules.get("/holz")).toBe("/werkbereiche/holz");
    expect(rules.get("/en/news")).toBe("/en/showcase/article");
    expect(rules.has("/hidden")).toBe(false);
  });

  it("collapses chains and rejects self redirects and cycles", () => {
    const rules = buildCmsRedirectMap([
      custom("/a", "/b"),
      custom("/b", "/c#section"),
      custom("/loop", "/loop"),
      custom("/x", "/y"),
      custom("/y", "/x"),
    ]);
    expect(resolveCmsRedirect(new URL(`${origin}/a`), rules)?.href).toBe(
      `${origin}/c#section`,
    );
    for (const path of ["/loop", "/x", "/y"])
      expect(resolveCmsRedirect(new URL(origin + path), rules)).toBeNull();
  });

  it("allows explicitly configured HTTPS targets but ignores unsafe URLs", () => {
    const rules = buildCmsRedirectMap([
      custom("/external", "https://example.org/target"),
      ...[
        "javascript:alert(1)",
        "//example.org",
        "/\\example.org",
        "https://user:pass@example.org",
        "/foo\nbar",
      ].map((url, i) => custom(`/bad${i}`, url)),
    ]);
    expect(rules.size).toBe(1);
    expect(resolveCmsRedirect(new URL(`${origin}/external`), rules)?.href).toBe(
      "https://example.org/target",
    );
  });
});

describe("CMS redirect loading", () => {
  it("loads every page, deduplicates concurrent reads, and refreshes changed/deleted entries after 60 seconds", async () => {
    let time = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ docs: [custom("/a", "/b")], hasNextPage: true }),
      )
      .mockResolvedValueOnce(
        Response.json({ docs: [custom("/c", "/d")], hasNextPage: false }),
      )
      .mockResolvedValueOnce(
        Response.json({ docs: [custom("/a", "/new")], hasNextPage: false }),
      );
    const load = createCmsRedirectLoader(fetcher, () => time);
    const [first, concurrent] = await Promise.all([load(origin), load(origin)]);
    expect(first).toBe(concurrent);
    expect(first.size).toBe(2);
    expect(
      new URL(String(fetcher.mock.calls[1][0])).searchParams.get("page"),
    ).toBe("2");
    time = 59_999;
    expect(await load(origin)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    time = 60_001;
    const updated = await load(origin);
    expect(updated.get("/a")).toBe("/new");
    expect(updated.has("/c")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("fails open with a short retry delay on failures and malformed responses", async () => {
    let time = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(Response.json({ error: "invalid" }))
      .mockResolvedValueOnce(Response.json({ docs: [custom("/a", "/b")] }));
    const load = createCmsRedirectLoader(fetcher, () => time);
    expect((await load(origin)).size).toBe(0);
    await load(origin);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 10_001;
    expect((await load(origin)).size).toBe(0);
    time = 20_002;
    expect((await load(origin)).get("/a")).toBe("/b");
    expect((await load("")).size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
