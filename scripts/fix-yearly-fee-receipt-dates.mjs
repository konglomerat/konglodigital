#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const PAGE_SIZE = 100;
const INVOICE_TYPE = "invoiceMembershipFee";
const TARGET_OLD_RECEIPT_DATE = "2026-04-11";
const TARGET_DESCRIPTION_NEEDLE = "Jahresbeitrag 2026";
const NEW_RECEIPT_DATE = "2026-01-05";
const NEW_DUE_DATE = "2026-02-04";

const SERVER_MANAGED_FIELDS = [
  "_id",
  "mandate",
  "createdAt",
  "updatedAt",
  "accountNameSort",
  "receiptNumberSort",
  "paidAt",
  "payments",
  "paymentStatus",
  "paymentDifference",
  "totalAmountLeftToPay",
  "totalGrossAmount",
  "canceledAt",
  "canceledBy",
  "canceledReason",
  "archivedAt",
  "archivedBy",
  "debtorBlockedAt",
  "debtorBlockedBy",
  "receiptDispatchStatus",
  "receiptFile",
  "receiptFileName",
  "type",
  "depositUsages",
  "electronic",
  "supplierNumber",
];

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { apply: false, limit: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--limit") {
      const value = Number.parseInt(args[i + 1], 10);
      if (Number.isInteger(value) && value > 0) options.limit = value;
      i += 1;
    } else if (arg.startsWith("--limit=")) {
      const value = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isInteger(value) && value > 0) options.limit = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

const isoDateMatches = (value, targetIsoDate) =>
  typeof value === "string" && value.startsWith(targetIsoDate);

const fetchReceiptsPage = async (config, offset) => {
  const response = await fetch(
    `${config.baseUrl}/finance/receipts/list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify({
        sort: { receiptDate: "desc" },
        limit: PAGE_SIZE,
        offset,
        returnCount: true,
        type: "invoice",
        invoiceType: INVOICE_TYPE,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to list receipts (offset=${offset}): ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
};

const buildUpdatePayload = (receipt) => {
  const payload = { ...receipt };
  for (const field of SERVER_MANAGED_FIELDS) delete payload[field];
  payload.receiptDate = NEW_RECEIPT_DATE;
  payload.dueDate = NEW_DUE_DATE;
  return payload;
};

const updateReceipt = async (config, receipt) => {
  const response = await fetch(
    `${config.baseUrl}/receipts/invoice/${receipt._id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify(buildUpdatePayload(receipt)),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Update failed for ${receipt._id}: ${response.status} ${await response.text()}`,
    );
  }
};

const main = async () => {
  const options = parseArgs();
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const config = {
    apiKey: requiredEnv("CAMPAI_API_KEY"),
    baseUrl: `https://cloud.campai.com/api/${organizationId}/${mandateId}`,
  };

  console.log(
    `Mode: ${options.apply ? "APPLY (writes updates)" : "DRY-RUN (no changes)"}`,
  );
  console.log(
    `Match: receiptDate ${TARGET_OLD_RECEIPT_DATE} + description contains "${TARGET_DESCRIPTION_NEEDLE}"`,
  );
  console.log(`Set: receiptDate ${NEW_RECEIPT_DATE}, dueDate ${NEW_DUE_DATE}`);
  if (options.limit) console.log(`Limit: ${options.limit} matches`);

  let offset = 0;
  let totalScanned = 0;
  const matches = [];

  while (true) {
    const page = await fetchReceiptsPage(config, offset);
    const receipts = Array.isArray(page.receipts) ? page.receipts : [];
    if (receipts.length === 0) break;

    for (const receipt of receipts) {
      totalScanned += 1;
      if (receipt.invoiceType !== INVOICE_TYPE) continue;
      if (!isoDateMatches(receipt.receiptDate, TARGET_OLD_RECEIPT_DATE)) continue;
      const firstPosition = Array.isArray(receipt.positions)
        ? receipt.positions[0]
        : null;
      const description = firstPosition?.description ?? "";
      if (!description.includes(TARGET_DESCRIPTION_NEEDLE)) continue;
      matches.push({
        id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        accountName: receipt.accountName,
        oldReceiptDate: receipt.receiptDate,
        oldDueDate: receipt.dueDate,
        description,
        receipt,
      });
      if (options.limit && matches.length >= options.limit) break;
    }

    if (options.limit && matches.length >= options.limit) break;
    if (receipts.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log("");
  console.log(`Scanned: ${totalScanned}`);
  console.log(`Matches: ${matches.length}`);
  console.log("");

  for (const item of matches) {
    console.log(
      `  ${item.receiptNumber ?? item.id}  ${item.accountName ?? ""}  "${item.description}"`,
    );
    console.log(
      `    receiptDate ${item.oldReceiptDate} → ${NEW_RECEIPT_DATE}`,
    );
    console.log(
      `    dueDate     ${item.oldDueDate} → ${NEW_DUE_DATE}`,
    );
  }

  if (!options.apply) {
    console.log("");
    console.log("Dry-run complete. Re-run with --apply to write changes.");
    return;
  }

  console.log("");
  console.log("Applying updates…");
  let updated = 0;
  let failed = 0;
  const failures = [];
  for (const item of matches) {
    try {
      await updateReceipt(config, item.receipt);
      updated += 1;
      console.log(`  ✔ ${item.receiptNumber ?? item.id}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: item.id, receiptNumber: item.receiptNumber, message });
      console.error(`  ✘ ${item.receiptNumber ?? item.id}: ${message}`);
    }
  }
  console.log("");
  console.log(`Updated: ${updated}, Failed: ${failed}`);
  if (failures.length > 0) {
    console.log("");
    console.log("Failed receipts:");
    for (const f of failures) {
      console.log(`  ${f.receiptNumber ?? "?"}  ${f.id}`);
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
