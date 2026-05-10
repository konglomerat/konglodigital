import PageTitle from "../components/PageTitle";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProjectCard from "./ProjectCard";
import ProjectOfTheMonthCard from "./ProjectOfTheMonthCard";
import ProjectUploadPromptCard from "./ProjectUploadPromptCard";
import {
  loadProjects,
  loadProjectsByWorkshopResourceId,
} from "./project-data";
import { PROJECT_WORKSHOP_RESOURCE_ID_PARAM } from "./project-filters";

const PROJECT_OF_THE_MONTH_TAG = "projectofthemonth";
const PROJECT_UPLOAD_PROMPT_INSERT_AFTER = 5;

const getSearchParam = (
  params: Record<string, string | string[] | undefined>,
  key: string,
) => {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return typeof value === "string" ? value : "";
};

const hasProjectOfTheMonthTag = (tags?: string[] | null) =>
  tags?.some((tag) => tag.trim().toLowerCase() === PROJECT_OF_THE_MONTH_TAG) ??
  false;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams
    ? await Promise.resolve(searchParams)
    : {};
  const workshopResourceId = getSearchParam(
    resolvedSearchParams,
    PROJECT_WORKSHOP_RESOURCE_ID_PARAM,
  ).trim();

  const [{ tx, locale }, supabase, projects] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    workshopResourceId
      ? loadProjectsByWorkshopResourceId(workshopResourceId)
      : loadProjects(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const projectOfTheMonth =
    projects.find((project) => hasProjectOfTheMonthTag(project.tags)) ?? null;
  const orderedProjects = projectOfTheMonth
    ? [
        projectOfTheMonth,
        ...projects.filter((project) => project.id !== projectOfTheMonth.id),
      ]
    : projects;
  const copy = {
    missingDescriptionLabel: tx("Noch keine Beschreibung hinterlegt.", "de"),
    openProjectLabel: tx("Zum Projekt", "de"),
    projectLabel: tx("Projekt", "de"),
    projectOfTheMonthLabel: tx("Projekt des Monats", "de"),
  };
  const orderedProjectEntries = orderedProjects.map((project) => ({
    project,
    isProjectOfTheMonth:
      projectOfTheMonth?.id === project.id &&
      hasProjectOfTheMonthTag(project.tags),
  }));
  const promptInsertIndex = orderedProjectEntries.findIndex(
    (entry, index) =>
      !entry.isProjectOfTheMonth &&
      orderedProjectEntries
        .slice(0, index + 1)
        .filter((candidate) => !candidate.isProjectOfTheMonth).length ===
        PROJECT_UPLOAD_PROMPT_INSERT_AFTER,
  );
  const projectGridWithPrompt = orderedProjectEntries.flatMap(
    (entry, index) => {
      const projectCard = entry.isProjectOfTheMonth ? (
        <ProjectOfTheMonthCard
          key={entry.project.id}
          project={entry.project}
          locale={locale}
          copy={copy}
        />
      ) : (
        <ProjectCard
          key={entry.project.id}
          project={entry.project}
          locale={locale}
          copy={copy}
        />
      );

      return index === promptInsertIndex
        ? [projectCard, <ProjectUploadPromptCard key="project-upload-prompt" />]
        : [projectCard];
    },
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageTitle
        title={tx("Projekte", "de")}
        subTitle={tx(
          workshopResourceId
            ? "Hier findest du Projekte aus diesem Werkbereich."
            : "Hier kannst du Projekte, Umbauten und Prototypen unserer Werkstätten entdecken.",
          "de",
        )}
        links={
          user
            ? [
                {
                  href: localizePathname("/projects/new", locale),
                  label: tx("Neues Projekt", "de"),
                  kind: "primary",
                },
              ]
            : undefined
        }
      />

      {projects.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-input bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm   ">
          {tx(
            workshopResourceId
              ? "Es gibt noch keine Projekte für diesen Werkbereich."
              : "Es gibt noch keine Projekte.",
            "de",
          )}
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projectGridWithPrompt}
        </section>
      )}
    </main>
  );
}
