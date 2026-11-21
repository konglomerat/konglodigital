import { generateKeyPairSync } from "node:crypto";

import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  uploadOpeninaryMedia: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/route", () => ({
  createSupabaseRouteClient: () => ({
    supabase: { auth: { getUser: mocks.getUser } },
  }),
}));
vi.mock("@/lib/openinary-server", () => ({
  uploadOpeninaryMedia: mocks.uploadOpeninaryMedia,
}));

import { POST } from "./route";

const member = { email: "mitglied@example.org" };

const fetchMock = vi.fn();

// Die App-Anmeldung prüft github.test.ts; hier zählen nur die Einträge.
const fetchWithAppLogin = async (url: string, init: RequestInit) =>
  url.endsWith("/access_tokens")
    ? Response.json({
        token: "installation-token",
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
    : fetchMock(url, init);

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const postFeedback = (fields: Record<string, string | File>) => {
  const body = new FormData();
  body.set("type", "bug");
  body.set("name", "Mika Muster");
  body.set("message", "Der Knopf klemmt");
  body.set("context", JSON.stringify({ path: "/de/receipts", language: "de" }));
  Object.entries(fields).forEach(([key, value]) => body.set(key, value));
  return POST(
    new NextRequest("http://localhost/api/feedback", { method: "POST", body }),
  );
};

const screenshotFile = async () => {
  const png = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#ff00aa" },
  })
    .png()
    .toBuffer();
  return new File([new Uint8Array(png)], "shot.png", { type: "image/png" });
};

const sentGithubBody = (call = 0) =>
  JSON.parse(String(fetchMock.mock.calls[call][1].body)) as Record<
    string,
    never
  >;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchWithAppLogin);
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "42");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);
  mocks.getUser.mockResolvedValue({ data: { user: member } });
  mocks.uploadOpeninaryMedia.mockResolvedValue({
    url: "https://media.test/t/feedback/a.jpg",
  });
  fetchMock.mockResolvedValue(
    Response.json({ html_url: "https://github.com/issue/1" }),
  );
});

describe("POST /api/feedback", () => {
  it("rejects guests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await postFeedback({});
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects feedback without a name", async () => {
    const response = await postFeedback({ name: "  " });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("publishes a bug with a shortened name and without the email", async () => {
    const response = await postFeedback({ screenshot: await screenshotFile() });

    expect(await response.json()).toEqual({
      url: "https://github.com/issue/1",
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/issues$/);

    const sent = JSON.stringify(sentGithubBody());
    expect(sent).toContain("https://media.test/t/feedback/a.jpg");
    expect(sent).toContain("Mika M.");
    expect(sent).not.toContain("Muster");
    expect(sent).not.toContain(member.email);
    expect(sent).toContain("<details>");
  });

  it("publishes an idea as a discussion in the ideas category", async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          data: {
            repository: { id: "repo", discussionCategory: { id: "ideas" } },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            createDiscussion: {
              discussion: { url: "https://github.com/discussion/2" },
            },
          },
        }),
      );

    const response = await postFeedback({ type: "feature" });

    expect((await response.json()).url).toBe("https://github.com/discussion/2");
    expect(sentGithubBody(1)).toMatchObject({
      variables: { input: { repositoryId: "repo", categoryId: "ideas" } },
    });

    const sent = JSON.stringify(sentGithubBody(1));
    expect(sent).not.toContain("<details>");
    expect(sent).not.toContain("/de/receipts");
  });

  it("reports an error when GitHub fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const response = await postFeedback({});

    expect(response.status).toBe(503);
  });

  it("creates no entry when the image upload fails", async () => {
    mocks.uploadOpeninaryMedia.mockRejectedValue(new Error("upload down"));

    const response = await postFeedback({ screenshot: await screenshotFile() });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects files that are not images", async () => {
    const response = await postFeedback({
      screenshot: new File(["kein bild"], "shot.png", { type: "image/png" }),
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
