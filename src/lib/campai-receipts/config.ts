import { compactText } from "./parsers";

export type CampaiConfig = {
  apiKey: string;
  organizationId: string;
  mandateId: string;
  baseUrl: string;
  accountName: string;
  uploadEndpointOverride: string;
};

export const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
};

export const parseAccountEnv = (
  label: string,
  raw: string | undefined,
): number => {
  if (!raw) throw new Error(`Missing ${label} environment variable.`);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}.`);
  }
  return parsed;
};

export const loadCampaiConfig = (): CampaiConfig => {
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  return {
    apiKey: requiredEnv("CAMPAI_API_KEY"),
    organizationId,
    mandateId,
    baseUrl: `https://cloud.campai.com/api/${organizationId}/${mandateId}`,
    accountName: process.env.CAMPAI_ACCOUNT_NAME ?? "",
    uploadEndpointOverride: compactText(
      process.env.CAMPAI_RECEIPT_FILE_UPLOAD_ENDPOINT,
    ),
  };
};

export const loadExpenseAccount = (): number =>
  parseAccountEnv(
    "CAMPAI_EXPENSE_ACCOUNT/CAMPAI_ACCOUNT",
    process.env.CAMPAI_EXPENSE_ACCOUNT ?? process.env.CAMPAI_ACCOUNT,
  );

export const loadRevenueAccount = (): number =>
  parseAccountEnv(
    "CAMPAI_REVENUE_ACCOUNT/CAMPAI_INCOME_ACCOUNT/CAMPAI_ACCOUNT",
    process.env.CAMPAI_REVENUE_ACCOUNT ??
      process.env.CAMPAI_INCOME_ACCOUNT ??
      process.env.CAMPAI_ACCOUNT,
  );

export const loadInvoiceAccount = (): number =>
  parseAccountEnv(
    "CAMPAI_INVOICE_ACCOUNT/CAMPAI_ACCOUNT",
    process.env.CAMPAI_INVOICE_ACCOUNT ?? process.env.CAMPAI_ACCOUNT,
  );
