import GenerateStoryClient from "./GenerateStoryClient";

import { getRequestLocale } from "@/i18n/server";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { loadStorySelectableItems } from "@/lib/story-drafts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GenerateStoryPage() {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  if (!can(await loadUserAccess(supabase, data.user), "stories.manage")) {
    return null;
  }
  const items = await loadStorySelectableItems(400);

  return <GenerateStoryClient locale={locale} items={items} />;
}
