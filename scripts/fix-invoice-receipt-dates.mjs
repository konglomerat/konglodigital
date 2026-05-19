#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const PAGE_SIZE = 100;
const INVOICE_TYPE = "invoiceMembershipFee";

const TARGET_DATES = [
  { needle: "Januar 2026", date: "2026-01-05", dueDate: "2026-01-19" },
  { needle: "Februar 2026", date: "2026-02-02", dueDate: "2026-02-16" },
  { needle: "März 2026", date: "2026-03-02", dueDate: "2026-03-16" },
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

const findTarget = (description) => {
  if (typeof description !== "string" || !description.trim()) return null;
  for (const entry of TARGET_DATES) {
    if (description.includes(entry.needle)) return entry;
  }
  return null;
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

const buildUpdatePayload = (receipt, newReceiptDate, newDueDate) => {
  const payload = { ...receipt };
  for (const field of SERVER_MANAGED_FIELDS) delete payload[field];
  payload.receiptDate = newReceiptDate;
  payload.dueDate = newDueDate;
  return payload;
};

const updateReceipt = async (config, receipt, newReceiptDate, newDueDate) => {
  const response = await fetch(
    `${config.baseUrl}/receipts/invoice/${receipt._id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify(
        buildUpdatePayload(receipt, newReceiptDate, newDueDate),
      ),
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
  if (options.limit) console.log(`Limit: ${options.limit} mismatches`);

  let offset = 0;
  let totalScanned = 0;
  let totalSkippedNoMonth = 0;
  let totalAlreadyCorrect = 0;
  const mismatches = [];

  while (true) {
    const page = await fetchReceiptsPage(config, offset);
    const receipts = Array.isArray(page.receipts) ? page.receipts : [];
    if (receipts.length === 0) break;

    for (const receipt of receipts) {
      totalScanned += 1;
      if (receipt.invoiceType !== INVOICE_TYPE) continue;
      const firstPosition = Array.isArray(receipt.positions)
        ? receipt.positions[0]
        : null;
      const description = firstPosition?.description;
      const target = findTarget(description);
      if (!target) {
        totalSkippedNoMonth += 1;
        continue;
      }
      if (
        isoDateMatches(receipt.receiptDate, target.date) &&
        isoDateMatches(receipt.dueDate, target.dueDate)
      ) {
        totalAlreadyCorrect += 1;
        continue;
      }
      mismatches.push({
        id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        accountName: receipt.accountName,
        oldReceiptDate: receipt.receiptDate,
        oldDueDate: receipt.dueDate,
        newReceiptDate: target.date,
        newDueDate: target.dueDate,
        description,
        receipt,
      });
      if (options.limit && mismatches.length >= options.limit) break;
    }

    if (options.limit && mismatches.length >= options.limit) break;
    if (receipts.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log("");
  console.log(`Scanned: ${totalScanned}`);
  console.log(`Already correct: ${totalAlreadyCorrect}`);
  console.log(`Skipped (no target month in description): ${totalSkippedNoMonth}`);
  console.log(`Mismatches: ${mismatches.length}`);
  console.log("");

  for (const item of mismatches) {
    console.log(
      `  ${item.receiptNumber ?? item.id}  ${item.accountName ?? ""}  "${item.description ?? ""}"`,
    );
    console.log(
      `    receiptDate ${item.oldReceiptDate} → ${item.newReceiptDate}`,
    );
    console.log(
      `    dueDate     ${item.oldDueDate} → ${item.newDueDate}`,
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
  for (const item of mismatches) {
    try {
      await updateReceipt(
        config,
        item.receipt,
        item.newReceiptDate,
        item.newDueDate,
      );
      updated += 1;
      console.log(`  ✔ ${item.receiptNumber ?? item.id}`);
    } catch (error) {
      failed += 1;
      console.error(
        `  ✘ ${item.receiptNumber ?? item.id}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  console.log("");
  console.log(`Updated: ${updated}, Failed: ${failed}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
