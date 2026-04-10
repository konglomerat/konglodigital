/* eslint-disable @next/next/no-img-element */

import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { localizePathname } from "@/i18n/config";
import { getServerI18n } from "@/i18n/server";
import Button from "./[lang]/components/Button";
import styles from "./ResourceOfTheMonthSection.module.css";

type ResourceOfTheMonthRow = {
  id: string;
  pretty_title: string | null;
  name: string;
  description: string | null;
  image: string | null;
  images: string[] | null;
  type: string | null;
  tags: string[] | null;
};

const RESOURCE_OF_THE_MONTH_TAG = "resourceofthemonth";

const truncateText = (text: string, maxLength: number) => {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
};

const loadResourceOfTheMonth = async () => {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("resources")
      .select("id, pretty_title, name, description, image, images, type, tags")
      .contains("tags", [RESOURCE_OF_THE_MONTH_TAG])
      .order("priority", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<ResourceOfTheMonthRow>();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      prettyTitle: data.pretty_title,
      name: data.name,
      description: data.description,
      image: data.images?.find(Boolean) ?? data.image,
      type: data.type?.trim() ?? null,
      tags:
        data.tags?.filter(
          (tag) => tag.trim().toLowerCase() !== RESOURCE_OF_THE_MONTH_TAG,
        ) ?? [],
    };
  } catch {
    return null;
  }
};

export default async function ResourceOfTheMonthSection() {
  const { tx, locale } = await getServerI18n();
  const resourceOfTheMonth = await loadResourceOfTheMonth();

  if (!resourceOfTheMonth) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-[#c8df8c]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,460px)] lg:items-stretch">
        <div className="flex flex-col justify-center px-6 py-7 md:px-8 md:py-8">
          <div className={styles.sparkleLabel}>
            <p
              className={`text-sm font-semibold uppercase tracking-[0.18em] text-lime-800 ${styles.sparkleText}`}
            >
              {tx("Ressource des Monats", "de")}
            </p>
            <span className={styles.sparkleCluster} aria-hidden="true">
              <span className={`${styles.sparkle} ${styles.sparkleOne}`} />
              <span className={`${styles.sparkle} ${styles.sparkleTwo}`} />
              <span className={`${styles.sparkle} ${styles.sparkleThree}`} />
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 md:text-4xl">
            {resourceOfTheMonth.name}
          </h2>
          {/* resourceOfTheMonth.type ? (
            <p className="mt-3 text-sm font-medium uppercase tracking-[0.12em] text-zinc-500">
              {resourceOfTheMonth.type}
            </p>
          ) : null */}
          {resourceOfTheMonth.description ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-950 md:text-base">
              {truncateText(resourceOfTheMonth.description, 260)}
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-950 md:text-base">
              {tx(
                "Entdecke ein ausgewähltes Werkzeug, Material oder Möbelstück aus unserem Inventar.",
                "de",
              )}
            </p>
          )}

          {resourceOfTheMonth.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {resourceOfTheMonth.tags.slice(0, 4).map((tag) => (
                <span
                  key={`${resourceOfTheMonth.id}-${tag}`}
                  className="rounded-full border border-lime-900/15 bg-white/55 px-3 py-1 text-xs font-semibold text-lime-950 backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <Button
              href={localizePathname(
                buildResourcePath({
                  id: resourceOfTheMonth.id,
                  prettyTitle: resourceOfTheMonth.prettyTitle,
                }),
                locale,
              )}
              kind="primary"
              size="medium"
              className="bg-lime-800 text-white hover:!bg-lime-900"
              icon={faArrowRight}
              iconPosition="right"
            >
              {tx("Zur Ressource", "de")}
            </Button>
          </div>
        </div>

        <div className="relative min-h-[390px] bg-[#c8df8c] lg:min-h-full">
          {resourceOfTheMonth.image ? (
            <>
              <img
                src={resourceOfTheMonth.image}
                alt={resourceOfTheMonth.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_140px_90px_-30px_#c8df8c] lg:shadow-[inset_160px_0_80px_-20px_#c8df8c]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#f3f8d5_0%,transparent_34%),linear-gradient(160deg,#7c9a37_0%,#2f4f1f_100%)]" />
          )}
        </div>
      </div>
    </section>
  );
}
