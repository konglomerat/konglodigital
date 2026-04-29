import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { extractXmlFromPdf, parseCiiXml } from "@/lib/zugferd-xml";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF-Datei ist erforderlich." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Die PDF ist leer oder groesser als 12 MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const xml = extractXmlFromPdf(buffer);

    if (!xml) {
      return NextResponse.json(
        {
          error:
            "Die PDF enthält keine eingebettete E-Rechnung (ZUGFeRD/Factur-X). Bitte lade eine ZUGFeRD-2-PDF hoch.",
        },
        { status: 422 },
      );
    }

    const parsed = parseCiiXml(xml);

    if (parsed.participants[0].positions.length === 0) {
      return NextResponse.json(
        { error: "Die E-Rechnung enthält keine Positionen." },
        { status: 422 },
      );
    }

    return NextResponse.json({ parsed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Rechnung konnte nicht verarbeitet werden.",
      },
      { status: 500 },
    );
  }
};
