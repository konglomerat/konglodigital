import type { Metadata } from "next";

import NeuesMitgliedClient from "./NeuesMitgliedClient";

export const metadata: Metadata = {
  title: "Neues Mitglied",
};

export default function VorstandNeuesMitgliedPage() {
  return <NeuesMitgliedClient />;
}
