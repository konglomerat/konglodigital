import type { User } from "@supabase/supabase-js";

import type { MemberProfile } from "@/lib/member-profiles";

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getMetadataText = (user: User, key: string): string | null => {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return normalizeText((metadata as Record<string, unknown>)[key]);
};

const getMetadataFullName = (user: User): string | null => {
  const directKeys = [
    "full_name",
    "fullName",
    "display_name",
    "displayName",
    "name",
  ];

  for (const key of directKeys) {
    const value = getMetadataText(user, key);
    if (value) {
      return value;
    }
  }

  const firstName = getMetadataText(user, "first_name");
  const lastName = getMetadataText(user, "last_name");
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return combined || null;
};

const getReceiptCreatorName = (
  user: User,
  memberProfile: MemberProfile | null,
): string => {
  return (
    normalizeText(memberProfile?.campaiName) ??
    getMetadataFullName(user) ??
    normalizeText(user.email) ??
    user.id
  );
};

export const buildCampaiReceiptCreatorNote = (params: {
  user: User;
  memberProfile: MemberProfile | null;
}): string => {
  const { user, memberProfile } = params;
  const creatorName = getReceiptCreatorName(user, memberProfile);
  const creatorEmail = normalizeText(user.email) ?? user.id;

  return `Erstellt von ${creatorName} (${creatorEmail}) via KongloDigital`;
};

export const addCampaiReceiptNotes = async (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  receiptId: string;
  contents: Array<string | null | undefined>;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { contents, ...noteParams } = params;

  for (const content of contents) {
    const normalizedContent = normalizeText(content);
    if (!normalizedContent) {
      continue;
    }

    const result = await addCampaiReceiptNote({
      ...noteParams,
      content: normalizedContent,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
};

export const addCampaiReceiptNote = async (params: {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  receiptId: string;
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { apiKey, organizationId, mandateId, receiptId, content } = params;

  if (!receiptId || !content) {
    return { ok: true };
  }

  const url = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/${receiptId}/notes`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ content }),
    });
  } catch (fetchError) {
    const message =
      fetchError instanceof Error ? fetchError.message : String(fetchError);
    return { ok: false, error: `Netzwerkfehler: ${message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${response.status}: ${body || "Campai note endpoint failed"}`,
    };
  }

  return { ok: true };
};