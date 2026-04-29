import { redirect } from "next/navigation";

import ProjectEditorClient from "../ProjectEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectedFrom=/projects/new");
  }

  return <ProjectEditorClient mode="create" />;
}
