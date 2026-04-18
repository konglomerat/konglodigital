import PageTitle from "../components/PageTitle";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProjectCard from "./ProjectCard";
import ProjectOfTheMonthCard from "./ProjectOfTheMonthCard";
import ProjectUploadPromptCard from "./ProjectUploadPromptCard";
import { loadProjects } from "./project-data";

const PROJECT_OF_THE_MONTH_TAG = "projectofthemonth";
const PROJECT_UPLOAD_PROMPT_INSERT_AFTER = 5;

const hasProjectOfTheMonthTag = (tags?: string[] | null) =>
  tags?.some((tag) => tag.trim().toLowerCase() === PROJECT_OF_THE_MONTH_TAG) ??
  false;

export default async function ProjectsPage() {
  const [{ tx, locale }, supabase, projects] = await Promise.all([
    getServerI18n(),
    createSupabaseServerClient({ readOnly: true }),
    loadProjects(),
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
    videoLabel: tx("Video", "de"),
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
          "Hier kannst du Projekte, Umbauten und Prototypen unserer Werkstätten entdecken.",
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
        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-600 shadow-sm">
          {tx("Es gibt noch keine Projekte.", "de")}
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projectGridWithPrompt}
        </section>
      )}
    </main>
  );
}
