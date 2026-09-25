// Die Belege des angemeldeten Mitglieds für die Kontoseite.
//
// Welches Debitorenkonto gemeint ist, bestimmt allein der Server aus dem
// Campai-Kontakt des Mitglieds (`campai-own-debtor`) — die Anfrage trägt
// keine Kontonummer mehr, damit niemand fremde Belege abrufen kann.
//
// `finance/receipts/list` validiert seine Eingabe strikt (additionalProperties:
// false) und kennt nur `sort`, `limit`, `offset`, `returnCount`, `searchTerm`,
// `hasReceipt`, `view`, `userFilter` und `selection`. Ein `account`-Feld
// beantwortet Campai mit 400 „Unbekannter Schlüssel", und `userFilter` wird
// stillschweigend ignoriert.
//
// Nach Debitor filtert deshalb `searchTerm` mit der Kontonummer: der Volltext
// trifft die Debitorennummer des Belegs. Weil `searchTerm` unscharf sucht,
// wird danach noch exakt auf `account` geprüft, bevor etwas die Route verlässt.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  extractInvoices,
  normalizeInvoice,
  type InvoicePayload,
  type RawInvoice,
} from "@/lib/campai-invoices";
import { fetchOwnDebtorAccount } from "@/lib/campai-own-debtor";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

export type AccountInvoicesResponse = {
  invoices: InvoicePayload[];
};

// Obergrenze von `limit` bei Campai.
const CAMPAI_PAGE_SIZE = 100;
const CAMPAI_MAX_PAGES = 20;
const MAX_INVOICES = 100;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const accountOf = (item: RawInvoice) => {
  const value = item.account;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let account: number | null;
  try {
    account = await fetchOwnDebtorAccount(supabase, data.user.id);
  } catch {
    return NextResponse.json(
      { error: "Campai-Belege konnten nicht geladen werden." },
      { status: 502 },
    );
  }

  if (account === null) {
    return NextResponse.json<AccountInvoicesResponse>({ invoices: [] });
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const endpoint = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/receipts/list`;

  // Campai füllt die Seiten ungefiltert — die Route blättert, bis genug
  // Belege dieses Kontos beisammen sind oder die Liste zu Ende ist.
  const collected: RawInvoice[] = [];
  let offset = 0;

  for (let page = 0; page < CAMPAI_MAX_PAGES; page += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        sort: { receiptDate: "desc" },
        searchTerm: String(account),
        limit: CAMPAI_PAGE_SIZE,
        offset,
        returnCount: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Campai-Belege konnten nicht geladen werden." },
        { status: 502 },
      );
    }

    const pageItems = extractInvoices(await response.json());
    collected.push(...pageItems.filter((item) => accountOf(item) === account));

    if (
      pageItems.length < CAMPAI_PAGE_SIZE ||
      collected.length >= MAX_INVOICES
    ) {
      break;
    }

    offset += pageItems.length;
  }

  const invoices = collected
    .slice(0, MAX_INVOICES)
    .map((item) => normalizeInvoice(item))
    .filter((item): item is InvoicePayload => Boolean(item));

  return NextResponse.json<AccountInvoicesResponse>({ invoices });
};
