type UnknownRecord = Record<string, unknown>;

export type CloudMailinAccessCodeEntry = {
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  accessCode: string | null;
  extractedFrom: "subject" | "body" | "none";
  bodyPreview: string | null;
  bodyText: string | null;
};

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" ? (value as UnknownRecord) : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readNestedString = (
  source: unknown,
  path: readonly string[],
): string | null => {
  let cursor: unknown = source;

  for (const key of path) {
    const record = asRecord(cursor);
    if (!record) {
      return null;
    }
    cursor = record[key];
  }

  return asString(cursor);
};

const collapseWhitespace = (value: string) =>
  value
    .replace(/\r/g, "\n")
    .replace(/\n+/g, "\n")
    .replace(/[\t ]+/g, " ")
    .trim();

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const stripHtml = (value: string) =>
  decodeHtmlEntities(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

const removeUrls = (value: string) => value.replace(/https?:\/\/\S+/gi, " ");

const parseAccessCodeRegex = (value: string | undefined) => {
  const fallback = /\b\d{6}\b/;
  if (!value) {
    return fallback;
  }

  try {
    return new RegExp(value, "i");
  } catch {
    return fallback;
  }
};

type AccessCodeBodies = {
  plain: string | null;
  strippedText: string | null;
  text: string | null;
  html: string | null;
};

const extractBambuLabVerificationCode = (params: {
  sender: string | null;
  subject: string | null;
  bodies: AccessCodeBodies;
}) => {
  const senderLower = (params.sender ?? "").toLowerCase();
  const subjectLower = (params.subject ?? "").toLowerCase();

  const looksLikeBambu =
    senderLower.includes("bambu") ||
    senderLower.includes("bblmw.com") ||
    subjectLower.includes("verification") ||
    subjectLower.includes("bambu lab");

  if (!looksLikeBambu) {
    return null;
  }

  const textCandidates = [
    params.bodies.plain,
    params.bodies.strippedText,
    params.bodies.text,
    params.bodies.html ? stripHtml(params.bodies.html) : null,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => collapseWhitespace(removeUrls(entry)));

  const merged = textCandidates.join("\n");
  if (!merged) {
    return null;
  }

  const directPatterns: RegExp[] = [
    /verification\s+code(?:\s+below)?[^\d]{0,40}(\d{6})/i,
    /enter\s+the\s+verification\s+code\s+below[^\d]{0,40}(\d{6})/i,
    /to\s+continue\s+please\s+enter\s+the\s+verification\s+code[^\d]{0,40}(\d{6})/i,
    /(\d{6})[^\n]{0,120}code\s+is\s+valid/i,
  ];

  for (const pattern of directPatterns) {
    const match = merged.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  const anchorIndex = merged.toLowerCase().indexOf("verification code");
  if (anchorIndex >= 0) {
    const window = merged.slice(anchorIndex, anchorIndex + 240);
    const match = window.match(/\b\d{6}\b/);
    if (match?.[0]) {
      return match[0];
    }
  }

  return null;
};

export const parseCloudMailinPayload = (
  payload: unknown,
  options?: {
    accessCodePattern?: string;
  },
): CloudMailinAccessCodeEntry => {
  const sender =
    readNestedString(payload, ["envelope", "from"]) ??
    readNestedString(payload, ["headers", "from"]) ??
    readNestedString(payload, ["from"]);

  const recipient =
    readNestedString(payload, ["envelope", "to"]) ??
    readNestedString(payload, ["headers", "to"]) ??
    readNestedString(payload, ["to"]);

  const subject =
    readNestedString(payload, ["headers", "subject"]) ??
    readNestedString(payload, ["subject"]);

  const bodies: AccessCodeBodies = {
    plain: readNestedString(payload, ["plain"]),
    strippedText: readNestedString(payload, ["stripped-text"]),
    text: readNestedString(payload, ["text"]),
    html: readNestedString(payload, ["html"]),
  };

  const bodyRaw =
    bodies.plain ??
    bodies.strippedText ??
    bodies.text ??
    (bodies.html ? stripHtml(bodies.html) : null);

  const body = bodyRaw ? collapseWhitespace(removeUrls(bodyRaw)) : null;
  const matcher = parseAccessCodeRegex(options?.accessCodePattern);

  const subjectMatch = subject?.match(matcher)?.[0] ?? null;
  const bambuMatch = extractBambuLabVerificationCode({
    sender,
    subject,
    bodies,
  });
  const bodyMatch = bambuMatch ?? body?.match(matcher)?.[0] ?? null;

  const accessCode = subjectMatch ?? bodyMatch;
  const extractedFrom: CloudMailinAccessCodeEntry["extractedFrom"] =
    subjectMatch ? "subject" : bodyMatch ? "body" : "none";

  return {
    sender,
    recipient,
    subject,
    accessCode,
    extractedFrom,
    bodyPreview: body ? body.slice(0, 500) : null,
    bodyText: body,
  };
};
