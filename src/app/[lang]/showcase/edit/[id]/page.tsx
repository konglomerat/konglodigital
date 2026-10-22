import { notFound, redirect } from "next/navigation";

import ShowcaseEditorClient from "../../ShowcaseEditorClient";
import { getServerAccess, getServerSession } from "@/lib/server-session";
import { can } from "@/lib/access/access";
import { buildShowcasePath } from "@/lib/showcase-path";
import { loadShowcaseByIdentifier } from "../../showcase-data";

export const dynamic = "force-dynamic";

export default async function EditShowcasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getServerSession();

  if (!user) {
    redirect(`/login?redirectedFrom=/showcase/edit/${id}`);
  }

  const showcase = await loadShowcaseByIdentifier(id);
  if (!showcase) {
    notFound();
  }

  const access = await getServerAccess();
  const canManagePrivacy = can(access, "showcase.private");
  if (showcase.isPrivate && !canManagePrivacy) {
    notFound();
  }

  // Eigene Showcases darf jeder bearbeiten und löschen, fremde nur mit der
  // Rolle Showcase.
  const canEdit =
    showcase.ownerId === user.id || can(access, "showcase.edit");
  if (!canEdit) {
    redirect(buildShowcasePath(showcase));
  }
  const canDelete = canEdit;

  return (
    <ShowcaseEditorClient
      mode="edit"
      initialShowcase={showcase}
      canDelete={canDelete}
      canManagePrivacy={canManagePrivacy}
    />
  );
}
