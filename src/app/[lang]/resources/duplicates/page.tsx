import { redirect } from "next/navigation";
import { INVENTORY_URL } from "@/lib/openinventory-contract";
export default function Page() { redirect(`${INVENTORY_URL}/konglomerat/duplicates`); }
