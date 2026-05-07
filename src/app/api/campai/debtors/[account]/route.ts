import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
	buildDebtorPayload,
	type CampaiDebtorPaymentMethodType,
} from "@/lib/campai-debtors";

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

export const POST = async (
	request: NextRequest,
	context: { params: Promise<{ account: string }> },
) => {
	const user = await ensureAuthenticatedUser(request);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { account } = await context.params;
	const debtorAccount = account.trim();
	if (!debtorAccount) {
		return NextResponse.json(
			{ error: "Debitorennummer fehlt." },
			{ status: 400 },
		);
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

		const body = (await request.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		const parsed = buildDebtorPayload(body);
		if (!parsed.ok) {
			return NextResponse.json(
				{ error: parsed.error },
				{ status: parsed.status },
			);
		}

		const lookupResponse = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors/${encodeURIComponent(debtorAccount)}`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				cache: "no-store",
			},
		);

		if (!lookupResponse.ok) {
			const errorBody = await lookupResponse.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Debitor konnte nicht gefunden werden (HTTP ${lookupResponse.status}).`,
				},
				{ status: lookupResponse.status },
			);
		}

		const existing = (await lookupResponse.json().catch(() => null)) as {
			_id?: string;
		} | null;

		if (!existing?._id) {
			return NextResponse.json(
				{ error: "Debitor wurde gefunden, aber hat keine gültige ID." },
				{ status: 502 },
			);
		}

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors/${encodeURIComponent(existing._id)}`,
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
						`Campai-Debitor konnte nicht aktualisiert werden (HTTP ${response.status}).`,
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

		const fallbackAccount = Number(debtorAccount);
		return NextResponse.json({
			account:
				result?.account ??
				(Number.isFinite(fallbackAccount) ? fallbackAccount : null),
			name: result?.name ?? parsed.name,
			paymentMethodType:
				result?.paymentMethodType ?? parsed.paymentMethodType,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
