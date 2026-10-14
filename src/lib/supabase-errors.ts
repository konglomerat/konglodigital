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

  // 42P01 kommt von Postgres, PGRST205 von PostgREST, wenn die Tabelle nicht
  // im Schema-Cache steht.
  if (parsedError.code !== "42P01" && parsedError.code !== "PGRST205") {
    return false;
  }

  const message = parsedError.message?.toLowerCase() ?? "";
  const normalizedRelation = relationName.toLowerCase();

  return message.includes(normalizedRelation);
};

export const isMissingColumnError = (
  error: unknown,
  columnName: string,
  relationName?: string,
) => {
  const parsedError = asPostgrestLikeError(error);
  if (!parsedError) {
    return false;
  }

  if (parsedError.code !== "42703") {
    return false;
  }

  const message = parsedError.message?.toLowerCase() ?? "";
  const normalizedColumn = columnName.toLowerCase();

  if (!message.includes(normalizedColumn)) {
    return false;
  }

  if (!relationName) {
    return true;
  }

  return message.includes(relationName.toLowerCase());
};