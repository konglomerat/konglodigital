import { notFound, redirect } from "next/navigation";

import ProjectEditorClient from "../../ProjectEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
import { userHasRole } from "@/lib/roles";
import { buildProjectPath } from "@/lib/project-path";
import { loadProjectByIdentifier } from "../../project-data";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
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
    redirect(`/login?redirectedFrom=/projects/edit/${id}`);
  }

  const project = await loadProjectByIdentifier(id);
  if (!project) {
    notFound();
  }

  const isAdmin = await userHasRole(supabase, user, "admin");
  if (project.isPrivate && !isAdmin) {
    notFound();
  }

  const canEdit =
    project.ownerId === user.id || hasRight(user, "resources:edit");
  if (!canEdit) {
    redirect(buildProjectPath(project));
  }

  const isProjectOwner = project.ownerId === user.id;
  const canDelete = isProjectOwner || isAdmin;

  return (
    <ProjectEditorClient
      mode="edit"
      initialProject={project}
      canDelete={canDelete}
      canManagePrivacy={isAdmin}
    />
  );
}
