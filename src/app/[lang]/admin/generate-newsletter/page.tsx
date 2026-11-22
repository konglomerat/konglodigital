import { redirect } from "next/navigation";

import GenerateNewsletterClient from "./GenerateNewsletterClient";

import { loadNewsletterLibrary } from "@/lib/newsletter-sources";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import {
  listRapidmailMailings,
  listRapidmailRecipientLists,
  type RapidmailMailing,
  type RapidmailRecipientList,
} from "@/lib/rapidmail";
import { can } from "@/lib/access/access";
import { getServerAccess, getServerSession } from "@/lib/server-session";

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

const RAPIDMAIL_INITIAL_LOAD_TIMEOUT_MS = 8_000;

export default async function GenerateNewsletterPage() {
  const locale = await getRequestLocale();
  const { user } = await getServerSession();

  if (!user) {
    redirect(
      `${localizePathname("/login", locale)}?redirectedFrom=${encodeURIComponent(
        localizePathname("/admin/generate-newsletter", locale),
      )}`,
    );
  }

  if (!can(await getServerAccess(), "newsletter.manage")) {
    return null;
  }

  const rapidmailSignal = AbortSignal.timeout(
    RAPIDMAIL_INITIAL_LOAD_TIMEOUT_MS,
  );
  const [library, rapidmailResult] = await Promise.all([
    loadNewsletterLibrary(),
    Promise.allSettled([
      listRapidmailRecipientLists({ signal: rapidmailSignal }),
      listRapidmailMailings({ signal: rapidmailSignal }),
    ]),
  ]);

  const showcases = library.entries.map(entry => ({
    ...entry, href: localizePathname(entry.href, locale),
  }));

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
    const rejectedReason = rejected?.reason;
    rapidmailError =
      rejectedReason instanceof Error && rejectedReason.name === "TimeoutError"
        ? "Rapidmail antwortet gerade zu langsam. Der Newsletter kann trotzdem bearbeitet und exportiert werden; zum Anlegen eines Rapidmail-Entwurfs lade die Seite später erneut."
        : rejectedReason instanceof Error
          ? rejectedReason.message
          : "Rapidmail konnte nicht geladen werden.";
  }

  return (
    <GenerateNewsletterClient
      locale={locale}
      userId={user.id}
      showcases={showcases}
      sourceWarnings={library.warnings}
      recipientLists={recipientLists}
      issueDefaults={createIssueDefaults()}
      rapidmailDefaults={rapidmailDefaults}
      rapidmailError={rapidmailError}
    />
  );
}
