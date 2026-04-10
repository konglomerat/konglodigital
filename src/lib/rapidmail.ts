const RAPIDMAIL_API_BASE_URL = "https://apiv3.emailsys.net";

type RapidmailDestination = {
  type: string;
  id: number;
  action: string;
};

type RapidmailProblemDetails = {
  detail?: string;
  title?: string;
  validation_messages?:
    | string[]
    | Record<string, string[] | Record<string, string> | string>;
};

export type RapidmailRecipientList = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
};

export type RapidmailMailing = {
  id: number;
  created: string | null;
  updated: string | null;
  fromName: string;
  fromEmail: string;
  title: string | null;
  subject: string | null;
  status: string;
  destinations: RapidmailDestination[];
};

type RapidmailMailingsResponse = {
  _embedded?: {
    mailings?: RapidmailMailingEntry[];
  };
};

type RapidmailMailingEntry = {
  id: number;
  created?: string | null;
  updated?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  title?: string | null;
  subject?: string | null;
  status?: string | null;
  destinations?: RapidmailDestination[] | null;
};

type RapidmailRecipientListsResponse = {
  _embedded?: {
    recipientlists?: Array<{
      id: number;
      name?: string | null;
      description?: string | null;
      default?: string | null;
    }>;
  };
};

type CreateRapidmailDraftInput = {
  fromName: string;
  fromEmail: string;
  subject: string;
  title?: string;
  recipientListId: number;
  html: string;
};

type CreateRapidmailDraftResponse = {
  id?: number;
  status?: string | null;
  subject?: string | null;
  title?: string | null;
  _links?: {
    self?: {
      href?: string;
    };
  };
};

const createRapidmailAuthHeader = () => {
  const user = process.env.RAPIDMAIL_USER?.trim();
  const password = process.env.RAPIDMAIL_PASSWORD?.trim();

  if (!user || !password) {
    throw new Error("Rapidmail ist nicht konfiguriert.");
  }

  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
};

const normalizeErrorMessages = (
  value: RapidmailProblemDetails["validation_messages"],
): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    if (typeof entry === "string") {
      return `${key}: ${entry}`;
    }

    if (Array.isArray(entry)) {
      return entry
        .filter((item): item is string => typeof item === "string")
        .map((item) => `${key}: ${item}`);
    }

    if (entry && typeof entry === "object") {
      return Object.values(entry)
        .filter((item): item is string => typeof item === "string")
        .map((item) => `${key}: ${item}`);
    }

    return [];
  });
};

const rapidmailFetch = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${RAPIDMAIL_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/hal+json, application/json",
      Authorization: createRapidmailAuthHeader(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const rawText = await response.text();
  const parsed = rawText
    ? ((JSON.parse(rawText) as T | RapidmailProblemDetails) ?? null)
    : null;

  if (!response.ok) {
    const details = parsed as RapidmailProblemDetails | null;
    const validationMessages = normalizeErrorMessages(
      details?.validation_messages,
    );
    const message =
      validationMessages[0] ??
      details?.detail ??
      details?.title ??
      "Rapidmail-Anfrage fehlgeschlagen.";
    throw new Error(message);
  }

  return parsed as T;
};

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (value: Date) => {
  const year = Math.max(1980, value.getUTCFullYear());
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const seconds = Math.floor(value.getUTCSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosDate, dosTime };
};

const createZipBase64 = (fileName: string, content: string) => {
  const fileNameBuffer = Buffer.from(fileName, "utf8");
  const contentBuffer = Buffer.from(content, "utf8");
  const checksum = crc32(contentBuffer);
  const { dosDate, dosTime } = toDosDateTime(new Date());

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(contentBuffer.length, 18);
  localHeader.writeUInt32LE(contentBuffer.length, 22);
  localHeader.writeUInt16LE(fileNameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(contentBuffer.length, 20);
  centralHeader.writeUInt32LE(contentBuffer.length, 24);
  centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  const centralDirectorySize = centralHeader.length + fileNameBuffer.length;
  const centralDirectoryOffset =
    localHeader.length + fileNameBuffer.length + contentBuffer.length;
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    localHeader,
    fileNameBuffer,
    contentBuffer,
    centralHeader,
    fileNameBuffer,
    endOfCentralDirectory,
  ]).toString("base64");
};

export const listRapidmailRecipientLists = async () => {
  const response = await rapidmailFetch<RapidmailRecipientListsResponse>(
    "/recipientlists",
  );

  return (response._embedded?.recipientlists ?? [])
    .filter((entry) => typeof entry.id === "number" && Boolean(entry.name))
    .map((entry) => ({
      id: entry.id,
      name: entry.name?.trim() ?? "Empfaengerliste",
      description: entry.description?.trim() || null,
      isDefault: entry.default === "yes",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
};

export const listRapidmailMailings = async () => {
  const response = await rapidmailFetch<RapidmailMailingsResponse>(
    "/mailings",
  );

  return (response._embedded?.mailings ?? [])
    .filter(
      (entry): entry is RapidmailMailingEntry =>
        typeof entry.id === "number" &&
        typeof entry.from_name === "string" &&
        typeof entry.from_email === "string",
    )
    .map((entry) => ({
      id: entry.id,
      created: entry.created ?? null,
      updated: entry.updated ?? null,
      fromName: entry.from_name ?? "",
      fromEmail: entry.from_email ?? "",
      title: entry.title ?? null,
      subject: entry.subject ?? null,
      status: entry.status ?? "unknown",
      destinations: Array.isArray(entry.destinations) ? entry.destinations : [],
    }));
};

export const createRapidmailDraft = async ({
  fromName,
  fromEmail,
  subject,
  title,
  recipientListId,
  html,
}: CreateRapidmailDraftInput) => {
  const response = await rapidmailFetch<CreateRapidmailDraftResponse>(
    "/mailings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_name: fromName,
        from_email: fromEmail,
        subject,
        title: title ?? subject,
        file: {
          name: "newsletter.zip",
          type: "application/zip",
          content: createZipBase64("index.html", html),
        },
        destinations: [
          {
            type: "recipientlist",
            id: recipientListId,
            action: "include",
          },
        ],
      }),
    },
  );

  return {
    id: response.id ?? null,
    status: response.status ?? null,
    subject: response.subject ?? subject,
    title: response.title ?? title ?? subject,
    url: response._links?.self?.href ?? null,
  };
};