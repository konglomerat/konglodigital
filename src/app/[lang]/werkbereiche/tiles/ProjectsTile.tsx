import Link from "next/link";

import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import {
  loadProjectsByWorkshopResourceId,
  type ProjectRecord,
} from "@/app/[lang]/projects/project-data";
import {
  getProjectArticleLink,
  ProjectCardMedia,
} from "@/app/[lang]/projects/projectCardShared";
import { buildProjectsByWorkshopHref } from "@/app/[lang]/projects/project-filters";
import Tile from "./Tile";

type ProjectsTileProps = {
  workshopResourceId: string;
  title?: string;
  limit?: number;
};

type ProjectTileCardProps = {
  project: ProjectRecord;
  articleLink: string;
  projectLabel: string;
};

function ProjectTileCard({
  project,
  articleLink,
  projectLabel,
}: ProjectTileCardProps) {
  return (
    <article className="group">
      <div className="overflow-hidden rounded-xl border border-border bg-card/50">
        <ProjectCardMedia
          articleLink={articleLink}
          project={project}
          copy={{ projectLabel }}
        />
      </div>
    </article>
  );
}

export default async function ProjectsTile({
  workshopResourceId,
  title,
  limit = 6,
}: ProjectsTileProps) {
  const normalizedWorkshopResourceId = workshopResourceId.trim();
  if (!normalizedWorkshopResourceId) {
    return null;
  }

  const [{ tx, locale }, projects] = await Promise.all([
    getServerI18n(),
    loadProjectsByWorkshopResourceId(normalizedWorkshopResourceId, limit),
  ]);

  const allProjectsHref = localizePathname(
    buildProjectsByWorkshopHref(normalizedWorkshopResourceId),
    locale,
  );
  const tileTitle = title ?? tx("Projekte", "de");
  const projectLabel = tx("Projekt", "de");
  const tileProjects = projects.slice(0, 6);

  return (
    <Tile
      title={title ?? tx("Neueste Projekte", "de")}
      subtitle={tx("entstanden in der Holzwerkstatt:", "de")}
    >
      <div className="flex h-full flex-col gap-3">
        {tileProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tx("Noch keine Projekte aus diesem Werkbereich.", "de")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {tileProjects.map((project) => {
              const articleLink = getProjectArticleLink(project, locale);

              return (
                <ProjectTileCard
                  key={project.id}
                  project={project}
                  articleLink={articleLink}
                  projectLabel={projectLabel}
                />
              );
            })}
          </div>
        )}

        <Link
          href={allProjectsHref}
          className="mt-auto inline-flex w-full items-center justify-center rounded-md border border-border bg-muted/40 px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted"
        >
          {tx("Alle Projekte", "de")}
        </Link>
      </div>
    </Tile>
  );
}