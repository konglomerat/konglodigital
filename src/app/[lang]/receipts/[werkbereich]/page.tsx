import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Notice from "@/components/knglmrt/Notice";
import { loadAllowedCostCenters } from "@/lib/access/server";
import {
  type BuchhaltungWerkbereich,
  findBuchhaltungWerkbereich,
  isCostCenterAllowed,
} from "@/lib/buchhaltung-werkbereiche";
import { getBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche-server";
import { getServerAccess, getServerSession } from "@/lib/server-session";

import { NoAccessNotice } from "../../admin/AccessGuard";
import WerkbereichReceipts from "../WerkbereichReceipts";

type WerkbereichPageProps = {
  params: Promise<{ werkbereich: string }>;
};

const resolveWerkbereich = async (
  params: WerkbereichPageProps["params"],
): Promise<BuchhaltungWerkbereich | null> => {
  const { werkbereich } = await params;
  const werkbereiche = await getBuchhaltungWerkbereiche();
  return findBuchhaltungWerkbereich(
    werkbereiche,
    decodeURIComponent(werkbereich),
  );
};

export const generateMetadata = async ({
  params,
}: WerkbereichPageProps): Promise<Metadata> => {
  const werkbereich = await resolveWerkbereich(params).catch(() => null);
  return { title: werkbereich ? `${werkbereich.label} · Buchhaltung` : "Buchhaltung" };
};

export default async function WerkbereichReceiptsPage({
  params,
}: WerkbereichPageProps) {
  let werkbereich: BuchhaltungWerkbereich | null;

  try {
    werkbereich = await resolveWerkbereich(params);
  } catch (error) {
    return (
      <div className="flex flex-col gap-4">
        <h2>Buchhaltung</h2>
        <Notice tone="rosa">
          {error instanceof Error
            ? error.message
            : "Werkbereiche konnten nicht geladen werden."}
        </Notice>
      </div>
    );
  }

  if (!werkbereich) {
    notFound();
  }

  const { supabase } = await getServerSession();
  const allowed = await loadAllowedCostCenters(
    supabase,
    await getServerAccess(),
    "receipts.view",
  );
  if (!isCostCenterAllowed(werkbereich.value, allowed)) {
    return <NoAccessNotice />;
  }

  return <WerkbereichReceipts key={werkbereich.value} werkbereich={werkbereich} />;
}
