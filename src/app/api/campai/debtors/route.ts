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

type CampaiDebtorPaymentMethodType =
	| "sepaCreditTransfer"
	| "sepaDirectDebit"
	| "cash"
	| "online";

type CampaiDebtor = {
	_id?: string;
	account?: number;
	name?: string;
	email?: string;
	paymentMethodType?: CampaiDebtorPaymentMethodType | null;
	address?: AddressPayload | null;
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

const normalizeAddress = (value: unknown): AddressPayload | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	const typed = value as Record<string, unknown>;
	const country = typeof typed.country === "string" ? typed.country.trim() : "DE";
	const zip = typeof typed.zip === "string" ? typed.zip.trim() : "";
	const city = typeof typed.city === "string" ? typed.city.trim() : "";
	const addressLine =
		typeof typed.addressLine === "string" ? typed.addressLine.trim() : "";
	const details1 =
		typeof typed.details1 === "string" ? typed.details1.trim() : "";
	const details2 =
		typeof typed.details2 === "string" ? typed.details2.trim() : "";
	const state = typeof typed.state === "string" ? typed.state.trim() : "";

	if (!zip || !city || !addressLine) {
		return null;
	}

	return {
		country: country || "DE",
		zip,
		city,
		addressLine,
		state: state || undefined,
		details1: details1 || undefined,
		details2: details2 || undefined,
	};
};

const normalizePaymentMethodType = (
	value: unknown,
): CampaiDebtorPaymentMethodType | null => {
	if (
		value === "sepaCreditTransfer" ||
		value === "sepaDirectDebit" ||
		value === "cash" ||
		value === "online"
	) {
		return value;
	}
	return null;
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
						paymentMethodType: debtor.paymentMethodType ?? null,
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
		const name = typeof body.name === "string" ? body.name.trim() : "";
		const type = body.type === "person" ? "person" : "business";
		const address = normalizeAddress(body.address);
		const email = typeof body.email === "string" ? body.email.trim() : "";
		const paymentMethodType = normalizePaymentMethodType(body.paymentMethodType);
		const receiptSendMethod =
			body.receiptSendMethod === "email"
				? "email"
				: body.receiptSendMethod === "postal"
					? "postal"
					: "none";

		if (!name) {
			return NextResponse.json(
				{ error: "Name ist erforderlich." },
				{ status: 400 },
			);
		}

		if (!address) {
			return NextResponse.json(
				{
					error:
						"Für neue Debitoren werden Straße/Adresse, PLZ und Stadt benötigt.",
				},
				{ status: 400 },
			);
		}

		if (paymentMethodType === "sepaDirectDebit") {
			return NextResponse.json(
				{
					error:
						"SEPA-Lastschrift muss in Campai mit Mandat gepflegt werden und kann hier nicht inline angelegt werden.",
				},
				{ status: 400 },
			);
		}

		const payload: Record<string, unknown> = {
			type,
			name: name.slice(0, 81),
			address,
			email,
			receiptSendMethod: email
				? receiptSendMethod === "none"
					? "email"
					: receiptSendMethod
				: receiptSendMethod,
		};

		if (paymentMethodType) {
			payload.paymentMethodType = paymentMethodType;
		}

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/debtors`,
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
			debtorId: result?._id ?? null,
			account: result?.account ?? null,
			name: result?.name ?? name,
			paymentMethodType: result?.paymentMethodType ?? paymentMethodType,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
