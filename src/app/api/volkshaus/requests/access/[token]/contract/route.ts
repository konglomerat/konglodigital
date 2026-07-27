import { NextResponse, type NextRequest } from "next/server";

import { getVolkshausBookingByToken } from "@/lib/volkshaus-booking-store";
import { createVolkshausContractPdf } from "@/lib/volkshaus-contract-pdf";

export const runtime = "nodejs";

export const GET = async (
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;
  const booking = await getVolkshausBookingByToken(token);
  if (!booking) {
    return NextResponse.json(
      { error: "Dieser Zugangslink ist ungültig oder abgelaufen." },
      { status: 404 },
    );
  }
  if (!booking.contractSnapshot) {
    return NextResponse.json(
      { error: "Für diese Anfrage wurde noch kein Vertrag erstellt." },
      { status: 409 },
    );
  }

  const bytes = await createVolkshausContractPdf(booking);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Nutzungsvereinbarung-${booking.referenceCode}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
};

