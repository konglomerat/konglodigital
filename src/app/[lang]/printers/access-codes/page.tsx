import { redirect } from "next/navigation";

import PrinterAccessCodesClient from "./PrinterAccessCodesClient";
import { getServerSession } from "@/lib/server-session";

export default async function PrinterAccessCodesPage() {
  const { user } = await getServerSession();

  if (!user) {
    redirect("/login?redirectedFrom=/printers/access-codes");
  }

  return <PrinterAccessCodesClient />;
}
