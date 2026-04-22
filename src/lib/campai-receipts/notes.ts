import type { User } from "@supabase/supabase-js";

import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";

import type { CampaiConfig } from "./config";
import { compactText } from "./parsers";

const resolveUserDisplayLabel = (
  displayName: string,
  email: string,
): string => {
  if (displayName && email) return `${displayName} (${email})`;
  return displayName || email || "Unbekannt";
};

const postReceiptNote = async (params: {
  config: CampaiConfig;
  receiptId: string;
  content: string;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { config, receiptId, content } = params;
  if (!content) return { ok: true };

  const url = `${config.baseUrl}/finance/receipts/${receiptId}/notes`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({ content }),
    });
  } catch (fetchError) {
    const msg =
      fetchError instanceof Error ? fetchError.message : String(fetchError);
    return { ok: false, error: `Netzwerkfehler: ${msg}` };
  }

  if (!response.ok) {
    if (response.status === 403) return { ok: true };
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${response.status}: ${body || "Campai note endpoint failed"}`,
    };
  }

  return { ok: true };
};

export const writeReceiptNotes = async (params: {
  config: CampaiConfig;
  receiptId: string;
  user: User;
  internalNote: string;
}): Promise<string | undefined> => {
  const { config, receiptId, user, internalNote } = params;
  const displayName = getCampaiBookingDisplayName(user);
  const userEmail = compactText(user.email);
  const userLabel = resolveUserDisplayLabel(displayName, userEmail);
  const noteAuthor = displayName || userEmail || "Unbekannt";

  const contents = [
    `Erstellt von ${userLabel} via KongloDigital`,
    internalNote ? `${noteAuthor}: ${internalNote}` : "",
  ].filter((entry) => entry.length > 0);

  for (const content of contents) {
    const result = await postReceiptNote({ config, receiptId, content });
    if (!result.ok) {
      return `Beleg erstellt, aber die Notiz konnte nicht gespeichert werden: ${result.error}`;
    }
  }
  return undefined;
};
