import GenerateStoryClient from "./GenerateStoryClient";

import { getRequestLocale } from "@/i18n/server";
import { can } from "@/lib/access/access";
import { loadStorySelectableItems } from "@/lib/story-drafts";
import { getServerAccess } from "@/lib/server-session";

export const dynamic = "force-dynamic";

export default async function GenerateStoryPage() {
  const locale = await getRequestLocale();
  if (!can(await getServerAccess(), "stories.manage")) {
    return null;
  }
  const items = await loadStorySelectableItems(400);

  return <GenerateStoryClient locale={locale} items={items} />;
}
