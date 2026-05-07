import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
	buildDebtorPayload,
	type CampaiDebtorAddressPayload,
	type CampaiDebtorPaymentMethodType,
} from "@/lib/campai-debtors";

type CampaiDebtor = {
	_id?: string;
	account?: number;
	name?: string;
	email?: string;
	type?: "person" | "business";
	paymentMethodType?: CampaiDebtorPaymentMethodType | null;
	address?: CampaiDebtorAddressPayload | null;
	receiptSendMethod?: "email" | "postal" | "none";
};

const requiredEnv = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} environment variable.`);
	}
	return value;
};

const ensureAuthenticatedUser = async (request: NextRequest) => {
	const { supabase } = createSupabaseRouteClient(request);
	const { data } = await supabase.auth.getUser();
	return data.user ?? null;
};

export const GET = async (request: NextRequest) => {
	const user = await ensureAuthenticatedUser(request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
		const account = request.nextUrl.searchParams.get("account")?.trim() ?? "";

		if (account) {
			const response = await fetch(
				`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors/${account}`,
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
						"X-API-Key": apiKey,
					},
					cache: "no-store",
				},
			);

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "");
				return NextResponse.json(
					{
						error:
							errorBody ||
							"Debitorendaten konnten nicht geladen werden.",
					},
					{ status: response.status },
				);
			}

			const debtor = (await response.json().catch(() => null)) as CampaiDebtor | null;

			return NextResponse.json({
				debtor: debtor
					? {
						account: debtor.account ?? null,
						name: debtor.name ?? "",
						email: debtor.email ?? "",
						type: debtor.type ?? null,
						paymentMethodType: debtor.paymentMethodType ?? null,
						receiptSendMethod: debtor.receiptSendMethod ?? null,
						address: debtor.address ?? null,
					}
					: null,
			});
		}

		const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
		if (q.length < 2) {
			return NextResponse.json({ suggestions: [] });
		}

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors/list`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({
					searchTerm: q,
					limit: 15,
				}),
				cache: "no-store",
			},
		);

		if (!response.ok) {
			return NextResponse.json({ suggestions: [] });
		}

		const result = (await response.json().catch(() => ({
			debtors: [],
		}))) as { debtors?: CampaiDebtor[] };

		const suggestions = (result.debtors ?? [])
			.filter(
				(item): item is CampaiDebtor & { name: string; account: number } =>
					typeof item.name === "string" && typeof item.account === "number",
			)
			.map((item) => ({
				name: item.name,
				account: item.account,
				paymentMethodType: item.paymentMethodType ?? null,
			}));

		return NextResponse.json({ suggestions });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};

export const POST = async (request: NextRequest) => {
	const user = await ensureAuthenticatedUser(request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const parsed = buildDebtorPayload(body);
		if (!parsed.ok) {
			return NextResponse.json({ error: parsed.error }, { status: parsed.status });
		}

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify(parsed.payload),
			},
		);

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Campai-Debitor konnte nicht erstellt werden (HTTP ${response.status}).`,
				},
				{ status: response.status },
			);
		}

		const result = (await response.json().catch(() => null)) as {
			_id?: string;
			account?: number;
			name?: string;
			paymentMethodType?: CampaiDebtorPaymentMethodType | null;
		} | null;

		return NextResponse.json({
			account: result?.account ?? null,
			name: result?.name ?? parsed.name,
			paymentMethodType: result?.paymentMethodType ?? parsed.paymentMethodType,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
