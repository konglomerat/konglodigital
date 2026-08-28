import { redirect } from "next/navigation";

import ShowcaseEditorClient from "../ShowcaseEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewShowcasePage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectedFrom=/showcase/new");
  }

  return <ShowcaseEditorClient mode="create" />;
}
