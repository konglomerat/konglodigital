import { NextResponse } from "next/server";
// Retired write path: newsletter variants now live in newsletter drafts.
// The authoritative excerpt is edited only in Payload's posts collection.
export const PATCH = async () => NextResponse.json(
  { error: "Beitragstexte werden jetzt im Payload-CMS bearbeitet. Bitte lade den Newsletter-Editor neu." },
  { status: 410 },
);
