import { notFound, redirect } from "next/navigation";

import ShowcaseEditorClient from "../../ShowcaseEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { buildShowcasePath } from "@/lib/showcase-path";
import { loadShowcaseByIdentifier } from "../../showcase-data";

export const dynamic = "force-dynamic";

export default async function EditShowcasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectedFrom=/showcase/edit/${id}`);
  }

  const showcase = await loadShowcaseByIdentifier(id);
  if (!showcase) {
    notFound();
  }

  // Eigene Showcases darf jeder bearbeiten und löschen, fremde nur mit der
  // Rolle Showcase.
  const canEdit =
    showcase.ownerId === user.id ||
    can(await loadUserAccess(supabase, user), "showcase.edit");
  if (!canEdit) {
    redirect(buildShowcasePath(showcase));
  }
  const canDelete = canEdit;

  return (
    <ShowcaseEditorClient
      mode="edit"
      initialShowcase={showcase}
      canDelete={canDelete}
    />
  );
}
