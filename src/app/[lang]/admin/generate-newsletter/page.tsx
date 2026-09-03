import { redirect } from "next/navigation";

import GenerateNewsletterClient from "./GenerateNewsletterClient";

import { loadProjects } from "@/app/[lang]/projects/project-data";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { buildProjectPath } from "@/lib/project-path";
import {
  listRapidmailMailings,
  listRapidmailRecipientLists,
  type RapidmailMailing,
  type RapidmailRecipientList,
} from "@/lib/rapidmail";
import { isImageUrl } from "@/lib/resource-media";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NewsletterProject = {
  id: string;
  name: string;
  prettyTitle: string | null;
  excerpt: string | null;
  description: string | null;
  images: string[];
  publishDate: string | null;
  updatedAt: string | null;
  href: string;
};

const deriveRapidmailDefaults = (
  recipientLists: RapidmailRecipientList[],
  mailings: RapidmailMailing[],
) => {
  const recentMailing = mailings.find(
    (entry) => entry.fromName.trim() && entry.fromEmail.trim(),
  );
  const recentRecipientListId = recentMailing?.destinations.find(
    (entry) => entry.type === "recipientlist" && entry.action === "include",
  )?.id;

  return {
    fromName: recentMailing?.fromName ?? "",
    fromEmail: recentMailing?.fromEmail ?? "",
    recipientListId:
      recentRecipientListId ??
      recipientLists.find((entry) => entry.isDefault)?.id ??
      recipientLists[0]?.id ??
      null,
  };
};

const createIssueDefaults = () => {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((entry) => entry.type === type)?.value ?? "";
  const year = part("year").slice(-2);
  const month = part("month");
  const monthName = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(now);

  return {
    title: `Neues vom KNGLMRT ${year}${month}`,
    subject: `Neues vom KNGLMRT im ${monthName}`,
    intro:
      "Zwischen Werkstattluft, guten Ideen und gemeinsamem Anpacken ist wieder einiges passiert. Hier kommen die neuesten Projekte aus dem Konglomerat.",
  };
};

export const dynamic = "force-dynamic";

export default async function GenerateNewsletterPage() {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(
      `${localizePathname("/login", locale)}?redirectedFrom=${encodeURIComponent(
        localizePathname("/admin/generate-newsletter", locale),
      )}`,
    );
  }

  if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
    return null;
  }

  const [projectRecords, rapidmailResult] = await Promise.all([
    loadProjects(180),
    Promise.allSettled([
      listRapidmailRecipientLists(),
      listRapidmailMailings(),
    ]),
  ]);

  const projects = projectRecords.map((project) => {
    const images = Array.from(
      new Set(
        [project.image, ...(project.images ?? [])].filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value) && isImageUrl(value),
        ),
      ),
    );

    return {
      id: project.id,
      name: project.name,
      prettyTitle: project.prettyTitle ?? null,
      excerpt: project.excerpt ?? null,
      description: project.description ?? null,
      images,
      publishDate: project.publishDate ?? null,
      updatedAt: project.updatedAt ?? null,
      href: localizePathname(buildProjectPath(project), locale),
    } satisfies NewsletterProject;
  });

  let recipientLists: RapidmailRecipientList[] = [];
  let rapidmailError: string | null = null;
  let rapidmailDefaults = {
    fromName: "",
    fromEmail: "",
    recipientListId: null as number | null,
  };

  if (
    rapidmailResult[0]?.status === "fulfilled" &&
    rapidmailResult[1]?.status === "fulfilled"
  ) {
    recipientLists = rapidmailResult[0].value;
    rapidmailDefaults = deriveRapidmailDefaults(
      recipientLists,
      rapidmailResult[1].value,
    );
  } else {
    const rejected = rapidmailResult.find(
      (entry): entry is PromiseRejectedResult => entry.status === "rejected",
    );
    rapidmailError =
      rejected?.reason instanceof Error
        ? rejected.reason.message
        : "Rapidmail konnte nicht geladen werden.";
  }

  return (
    <GenerateNewsletterClient
      locale={locale}
      projects={projects}
      recipientLists={recipientLists}
      issueDefaults={createIssueDefaults()}
      rapidmailDefaults={rapidmailDefaults}
      rapidmailError={rapidmailError}
    />
  );
}
