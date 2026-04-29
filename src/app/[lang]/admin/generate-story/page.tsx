import GenerateStoryClient from "./GenerateStoryClient";

import { getRequestLocale } from "@/i18n/server";
import { loadStorySelectableItems } from "@/lib/story-drafts";

export const dynamic = "force-dynamic";

export default async function GenerateStoryPage() {
  const locale = await getRequestLocale();
  const items = await loadStorySelectableItems(400);

  return <GenerateStoryClient locale={locale} items={items} />;
}