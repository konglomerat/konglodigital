type PostgrestLikeError = {
  code?: string;
  message?: string;
};

const asPostgrestLikeError = (value: unknown): PostgrestLikeError | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as PostgrestLikeError;
};

export const isMissingRelationError = (error: unknown, relationName: string) => {
  const parsedError = asPostgrestLikeError(error);
  if (!parsedError) {
    return false;
  }

  if (parsedError.code !== "42P01") {
    return false;
  }

  const message = parsedError.message?.toLowerCase() ?? "";
  const normalizedRelation = relationName.toLowerCase();

  return message.includes(normalizedRelation);
};