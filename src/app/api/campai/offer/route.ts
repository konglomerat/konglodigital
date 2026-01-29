import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

type AddressPayload = {
  country: string;
  state?: string;
  zip: string;
  city: string;
  addressLine: string;
  details1?: string;
  details2?: string;
};

type PositionPayload = {
  description: string;
  quantity: number;
  unitAmount: number;
  details?: string;
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    address?: AddressPayload;
    email?: string;
    title?: string;
    intro?: string;
    note?: string;
    description?: string;
    positions?: PositionPayload[];
    isNet?: boolean;
  };

  if (!body.address || !body.positions || body.positions.length === 0) {
    return NextResponse.json(
      { error: "Missing address or positions." },
      { status: 400 },
    );
  }

  const positions = body.positions.filter((position) => position.unitAmount > 0);
  if (positions.length === 0) {
    return NextResponse.json(
      { error: "All positions have zero amount." },
      { status: 400 },
    );
  }

  const apiKey = requiredEnv("CAMPAI_API_KEY");
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
  const account = Number.parseInt(requiredEnv("CAMPAI_ACCOUNT"), 10);
  const accountName = process.env.CAMPAI_ACCOUNT_NAME ?? "";
  const dueDays = Number.parseInt(process.env.CAMPAI_DUE_DAYS ?? "14", 10);
  const costCenter1 = requiredEnv("CAMPAI_COST_CENTER1");

  if (Number.isNaN(account)) {
    return NextResponse.json(
      { error: "Invalid CAMPAI_ACCOUNT" },
      { status: 500 },
    );
  }

  const receiptDate = formatDate(new Date());
  const dueDate = formatDate(
    new Date(Date.now() + Math.max(1, dueDays) * 86400000),
  );

  const payload = {
    draft: true,
    address: {
      ...body.address,
      country: String(body.address.country),
    },
    title: body.title ?? "3D Print Offer",
    intro: body.intro ?? "Thank you for your print order.",
    account,
    isNet: body.isNet ?? true,
    receiptDate,
    dueDate,
    email: body.email ?? "",
    sendMethod: "none",
    accountName,
    receiptNumber: null,
    customerType: "debtor",
    customerNumber: [],
    description: body.description ?? "",
    offerStatus: "open",
    note: body.note ?? "",
    discount: 0,
    discountType: "%",
    positions: positions.map((position) => ({
      unitAmount: position.unitAmount,
      discount: 0,
      description: position.description,
      account,
      details: position.details ?? "",
      quantity: position.quantity,
      unit: "",
      costCenter1,
      costCenter2: null,
      taxCode: null,
    })),
    doNotSendReceipt: true,
    queueReceiptDocument: false,
    tags: [],
  };

  const response = await fetch(
    `https://cloud.campai.com/api/${organizationId}/${mandateId}/receipts/offer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    return NextResponse.json(
      { error: errorBody || "Campai request failed." },
      { status: response.status },
    );
  }

  const dataResponse = (await response.json()) as { _id?: string };
  return NextResponse.json({ id: dataResponse._id ?? null });
};
