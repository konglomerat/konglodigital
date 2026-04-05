type UnknownRecord = Record<string, unknown>;

export type CloudMailinAccessCodeEntry = {
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  accessCode: string | null;
  extractedFrom: "subject" | "body" | "none";
  bodyPreview: string | null;
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

  const bodyRaw =
    readNestedString(payload, ["plain"]) ??
    readNestedString(payload, ["stripped-text"]) ??
    readNestedString(payload, ["text"]) ??
    readNestedString(payload, ["html"]);

  const body = bodyRaw ? collapseWhitespace(bodyRaw) : null;
  const matcher = parseAccessCodeRegex(options?.accessCodePattern);

  const subjectMatch = subject?.match(matcher)?.[0] ?? null;
  const bodyMatch = body?.match(matcher)?.[0] ?? null;

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
  };
};
