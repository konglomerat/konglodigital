import { notFound, redirect } from "next/navigation";

import ShowcaseEditorClient from "../../ShowcaseEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
import { userHasRole } from "@/lib/roles";
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

  const canEdit =
    showcase.ownerId === user.id || hasRight(user, "resources:edit");
  if (!canEdit) {
    redirect(buildShowcasePath(showcase));
  }

  const isShowcaseOwner = showcase.ownerId === user.id;
  const isAdmin = isShowcaseOwner
    ? false
    : await userHasRole(supabase, user, "admin");
  const canDelete = isShowcaseOwner || isAdmin;

  return (
    <ShowcaseEditorClient
      mode="edit"
      initialShowcase={showcase}
      canDelete={canDelete}
    />
  );
}
