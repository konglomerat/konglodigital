import { redirect } from "next/navigation";

import ShowcaseEditorClient from "../ShowcaseEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userHasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function NewShowcasePage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectedFrom=/showcase/new");
  }

  const isAdmin = await userHasRole(supabase, user, "admin");

  return <ShowcaseEditorClient mode="create" canManagePrivacy={isAdmin} />;
}
