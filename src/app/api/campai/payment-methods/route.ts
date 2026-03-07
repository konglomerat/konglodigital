import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
	CAMPAI_PAYMENT_METHOD_TYPES,
	type CampaiPaymentMethodType,
	formatCampaiPaymentMethodLabel,
	isCampaiPaymentMethodType,
} from "@/lib/campai-payment-methods";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type PaymentMethodOption = {
	value: CampaiPaymentMethodType;
	label: string;
};

type FinanceSettingsResponse = {
	paymentMethods?: Record<string, Record<string, unknown> | null> | null;
};

const requiredEnv = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} environment variable.`);
	}
	return value;
};

const toPaymentMethodOption = (
	value: CampaiPaymentMethodType,
): PaymentMethodOption => ({
	value,
	label: formatCampaiPaymentMethodLabel(value),
});

const getPaymentMethodSortIndex = (value: CampaiPaymentMethodType) =>
	CAMPAI_PAYMENT_METHOD_TYPES.indexOf(value);

export const GET = async (request: NextRequest) => {
	const { supabase } = createSupabaseRouteClient(request);
	const { data } = await supabase.auth.getUser();
	if (!data.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/finance/settings`,
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
						errorBody || "Campai-Finanzeinstellungen konnten nicht geladen werden.",
				},
				{ status: response.status },
			);
		}

		const settings =
			(await response.json().catch(() => null)) as FinanceSettingsResponse | null;
		const configured = settings?.paymentMethods ?? {};

		const paymentMethods = Object.entries(configured)
			.filter(([, config]) => config !== null && config !== undefined)
			.map(([value]) => value)
			.filter(isCampaiPaymentMethodType)
			.sort((left, right) => {
				return getPaymentMethodSortIndex(left) - getPaymentMethodSortIndex(right);
			})
			.map(toPaymentMethodOption);

		return NextResponse.json({ paymentMethods });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
