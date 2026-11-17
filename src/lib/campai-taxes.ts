// Steuerschlüssel aus dem Campai-Kontenplan (accountingPlan.taxes).
// "vat" ist Umsatzsteuer (US19 …), "pre" Vorsteuer (VS19 …).

export type CampaiTax = {
  code: string;
  rate: number;
  type: string;
  builtIn: boolean;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const fetchCampaiTaxes = async (params?: {
  apiKey?: string;
  organizationId?: string;
}): Promise<CampaiTax[]> => {
  const apiKey = params?.apiKey ?? requiredEnv("CAMPAI_API_KEY");
  const organizationId =
    params?.organizationId ?? requiredEnv("CAMPAI_ORGANIZATION_ID");

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/finance/accounting/accountingPlan`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Campai-Steuerschlüssel konnten nicht geladen werden (${response.status}).`,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    taxes?: Array<Record<string, unknown>>;
  } | null;
  const taxes = Array.isArray(payload?.taxes) ? payload.taxes : [];

  return taxes.flatMap((tax) => {
    const code = typeof tax.code === "string" ? tax.code.trim() : "";
    if (!code || typeof tax.rate !== "number") return [];
    return [
      {
        code,
        rate: tax.rate,
        type: typeof tax.type === "string" ? tax.type : "",
        builtIn: tax.builtIn === true,
      },
    ];
  });
};
