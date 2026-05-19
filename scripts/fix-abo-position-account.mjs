#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const PAGE_SIZE = 100;
const INVOICE_TYPE = "invoiceMembershipFee";
const POSITION_NEEDLE = "Abo";
const OLD_ACCOUNT = 40000;
const NEW_ACCOUNT = 40001;

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

const findMatchingPositions = (positions) => {
  if (!Array.isArray(positions)) return [];
  const result = [];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const description = position?.description;
    if (typeof description !== "string") continue;
    if (!description.includes(POSITION_NEEDLE)) continue;
    if (position.account !== OLD_ACCOUNT) continue;
    result.push({ index, position });
  }
  return result;
};

const buildUpdatePayload = (receipt, positionIndexesToFix) => {
  const payload = { ...receipt };
  for (const field of SERVER_MANAGED_FIELDS) delete payload[field];
  payload.positions = receipt.positions.map((position, index) =>
    positionIndexesToFix.has(index)
      ? { ...position, account: NEW_ACCOUNT }
      : position,
  );
  return payload;
};

const updateReceipt = async (config, receipt, positionIndexesToFix) => {
  const response = await fetch(
    `${config.baseUrl}/receipts/invoice/${receipt._id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify(buildUpdatePayload(receipt, positionIndexesToFix)),
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
    `Match: invoiceMembershipFee position.description contains "${POSITION_NEEDLE}" AND account === ${OLD_ACCOUNT}`,
  );
  console.log(`Set: account ${OLD_ACCOUNT} → ${NEW_ACCOUNT}`);
  if (options.limit) console.log(`Limit: ${options.limit} receipts`);

  let offset = 0;
  let totalScanned = 0;
  let totalPositionsChanged = 0;
  const matches = [];

  while (true) {
    const page = await fetchReceiptsPage(config, offset);
    const receipts = Array.isArray(page.receipts) ? page.receipts : [];
    if (receipts.length === 0) break;

    for (const receipt of receipts) {
      totalScanned += 1;
      if (receipt.invoiceType !== INVOICE_TYPE) continue;
      const matching = findMatchingPositions(receipt.positions);
      if (matching.length === 0) continue;
      totalPositionsChanged += matching.length;
      matches.push({
        id: receipt._id,
        receiptNumber: receipt.receiptNumber,
        accountName: receipt.accountName,
        matching,
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
  console.log(`Receipts to update: ${matches.length}`);
  console.log(`Positions to update: ${totalPositionsChanged}`);
  console.log("");

  for (const item of matches) {
    console.log(
      `  ${item.receiptNumber ?? item.id}  ${item.accountName ?? ""}`,
    );
    for (const { index, position } of item.matching) {
      console.log(
        `    [${index}] "${position.description}"  account ${OLD_ACCOUNT} → ${NEW_ACCOUNT}`,
      );
    }
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
    const indexes = new Set(item.matching.map((entry) => entry.index));
    try {
      await updateReceipt(config, item.receipt, indexes);
      updated += 1;
      console.log(`  ✔ ${item.receiptNumber ?? item.id}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        id: item.id,
        receiptNumber: item.receiptNumber,
        message,
      });
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
