import { redirect } from "next/navigation";
import { INVENTORY_HOME } from "@/lib/openinventory-contract";
export default function Page() { redirect(`${INVENTORY_HOME}/new`); }
