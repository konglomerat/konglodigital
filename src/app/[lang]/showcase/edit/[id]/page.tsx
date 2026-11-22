import { notFound, redirect } from "next/navigation";
import { getShowcaseCmsUrl, loadShowcaseByIdentifier } from "../../showcase-data";
export default async function EditShowcasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showcase = await loadShowcaseByIdentifier(id);
  if (!showcase) notFound();
  redirect(getShowcaseCmsUrl(showcase.cmsId));
}
