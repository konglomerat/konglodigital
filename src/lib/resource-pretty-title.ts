type SupabaseError = { message?: string } | null;

type SupabaseLike = {
  from: (table: string) => unknown;
};

const SLUG_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const DIACRITIC_PATTERN = /[\u0300-\u036f]/g;

export const slugifyResourceTitle = (
  value: string,
  fallback?: string,
): string => {
  const transliterated = value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");

  const normalized = transliterated
    .normalize("NFKD")
    .replace(DIACRITIC_PATTERN, "")
    .toLowerCase()
    .trim()
    .replace(SLUG_SEPARATOR_PATTERN, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (normalized) {
    return normalized;
  }

  if (fallback && fallback.trim()) {
    return slugifyResourceTitle(fallback);
  }

  return "resource";
};

export const buildResourcePath = (resource: {
  id: string;
  prettyTitle?: string | null;
}) =>
  `/resources/${resource.prettyTitle?.trim() ? resource.prettyTitle : resource.id}`;

const findAvailablePrettyTitle = async (
  supabase: SupabaseLike,
  resourceId: string,
  basePrettyTitle: string,
) => {
  for (let index = 0; index < 100; index += 1) {
    const candidate =
      index === 0 ? basePrettyTitle : `${basePrettyTitle}-${index + 1}`;

    const resourcePrettyTitlesQuery = supabase.from(
      "resource_pretty_titles",
    ) as {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          maybeSingle: () => Promise<{
            data: { resource_id?: string } | null;
            error: SupabaseError;
          }>;
        };
      };
    };

    const { data, error } = await resourcePrettyTitlesQuery
      .select("resource_id")
      .eq("pretty_title", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Unable to resolve pretty title.");
    }

    if (!data || data.resource_id === resourceId) {
      return candidate;
    }
  }

  throw new Error("Unable to create a unique pretty title.");
};

export const ensureResourcePrettyTitle = async (
  supabase: SupabaseLike,
  input: { resourceId: string; name: string },
) => {
  const fallback = `resource-${input.resourceId.slice(0, 8)}`;
  const basePrettyTitle = slugifyResourceTitle(input.name, fallback);
  const prettyTitle = await findAvailablePrettyTitle(
    supabase,
    input.resourceId,
    basePrettyTitle,
  );

  const unsetCurrentQuery = supabase.from("resource_pretty_titles") as {
    update: (payload: { is_current: boolean }) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        neq: (
          column: string,
          value: unknown,
        ) => Promise<{ error: SupabaseError }>;
      };
    };
  };

  const { error: unsetCurrentError } = await unsetCurrentQuery
    .update({ is_current: false })
    .eq("resource_id", input.resourceId)
    .neq("pretty_title", prettyTitle);

  if (unsetCurrentError) {
    throw new Error(
      unsetCurrentError.message || "Unable to update pretty title history.",
    );
  }

  const upsertHistoryQuery = supabase.from("resource_pretty_titles") as {
    upsert: (
      payload: {
        resource_id: string;
        pretty_title: string;
        is_current: boolean;
      },
      options: { onConflict: string },
    ) => Promise<{ error: SupabaseError }>;
  };

  const { error: upsertHistoryError } = await upsertHistoryQuery.upsert(
    {
      resource_id: input.resourceId,
      pretty_title: prettyTitle,
      is_current: true,
    },
    { onConflict: "resource_id,pretty_title" },
  );

  if (upsertHistoryError) {
    throw new Error(
      upsertHistoryError.message || "Unable to save pretty title history.",
    );
  }

  const updateResourceQuery = supabase.from("resources") as {
    update: (payload: { pretty_title: string }) => {
      eq: (column: string, value: unknown) => Promise<{ error: SupabaseError }>;
    };
  };

  const { error: updateResourceError } = await updateResourceQuery
    .update({ pretty_title: prettyTitle })
    .eq("id", input.resourceId);

  if (updateResourceError) {
    throw new Error(
      updateResourceError.message || "Unable to update resource pretty title.",
    );
  }

  return prettyTitle;
};

export const resolveResourceIdByPrettyTitle = async (
  supabase: SupabaseLike,
  prettyTitle: string,
) => {
  const query = supabase.from("resource_pretty_titles") as {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        maybeSingle: () => Promise<{
          data: { resource_id?: string; is_current?: boolean } | null;
          error: SupabaseError;
        }>;
      };
    };
  };

  const { data, error } = await query
    .select("resource_id, is_current")
    .eq("pretty_title", prettyTitle)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Unable to resolve resource.");
  }

  if (!data || typeof data.resource_id !== "string") {
    return null;
  }

  return {
    resourceId: data.resource_id,
    isCurrent: data.is_current === true,
  };
};
