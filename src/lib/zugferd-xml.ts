import { XMLParser } from "fast-xml-parser";

import {
  type MaterialInvoiceParseResult,
} from "./material-invoice";
import { normalizeUnitCode } from "./unit-codes";

// CII XML always uses dot as decimal separator.
const parseAmount = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Extracts the embedded CII XML from a ZUGFeRD/Factur-X PDF.
 * ZUGFeRD 2 PDFs store the XML as an uncompressed attached file,
 * so the bytes appear verbatim in the PDF buffer.
 */
export const extractXmlFromPdf = (buffer: Buffer): string | null => {
  const startMarker = Buffer.from("<?xml", "ascii");
  const endMarker = Buffer.from("</rsm:CrossIndustryInvoice>", "ascii");
  const start = buffer.indexOf(startMarker);

  if (start === -1) {
    return null;
  }

  const end = buffer.indexOf(endMarker, start);

  if (end === -1) {
    return null;
  }

  const xmlBuffer = buffer.subarray(start, end + endMarker.length);
  const xmlHeader = xmlBuffer.subarray(0, Math.min(xmlBuffer.length, 256)).toString("ascii");
  const declaredEncoding = xmlHeader.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
  const encodings = [declaredEncoding, "utf-8", "iso-8859-1"].filter(
    (encoding): encoding is string => Boolean(encoding),
  );

  for (const encoding of encodings) {
    try {
      return new TextDecoder(encoding).decode(xmlBuffer);
    } catch {
      continue;
    }
  }

  return xmlBuffer.toString("latin1");
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // keep everything as strings for predictable conversion
  trimValues: true,
});

// Elements with attributes are wrapped as { "@_attr": "...", "#text": "value" }.
// This helper extracts just the text/value regardless of whether attrs are present.
const normalize = (s: string): string => s.trim().replace(/\s+/g, " ");

const val = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    const t = (v as Record<string, unknown>)["#text"];
    return typeof t === "string" ? normalize(t) : typeof t === "number" ? String(t) : "";
  }
  return typeof v === "string" ? normalize(v) : typeof v === "number" ? String(v) : "";
};

const arr = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v != null ? [v] : [];

// ZUGFeRD date format 102 = YYYYMMDD
const parseDate = (v: unknown): string => {
  const s = val(v);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
};

/**
 * Parses a ZUGFeRD 2 / Factur-X CII XML string into a MaterialInvoiceParseResult.
 * All positions land in a single participant "Alle Positionen" for manual distribution.
 */
export const parseCiiXml = (xml: string): MaterialInvoiceParseResult => {
  const doc = parser.parse(xml);
  const root =
    (doc["rsm:CrossIndustryInvoice"] as Record<string, unknown>) ??
    (doc["CrossIndustryInvoice"] as Record<string, unknown>) ??
    {};

  const exchangedDoc = (root["rsm:ExchangedDocument"] as Record<string, unknown>) ?? {};
  const transaction =
    (root["rsm:SupplyChainTradeTransaction"] as Record<string, unknown>) ?? {};
  const agreement =
    (transaction["ram:ApplicableHeaderTradeAgreement"] as Record<string, unknown>) ?? {};
  const settlement =
    (transaction["ram:ApplicableHeaderTradeSettlement"] as Record<string, unknown>) ?? {};

  const supplierName = val(
    (agreement["ram:SellerTradeParty"] as Record<string, unknown>)?.["ram:Name"],
  );
  const supplierInvoiceNumber = val(exchangedDoc["ram:ID"]);
  const supplierInvoiceDate = parseDate(
    (exchangedDoc["ram:IssueDateTime"] as Record<string, unknown>)?.[
      "udt:DateTimeString"
    ],
  );
  const currency = val(settlement["ram:InvoiceCurrencyCode"]) || "EUR";

  const summation =
    (settlement[
      "ram:SpecifiedTradeSettlementHeaderMonetarySummation"
    ] as Record<string, unknown>) ?? {};
  const totalAmountEuro = parseAmount(val(summation["ram:GrandTotalAmount"]));

  // Shipping = header-level charges with ChargeIndicator = true
  const charges = arr(settlement["ram:SpecifiedTradeAllowanceCharge"]);
  const shippingAmountEuro = charges.reduce((sum: number, c: unknown) => {
    const charge = c as Record<string, unknown>;
    const indicator = val(
      (charge["ram:ChargeIndicator"] as Record<string, unknown>)?.["udt:Indicator"],
    );
    if (indicator !== "true") return sum;
    return sum + parseAmount(val(charge["ram:ActualAmount"]));
  }, 0);

  // Line items → positions
  const lineItems = arr(transaction["ram:IncludedSupplyChainTradeLineItem"]);
  const positions = lineItems.map((item: unknown, index: number) => {
    const line = item as Record<string, unknown>;
    const product = (line["ram:SpecifiedTradeProduct"] as Record<string, unknown>) ?? {};
    const lineSettlement =
      (line["ram:SpecifiedLineTradeSettlement"] as Record<string, unknown>) ?? {};
    const lineDelivery =
      (line["ram:SpecifiedLineTradeDelivery"] as Record<string, unknown>) ?? {};
    const lineAgreement =
      (line["ram:SpecifiedLineTradeAgreement"] as Record<string, unknown>) ?? {};

    const description = val(product["ram:Name"]) || `Position ${index + 1}`;
    const articleDescription = val(product["ram:Description"]) || undefined;

    const billedQtyRaw = lineDelivery["ram:BilledQuantity"];
    const billedQtyObj = billedQtyRaw as Record<string, unknown>;
    const quantity = Number(val(billedQtyRaw)) || 0;
    const unit =
      typeof billedQtyRaw === "object" && billedQtyRaw !== null
        ? normalizeUnitCode(val(billedQtyObj["@_unitCode"]) || "Stk")
        : "Stk";

    const netPrice = (
      lineAgreement["ram:NetPriceProductTradePrice"] as Record<string, unknown>
    )?.["ram:ChargeAmount"];
    const unitAmountEuro = parseAmount(val(netPrice));

    const lineTotalRaw = (
      lineSettlement[
        "ram:SpecifiedTradeSettlementLineMonetarySummation"
      ] as Record<string, unknown>
    )?.["ram:LineTotalAmount"];
    const lineTotalEuro = parseAmount(val(lineTotalRaw));

    const taxEntry = lineSettlement["ram:ApplicableTradeTax"];
    const taxObj = (Array.isArray(taxEntry) ? taxEntry[0] : taxEntry) as
      | Record<string, unknown>
      | undefined;
    // CII uses "19.00" / "7.00"
    const taxRateNum = Math.round(parseFloat(val(taxObj?.["ram:RateApplicablePercent"])));
    const taxRate: 0 | 7 | 19 = taxRateNum === 7 ? 7 : taxRateNum === 19 ? 19 : 0;

    return {
      id: `pos-${index + 1}`,
      description,
      articleDescription,
      quantity,
      unit,
      unitAmountEuro,
      taxRate,
      lineTotalEuro,
    };
  });

  return {
    supplierName,
    supplierInvoiceNumber,
    supplierInvoiceDate,
    currency,
    shippingAmountEuro,
    totalAmountEuro,
    participants: [
      {
        id: "unassigned",
        name: "Alle Positionen",
        positions,
      },
    ],
    issues: [],
  };
};
