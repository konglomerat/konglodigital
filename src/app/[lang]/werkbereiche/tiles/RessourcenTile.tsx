/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import Tile from "./Tile";

type RessourcenTileProps = {
  /** Resource IDs to feature in the tile (in display order). */
  featuredIds?: string[];
  /** Tag used for the "Alle Ressourcen des Werkbereichs" link. */
  tag: string;
};

type FeaturedRow = {
  id: string;
  name: string;
  pretty_title: string | null;
  image: string | null;
  images: string[] | null;
};

const loadFeaturedResources = async (ids: string[]) => {
  if (ids.length === 0) {
    return [] as FeaturedRow[];
  }
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("resources")
      .select("id, name, pretty_title, image, images")
      .in("id", ids);
    if (error || !data) {
      return [] as FeaturedRow[];
    }
    const byId = new Map(
      (data as FeaturedRow[]).map((row) => [row.id, row]),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is FeaturedRow => Boolean(row));
  } catch {
    return [] as FeaturedRow[];
  }
};

export default async function RessourcenTile({
  featuredIds = [],
  tag,
}: RessourcenTileProps) {
  const { locale } = await getServerI18n();
  const featured = await loadFeaturedResources(featuredIds);

  const allResourcesHref = localizePathname(
    `/resources?tag=${encodeURIComponent(tag)}`,
    locale,
  );

  return (
    <Tile title="Wichtige Ressourcen">
      <div className="flex h-full flex-col gap-4">
        {featured.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Ressourcen ausgewählt.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {featured.map((resource) => {
              const image = resource.images?.find(Boolean) ?? resource.image;
              const href = localizePathname(
                buildResourcePath({
                  id: resource.id,
                  prettyTitle: resource.pretty_title,
                }),
                locale,
              );
              return (
                <li key={resource.id}>
                  <Link
                    href={href}
                    className="flex items-center gap-3 py-2.5 text-sm transition hover:text-primary"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="flex-1 font-semibold text-foreground">
                      {resource.name}
                    </span>
                    <span aria-hidden className="text-muted-foreground">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href={allResourcesHref}
          className="mt-auto inline-flex w-full items-center justify-center rounded-md border border-border bg-muted/40 px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted"
        >
          Alle Ressourcen des Werkbereichs
        </Link>
      </div>
    </Tile>
  );
}
