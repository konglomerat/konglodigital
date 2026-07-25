import { redirect } from "next/navigation";

import PageWrapper from "../../components/PageWrapper";
import PrinterAccessCodesClient from "./PrinterAccessCodesClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PrinterAccessCodesPage() {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?redirectedFrom=/printers/access-codes");
  }

  return (
    <PageWrapper>
      <PrinterAccessCodesClient />
    </PageWrapper>
  );
}
