import { redirect } from "next/navigation";

import ProjectEditorClient from "../ProjectEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userHasRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectedFrom=/projects/new");
  }

  const isAdmin = await userHasRole(supabase, user, "admin");

  return <ProjectEditorClient mode="create" canManagePrivacy={isAdmin} />;
}
