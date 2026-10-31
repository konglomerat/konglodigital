import { redirect } from "next/navigation";
import { INVENTORY_URL, inventoryEditUrl } from "@/lib/openinventory-contract";
export default async function Page({ searchParams }: { searchParams: Promise<{ resourceId?: string }> }) {
  const { resourceId } = await searchParams;
  redirect(resourceId ? inventoryEditUrl(resourceId) : `${INVENTORY_URL}/konglomerat/map`);
}
