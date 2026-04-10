import ProjectOfTheMonthCarousel from "./ProjectOfTheMonthCarousel";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import { buildProjectPath } from "@/lib/project-path";

type ProjectOfTheMonthRow = {
  id: string;
  pretty_title: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  tags: string[] | null;
  workshop_resource_id: string | null;
};

const PROJECT_OF_THE_MONTH_TAG = "projectofthemonth";

const loadProjectsOfTheMonth = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("resources")
      .select(
        "id, pretty_title, name, description, image, images, tags, workshop_resource_id",
      )
      .ilike("type", "project")
      .contains("tags", [PROJECT_OF_THE_MONTH_TAG])
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);

    const rows = (data ?? []) as ProjectOfTheMonthRow[];
    const workshopIds = Array.from(
      new Set(
        rows
          .map((row) => row.workshop_resource_id)
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    );
    const { data: workshopRows } = workshopIds.length
      ? await supabase
          .from("resources")
          .select("id, name")
          .in("id", workshopIds)
      : { data: [] };
    const workshopById = new Map(
      (workshopRows ?? [])
        .filter(
          (row): row is { id: string; name: string | null } =>
            typeof row.id === "string",
        )
        .map((row) => [row.id, row.name ?? null]),
    );

    return rows.map((row) => ({
      id: row.id,
      prettyTitle: row.pretty_title,
      name: row.name,
      description: row.description ?? undefined,
      mediaUrl: row.images?.find(Boolean) ?? row.image,
      workshopName:
        row.workshop_resource_id != null
          ? (workshopById.get(row.workshop_resource_id) ?? null)
          : null,
      tags:
        row.tags?.filter(
          (tag) => tag.trim().toLowerCase() !== PROJECT_OF_THE_MONTH_TAG,
        ) ?? [],
    }));
  } catch {
    return [] as Array<{
      id: string;
      prettyTitle: string | null;
      name: string;
      description?: string;
      mediaUrl?: string | null;
      workshopName?: string | null;
      tags?: string[];
    }>;
  }
};

export default async function ProjectOfTheMonthSection() {
  const { tx, locale } = await getServerI18n();
  const projects = await loadProjectsOfTheMonth();

  if (projects.length === 0) {
    return null;
  }

  return (
    <ProjectOfTheMonthCarousel
      projects={projects.map((project) => ({
        ...project,
        href: localizePathname(buildProjectPath(project), locale),
        ctaLabel: tx("Zum Projekt", "de"),
      }))}
    />
  );
}
