import PageTitle from "../components/PageTitle";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import ShowcaseCard from "./ShowcaseCard";
import ShowcaseOfTheMonthCard from "./ShowcaseOfTheMonthCard";
import ShowcaseUploadPromptCard from "./ShowcaseUploadPromptCard";
import { loadAllShowcases } from "./showcase-data";
import Link from "next/link";

const SHOWCASE_OF_THE_MONTH_TAG = "showcaseofthemonth";
const SHOWCASE_UPLOAD_PROMPT_INSERT_AFTER = 5;

const hasShowcaseOfTheMonthTag = (tags?: string[] | null) =>
  tags?.some((tag) => tag.trim().toLowerCase() === SHOWCASE_OF_THE_MONTH_TAG) ??
  false;

export default async function ShowcasesPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const [{ tx, locale }, supabase] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canEdit = can(await loadUserAccess(supabase, user), "backend.login");
  const archive = (await searchParams).ansicht === "archiv";
  const allPosts = await loadAllShowcases();
  const legacyCount = allPosts.filter(post => post.isLegacyNews).length;
  const showcases = allPosts.filter(post => archive ? post.isLegacyNews : !post.isLegacyNews);
  const showcaseOfTheMonth =
    showcases.find((showcase) => hasShowcaseOfTheMonthTag(showcase.tags)) ??
    null;
  const orderedShowcases = showcaseOfTheMonth
    ? [
        showcaseOfTheMonth,
        ...showcases.filter(
          (showcase) => showcase.id !== showcaseOfTheMonth.id,
        ),
      ]
    : showcases;
  const copy = {
    missingDescriptionLabel: tx("Noch keine Beschreibung hinterlegt.", "de"),
    openShowcaseLabel: tx("Zum Beitrag", "de"),
    showcaseLabel: tx("Beitrag", "de"),
    showcaseOfTheMonthLabel: tx("Beitrag des Monats", "de"),
    privateShowcaseLabel: tx("Privat", "de"),
  };
  const orderedShowcaseEntries = orderedShowcases.map((showcase) => ({
    showcase,
    isShowcaseOfTheMonth:
      showcaseOfTheMonth?.id === showcase.id &&
      hasShowcaseOfTheMonthTag(showcase.tags),
  }));
  const promptInsertIndex = orderedShowcaseEntries.findIndex(
    (entry, index) =>
      !entry.isShowcaseOfTheMonth &&
      orderedShowcaseEntries
        .slice(0, index + 1)
        .filter((candidate) => !candidate.isShowcaseOfTheMonth).length ===
        SHOWCASE_UPLOAD_PROMPT_INSERT_AFTER,
  );
  const showcaseGridWithPrompt = orderedShowcaseEntries.flatMap(
    (entry, index) => {
      const showcaseCard = entry.isShowcaseOfTheMonth ? (
        <ShowcaseOfTheMonthCard
          key={entry.showcase.id}
          showcase={entry.showcase}
          locale={locale}
          copy={copy}
        />
      ) : (
        <ShowcaseCard
          key={entry.showcase.id}
          showcase={entry.showcase}
          locale={locale}
          copy={copy}
        />
      );

      return canEdit && !archive && index === promptInsertIndex
        ? [
            showcaseCard,
            <ShowcaseUploadPromptCard key="showcase-upload-prompt" />,
          ]
        : [showcaseCard];
    },
  );

  return (
    <div>
      <PageTitle
        title={tx(archive ? "News-Archiv" : "Hier entstanden", "de")}
        subTitle={tx(
          archive ? "Nachrichten von der bisherigen Konglomerat-Webseite – mit den ursprünglichen Inhalten und Veröffentlichungsdaten." : "Hier kannst du Beiträge, Umbauten und Prototypen unserer Werkstätten entdecken.",
          "de",
        )}
        className="mb-8"
        links={
          canEdit
            ? [
                {
                  href: localizePathname("/showcase/new", locale),
                  label: tx("Neuer Beitrag im CMS", "de"),
                  kind: "primary",
                },
              ]
            : undefined
        }
      />

      <nav aria-label="Beitragsansichten" className="mb-8 flex flex-wrap gap-3">
        <Link href={localizePathname("/showcase", locale)} aria-current={!archive ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${!archive ? "bg-foreground text-background" : "border-border"}`}>Hier entstanden ({allPosts.length - legacyCount})</Link>
        <Link href={`${localizePathname("/showcase", locale)}?ansicht=archiv`} aria-current={archive ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${archive ? "bg-foreground text-background" : "border-border"}`}>Legacy-News ({legacyCount})</Link>
      </nav>

      {showcases.length === 0 ? (
        <section className="rounded-lg border border-dashed border-input bg-card px-6 py-10 text-center text-sm text-muted-foreground ">
          {tx("Es gibt noch keine Beiträge.", "de")}
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {showcaseGridWithPrompt}
        </section>
      )}
    </div>
  );
}
