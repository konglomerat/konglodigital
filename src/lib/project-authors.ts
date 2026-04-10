type MetadataRecord = Record<string, unknown> | null | undefined;

const readFirstText = (
  metadata: MetadataRecord,
  keys: string[],
): string | null => {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

export const getProjectAuthorName = (
  metadata: MetadataRecord,
  fallbackEmail?: string | null,
) => {
  const directName = readFirstText(metadata, [
    "full_name",
    "campai_name",
    "name",
    "display_name",
  ]);
  if (directName) {
    return directName;
  }

  const firstName = readFirstText(metadata, ["first_name", "given_name"]);
  const lastName = readFirstText(metadata, ["last_name", "family_name"]);
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combined) {
    return combined;
  }

  if (fallbackEmail?.trim()) {
    return fallbackEmail.trim();
  }

  return "Mitglied";
};

export const getProjectAuthorAvatarUrl = (metadata: MetadataRecord) =>
  readFirstText(metadata, [
    "avatar_url",
    "picture",
    "image",
    "profile_image_url",
    "photo_url",
  ]);

export const getProjectAuthorBio = (metadata: MetadataRecord) =>
  readFirstText(metadata, ["short_bio", "bio", "about", "description"]);

export const getProjectAuthorInitials = (name: string) => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};
