import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

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

type CreditorPaymentMethodType = "cash" | "creditTransfer" | null;

type ParsedUpdateBody =
	| { ok: false; status: number; error: string }
	| {
			ok: true;
			detailsPayload: {
				name: string;
				details: string;
				supplierNumber: string;
			};
			paymentPayload: {
				paymentMethodType: CreditorPaymentMethodType;
				creditTransfer:
					| { accountHolderName: string; iban: string; bic: string }
					| null;
			};
			name: string;
	  };

const parseUpdateBody = (body: Record<string, unknown>): ParsedUpdateBody => {
	const name = typeof body.name === "string" ? body.name.trim() : "";
	const details = typeof body.details === "string" ? body.details.trim() : "";
	const supplierNumber =
		typeof body.supplierNumber === "string" ? body.supplierNumber.trim() : "";
	const paymentMethodType: CreditorPaymentMethodType =
		body.paymentMethodType === "cash"
			? "cash"
			: body.paymentMethodType === "creditTransfer"
				? "creditTransfer"
				: null;
	const iban =
		typeof body.iban === "string"
			? body.iban.replace(/\s+/g, "").toUpperCase()
			: "";
	const accountHolderName =
		typeof body.accountHolderName === "string"
			? body.accountHolderName.trim()
			: typeof body.kontoinhaber === "string"
				? body.kontoinhaber.trim()
				: "";
	const bic = typeof body.bic === "string" ? body.bic.trim() : "";

	if (!name) {
		return { ok: false, status: 400, error: "Name ist erforderlich." };
	}

	if (paymentMethodType === "creditTransfer") {
		if (!iban || !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) {
			return {
				ok: false,
				status: 400,
				error: "Bitte eine gültige IBAN angeben.",
			};
		}
		if (!accountHolderName) {
			return {
				ok: false,
				status: 400,
				error: "Kontoinhaber ist erforderlich.",
			};
		}
	}

	return {
		ok: true,
		detailsPayload: {
			name: name.slice(0, 81),
			details,
			supplierNumber,
		},
		paymentPayload: {
			paymentMethodType,
			creditTransfer:
				paymentMethodType === "creditTransfer"
					? {
							accountHolderName: accountHolderName.slice(0, 80),
							iban,
							bic,
						}
					: null,
		},
		name,
	};
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
	const creditorAccount = account.trim();
	if (!creditorAccount) {
		return NextResponse.json(
			{ error: "Kreditor-Kontonummer fehlt." },
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
		const parsed = parseUpdateBody(body);
		if (!parsed.ok) {
			return NextResponse.json(
				{ error: parsed.error },
				{ status: parsed.status },
			);
		}

		const baseUrl = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/creditors`;
		const headers = {
			"Content-Type": "application/json",
			"X-API-Key": apiKey,
		};

		const lookupResponse = await fetch(
			`${baseUrl}/${encodeURIComponent(creditorAccount)}`,
			{ method: "GET", headers, cache: "no-store" },
		);

		if (!lookupResponse.ok) {
			const errorBody = await lookupResponse.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Kreditor konnte nicht gefunden werden (HTTP ${lookupResponse.status}).`,
				},
				{ status: lookupResponse.status },
			);
		}

		const existing = (await lookupResponse.json().catch(() => null)) as {
			_id?: string;
			account?: number;
			name?: string;
		} | null;

		if (!existing?._id) {
			return NextResponse.json(
				{ error: "Kreditor wurde gefunden, aber hat keine gültige ID." },
				{ status: 502 },
			);
		}

		const creditorId = encodeURIComponent(existing._id);

		const detailsResponse = await fetch(`${baseUrl}/${creditorId}/details`, {
			method: "POST",
			headers,
			body: JSON.stringify(parsed.detailsPayload),
		});

		if (!detailsResponse.ok) {
			const errorBody = await detailsResponse.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Kreditor-Stammdaten konnten nicht aktualisiert werden (HTTP ${detailsResponse.status}).`,
				},
				{ status: detailsResponse.status },
			);
		}

		const paymentResponse = await fetch(`${baseUrl}/${creditorId}/payment`, {
			method: "POST",
			headers,
			body: JSON.stringify(parsed.paymentPayload),
		});

		if (!paymentResponse.ok) {
			const errorBody = await paymentResponse.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Kreditor-Zahlungsdaten konnten nicht aktualisiert werden (HTTP ${paymentResponse.status}).`,
				},
				{ status: paymentResponse.status },
			);
		}

		const fallbackAccount = Number(creditorAccount);
		return NextResponse.json({
			creditorId: existing._id,
			account:
				existing.account ??
				(Number.isFinite(fallbackAccount) ? fallbackAccount : null),
			name: parsed.name,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		);
	}
};
