// Öffentliche Einträge: Fehler werden zu Issues, Ideen zu Discussions in der
// Kategorie „Ideas“, damit andere dafür abstimmen können.
//
// Geschrieben wird als GitHub App „Konglomerat Feedback Bot“. Sie braucht
// Schreibrecht auf Issues und Discussions und diese Variablen:
// GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY.
import "server-only";

import { createSign } from "node:crypto";

import type { FeedbackType } from "./feedback";

const REPOSITORY_OWNER = "konglomerat";
const REPOSITORY_NAME = "konglodigital";
const IDEAS_CATEGORY_SLUG = "ideas";
const REQUEST_TIMEOUT_MS = 15_000;
// Ein Installations-Token gilt eine Stunde; kurz vor Ablauf holen wir ein neues.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

const baseHeaders = {
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "User-Agent": "konglomerat-feedback-bot",
  "X-GitHub-Api-Version": "2022-11-28",
};

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
};

// Docker-Env-Files (z. B. in Dokploy) übernehmen Anführungszeichen und „\n“
// wörtlich, anders als Next.js lokal. Beides wird hier aufgelöst.
const readPrivateKey = () =>
  requiredEnv("GITHUB_APP_PRIVATE_KEY")
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .replace(/\\n/g, "\n");

const encodeJwtPart =(value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const createAppJwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    encodeJwtPart({ alg: "RS256", typ: "JWT" }),
    // 60 Sekunden zurück gleichen abweichende Uhren aus; GitHub erlaubt
    // insgesamt höchstens zehn Minuten Laufzeit.
    encodeJwtPart({
      iat: now - 60,
      exp: now + 540,
      iss: requiredEnv("GITHUB_APP_ID"),
    }),
  ].join(".");
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(readPrivateKey(), "base64url");

  return `${unsigned}.${signature}`;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const getInstallationToken = async () => {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }

  const installationId = requiredEnv("GITHUB_APP_INSTALLATION_ID");
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: { ...baseHeaders, Authorization: `Bearer ${createAppJwt()}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub-App-Anmeldung fehlgeschlagen: HTTP ${response.status}`);
  }

  const token = (await response.json()) as { token: string; expires_at: string };
  cachedToken = {
    value: token.token,
    expiresAt: new Date(token.expires_at).getTime(),
  };
  return token.token;
};

const githubHeaders = async () => ({
  ...baseHeaders,
  Authorization: `Bearer ${await getInstallationToken()}`,
});

const createIssue = async (title: string, body: string) => {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/issues`,
    {
      method: "POST",
      headers: await githubHeaders(),
      body: JSON.stringify({ title, body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub-Issue fehlgeschlagen: HTTP ${response.status}`);
  }

  const issue = (await response.json()) as { html_url: string };
  return issue.html_url;
};

const githubGraphql = async <T>(
  query: string,
  variables: Record<string, unknown>,
) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: await githubHeaders(),
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL fehlgeschlagen: HTTP ${response.status}`);
  }

  // GraphQL meldet Fehler auch bei HTTP 200.
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (payload.errors?.length || !payload.data) {
    throw new Error(
      `GitHub GraphQL fehlgeschlagen: ${payload.errors?.[0]?.message ?? "keine Daten"}`,
    );
  }
  return payload.data;
};

const createDiscussion = async (title: string, body: string) => {
  const { repository } = await githubGraphql<{
    repository: {
      id: string;
      discussionCategory: { id: string } | null;
    } | null;
  }>(
    `query ($owner: String!, $name: String!, $slug: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategory(slug: $slug) { id }
      }
    }`,
    {
      owner: REPOSITORY_OWNER,
      name: REPOSITORY_NAME,
      slug: IDEAS_CATEGORY_SLUG,
    },
  );
  if (!repository?.discussionCategory) {
    throw new Error("GitHub-Kategorie „Ideas“ nicht gefunden.");
  }

  const { createDiscussion: created } = await githubGraphql<{
    createDiscussion: { discussion: { url: string } };
  }>(
    `mutation ($input: CreateDiscussionInput!) {
      createDiscussion(input: $input) { discussion { url } }
    }`,
    {
      input: {
        repositoryId: repository.id,
        categoryId: repository.discussionCategory.id,
        title,
        body,
      },
    },
  );
  return created.discussion.url;
};

export const publishFeedbackToGithub = ({
  type,
  title,
  body,
}: {
  type: FeedbackType;
  title: string;
  body: string;
}) => (type === "bug" ? createIssue(title, body) : createDiscussion(title, body));
