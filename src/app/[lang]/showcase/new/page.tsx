import { redirect } from "next/navigation";

import ShowcaseEditorClient from "../ShowcaseEditorClient";
import { getServerAccess, getServerSession } from "@/lib/server-session";
import { can } from "@/lib/access/access";

export const dynamic = "force-dynamic";

export default async function NewShowcasePage() {
  const { user } = await getServerSession();

  if (!user) {
    redirect("/login?redirectedFrom=/showcase/new");
  }

  const canManagePrivacy = can(await getServerAccess(), "showcase.private");

  return <ShowcaseEditorClient mode="create" canManagePrivacy={canManagePrivacy} />;
}
