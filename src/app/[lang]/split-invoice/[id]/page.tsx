"use client";

import { use } from "react";
import MaterialbestellungPage from "../MaterialbestellungPage";

export default function MaterialbestellungDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <MaterialbestellungPage initialOrderId={id} />;
}
