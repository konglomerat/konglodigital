import { NextResponse } from "next/server";

import { getPayloadCmsBaseUrl } from "@/lib/payload-cms";

export const runtime = "nodejs";

export const POST = async (request: Request) => {
  const cmsBaseUrl = getPayloadCmsBaseUrl();
  if (!cmsBaseUrl) {
    return NextResponse.json(
      { error: "Das CMS ist noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Ungültige Formulardaten." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`${cmsBaseUrl}/api/form-submissions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data && typeof data === "object" && "errors" in data
              ? "Das Formular wurde vom CMS abgelehnt."
              : "Das Formular konnte nicht gesendet werden.",
        },
        { status: response.status },
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Das CMS ist momentan nicht erreichbar." },
      { status: 502 },
    );
  }
};
