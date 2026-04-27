import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import DuplicatesPageClient, {
  type DuplicateDetectionResource,
} from "./DuplicatesPageClient";

export const dynamic = "force-dynamic";

const loadResources = async (): Promise<DuplicateDetectionResource[]> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("resources")
    .select("id, pretty_title, name, type, tags, image, images")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      prettyTitle:
        typeof row.pretty_title === "string" ? row.pretty_title : null,
      name: typeof row.name === "string" ? row.name : "",
      type: typeof row.type === "string" ? row.type : null,
      tags: Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      image: typeof row.image === "string" ? row.image : null,
      images: Array.isArray(row.images)
        ? row.images.filter((url): url is string => typeof url === "string")
        : [],
    }))
    .filter((row) => Boolean(row.id && row.name));
};

export default async function ResourcesDuplicatesPage() {
  const resources = await loadResources();

  return <DuplicatesPageClient initialResources={resources} />;
}
