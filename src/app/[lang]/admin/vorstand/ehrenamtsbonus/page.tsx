import type { Metadata } from "next";

import VorstandEhrenamtsbonusClient from "./VorstandEhrenamtsbonusClient";

export const metadata: Metadata = {
  title: "Anträge Ehrenamtsbonus",
};

export const dynamic = "force-dynamic";

export default function VorstandEhrenamtsbonusPage() {
  return <VorstandEhrenamtsbonusClient />;
}
