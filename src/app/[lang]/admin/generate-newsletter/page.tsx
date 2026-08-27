import { redirect } from "next/navigation";

import GenerateNewsletterClient from "./GenerateNewsletterClient";

import { loadShowcases } from "@/app/[lang]/showcase/showcase-data";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { buildShowcasePath } from "@/lib/showcase-path";
import {
  listRapidmailMailings,
  listRapidmailRecipientLists,
  type RapidmailMailing,
  type RapidmailRecipientList,
} from "@/lib/rapidmail";
import { isImageUrl } from "@/lib/resource-media";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NewsletterShowcase = {
  id: string;
  name: string;
  prettyTitle: string | null;
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

  const [showcaseRecords, rapidmailResult] = await Promise.all([
    loadShowcases(180),
    Promise.allSettled([
      listRapidmailRecipientLists(),
      listRapidmailMailings(),
    ]),
  ]);

  const showcases = showcaseRecords.map((showcase) => {
    const images = Array.from(
      new Set(
        [showcase.image, ...(showcase.images ?? [])].filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value) && isImageUrl(value),
        ),
      ),
    );

    return {
      id: showcase.id,
      name: showcase.name,
      prettyTitle: showcase.prettyTitle ?? null,
      description: showcase.description ?? null,
      images,
      publishDate: showcase.publishDate ?? null,
      updatedAt: showcase.updatedAt ?? null,
      href: localizePathname(buildShowcasePath(showcase), locale),
    } satisfies NewsletterShowcase;
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
      showcases={showcases}
      recipientLists={recipientLists}
      issueDefaults={createIssueDefaults()}
      rapidmailDefaults={rapidmailDefaults}
      rapidmailError={rapidmailError}
    />
  );
}
