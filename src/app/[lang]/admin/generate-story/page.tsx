import GenerateStoryClient from "./GenerateStoryClient";

import { getRequestLocale } from "@/i18n/server";
import { userCanAccessModule } from "@/lib/roles";
import { loadStorySelectableItems } from "@/lib/story-drafts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GenerateStoryPage() {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await userCanAccessModule(supabase, data.user, "admin"))) {
    return null;
  }
  const items = await loadStorySelectableItems(400);

  return <GenerateStoryClient locale={locale} items={items} />;
}
