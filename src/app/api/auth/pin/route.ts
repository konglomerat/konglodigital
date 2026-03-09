import { NextResponse } from "next/server";

import {
  PIN_COOKIE_MAX_AGE_SECONDS,
  PIN_COOKIE_NAME,
  PIN_COOKIE_VALUE,
  isValidViewerPin,
} from "@/lib/pin-access";

type VerifyPinBody = {
  pin?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as VerifyPinBody;
  const pin = String(body.pin ?? "").trim();
  const configuredPin = process.env.VIEW_ONLY_PIN;

  if (!configuredPin) {
    return NextResponse.json(
      { error: "VIEW_ONLY_PIN is not configured." },
      { status: 500 },
    );
  }

  if (!isValidViewerPin(pin, configuredPin)) {
    return NextResponse.json({ error: "Invalid PIN." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: PIN_COOKIE_NAME,
    value: PIN_COOKIE_VALUE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PIN_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
