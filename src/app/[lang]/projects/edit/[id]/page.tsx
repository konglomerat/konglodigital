import { notFound, redirect } from "next/navigation";

import ProjectEditorClient from "../../ProjectEditorClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRight } from "@/lib/permissions";
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

  const canEdit =
    project.ownerId === user.id || hasRight(user, "resources:edit");
  if (!canEdit) {
    redirect(buildProjectPath(project));
  }

  return <ProjectEditorClient mode="edit" initialProject={project} />;
}
