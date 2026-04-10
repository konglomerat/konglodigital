import GenerateNewsletterClient from "./GenerateNewsletterClient";

import { getRequestLocale } from "@/i18n/server";
import { loadProjects } from "@/app/[lang]/projects/project-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  listRapidmailMailings,
  listRapidmailRecipientLists,
  type RapidmailMailing,
  type RapidmailRecipientList,
} from "@/lib/rapidmail";

type SelectableItem = {
  id: string;
  name: string;
  prettyTitle: string | null;
  description: string | null;
  image: string | null;
  updatedAt: string | null;
};

const loadResourceOptions = async () => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("resources")
    .select("id, pretty_title, name, description, image, images, updated_at, created_at, type")
    .not("type", "ilike", "project")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, 299);

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    prettyTitle: entry.pretty_title ?? null,
    description: entry.description ?? null,
    image:
      entry.images?.find(
        (value: unknown): value is string => typeof value === "string" && Boolean(value),
      ) ?? entry.image ?? null,
    updatedAt: entry.updated_at ?? null,
  })) satisfies SelectableItem[];
};

const deriveDefaults = (
  recipientLists: RapidmailRecipientList[],
  mailings: RapidmailMailing[],
) => {
  const recentMailing = mailings.find(
    (entry) => entry.fromName.trim() && entry.fromEmail.trim(),
  );
  const recentRecipientListId = recentMailing?.destinations.find(
    (entry) => entry.type === "recipientlist" && entry.action === "include",
  )?.id;
  const defaultRecipientListId =
    recentRecipientListId ??
    recipientLists.find((entry) => entry.isDefault)?.id ??
    recipientLists[0]?.id ??
    null;

  return {
    fromName: recentMailing?.fromName ?? "",
    fromEmail: recentMailing?.fromEmail ?? "",
    subject: "",
    recipientListId: defaultRecipientListId,
  };
};

export const dynamic = "force-dynamic";

export default async function GenerateNewsletterPage() {
  const locale = await getRequestLocale();
  const [resources, projects, rapidmailResult] = await Promise.all([
    loadResourceOptions(),
    loadProjects(180).then((entries) =>
      entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        prettyTitle: entry.prettyTitle ?? null,
        description: entry.description ?? null,
        image: entry.images?.find(Boolean) ?? entry.image ?? null,
        updatedAt: entry.updatedAt ?? null,
      })),
    ),
    Promise.allSettled([listRapidmailRecipientLists(), listRapidmailMailings()]),
  ]);

  let recipientLists: RapidmailRecipientList[] = [];
  let rapidmailError: string | null = null;
  let defaults = {
    fromName: "",
    fromEmail: "",
    subject: "",
    recipientListId: null as number | null,
  };

  if (
    rapidmailResult[0]?.status === "fulfilled" &&
    rapidmailResult[1]?.status === "fulfilled"
  ) {
    recipientLists = rapidmailResult[0].value;
    defaults = deriveDefaults(recipientLists, rapidmailResult[1].value);
  } else {
    rapidmailError =
      rapidmailResult[0]?.status === "rejected"
        ? rapidmailResult[0].reason instanceof Error
          ? rapidmailResult[0].reason.message
          : "Rapidmail konnte nicht geladen werden."
        : rapidmailResult[1]?.status === "rejected"
          ? rapidmailResult[1].reason instanceof Error
            ? rapidmailResult[1].reason.message
            : "Rapidmail konnte nicht geladen werden."
          : "Rapidmail konnte nicht geladen werden.";
  }

  return (
    <GenerateNewsletterClient
      locale={locale}
      resources={resources}
      projects={projects}
      recipientLists={recipientLists}
      defaults={defaults}
      rapidmailError={rapidmailError}
    />
  );
}