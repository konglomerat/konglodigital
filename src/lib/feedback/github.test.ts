import { createVerify, generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const fetchMock = vi.fn();
const inOneHour = () => new Date(Date.now() + 60 * 60_000).toISOString();

const tokenCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith("/app/installations/42/access_tokens"),
  );

const respondWith = (expiresAt: () => string) => {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith("/access_tokens")
      ? Response.json({ token: "installation-token", expires_at: expiresAt() })
      : Response.json({ html_url: "https://github.com/issue/1" }),
  );
};

// Das Token liegt im Modul — jeder Test startet mit einem frischen.
const loadGithub = async () => {
  vi.resetModules();
  return import("./github");
};

const entry = { type: "bug", title: "Titel", body: "Text" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_APP_ID", "123");
  vi.stubEnv("GITHUB_APP_INSTALLATION_ID", "42");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);
  respondWith(inOneHour);
});

describe("publishFeedbackToGithub", () => {
  it("signs in as the app with a valid short-lived JWT", async () => {
    const { publishFeedbackToGithub } = await loadGithub();
    await publishFeedbackToGithub(entry);

    const jwt = String(tokenCalls()[0][1].headers.Authorization).replace(
      "Bearer ",
      "",
    );
    const [header, payload, signature] = jwt.split(".");
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, signature, "base64url");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());

    expect(verified).toBe(true);
    expect(claims.iss).toBe("123");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it("creates the issue with the installation token", async () => {
    const { publishFeedbackToGithub } = await loadGithub();
    const url = await publishFeedbackToGithub(entry);

    expect(url).toBe("https://github.com/issue/1");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer installation-token",
    );
  });

  it("reuses a valid token", async () => {
    const { publishFeedbackToGithub } = await loadGithub();
    await publishFeedbackToGithub(entry);
    await publishFeedbackToGithub(entry);
    expect(tokenCalls()).toHaveLength(1);
  });

  it("fetches a new token shortly before expiry", async () => {
    respondWith(() => new Date(Date.now() + 60_000).toISOString());
    const { publishFeedbackToGithub } = await loadGithub();
    await publishFeedbackToGithub(entry);
    await publishFeedbackToGithub(entry);
    expect(tokenCalls()).toHaveLength(2);
  });

  it("fails when the app is not configured", async () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    const { publishFeedbackToGithub } = await loadGithub();
    await expect(publishFeedbackToGithub(entry)).rejects.toThrow(
      "GITHUB_APP_PRIVATE_KEY fehlt.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when GitHub rejects the app", async () => {
    fetchMock.mockImplementation(
      async () => new Response("nope", { status: 401 }),
    );
    const { publishFeedbackToGithub } = await loadGithub();
    await expect(publishFeedbackToGithub(entry)).rejects.toThrow("HTTP 401");
  });
});
