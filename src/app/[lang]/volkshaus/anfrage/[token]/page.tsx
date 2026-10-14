import type { Metadata } from "next";

import CustomerBookingPortal from "./CustomerBookingPortal";

export const metadata: Metadata = {
  title: "Meine Raumanfrage · Volkshaus Cotta",
  robots: { index: false, follow: false },
};

export default async function VolkshausRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CustomerBookingPortal token={token} />;
}
