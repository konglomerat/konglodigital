import { redirect } from "next/navigation";

import ShowcaseEditorClient from "../ShowcaseEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export default async function NewShowcasePage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectedFrom=/showcase/new");
  }

  const canManagePrivacy = can(
    await loadUserAccess(supabase, user),
    "showcase.private",
  );

  return <ShowcaseEditorClient mode="create" canManagePrivacy={canManagePrivacy} />;
}
