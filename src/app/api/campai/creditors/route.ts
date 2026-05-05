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

// ── Creditor type returned by Campai ────────────────────────────────────
type CampaiCreditor = {
	_id?: string;
	account?: number;
	name?: string;
	paymentMethodType?: string | null;
	creditTransfer?: {
		accountHolderName?: string;
		iban?: string;
		bic?: string;
	} | null;
};

/**
 * GET /api/campai/creditors?q=<searchTerm>
 *
 * Lists creditors via POST /{org}/{mandate}/finance/accounts/creditors/list
 * using the `searchTerm` filter. Returns `{ suggestions }`.
 */
export const GET = async (request: NextRequest) => {
	const { supabase } = createSupabaseRouteClient(request);
	const { data } = await supabase.auth.getUser();

	if (!data.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
		const account = request.nextUrl.searchParams.get("account")?.trim() ?? "";

		if (account) {
			const response = await fetch(
				`https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/creditors/${account}`,
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
							"Kreditorendaten konnten nicht geladen werden.",
					},
					{ status: response.status },
				);
			}

			const creditor = (await response.json().catch(() => null)) as CampaiCreditor | null;

			return NextResponse.json({
				creditor: creditor
					? {
						account: creditor.account ?? null,
						name: creditor.name ?? "",
						paymentMethodType: creditor.paymentMethodType ?? null,
						creditTransfer: creditor.creditTransfer ?? null,
					}
					: null,
			});
		}

		const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
		if (q.length < 2) {
			return NextResponse.json({ suggestions: [] });
		}

		const url = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/creditors/list`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": apiKey,
			},
			body: JSON.stringify({
				searchTerm: q,
				limit: 15,
			}),
		});

		if (!response.ok) {
			return NextResponse.json({ suggestions: [] });
		}

		const result = (await response.json().catch(() => ({
			creditors: [],
		}))) as { creditors?: CampaiCreditor[] };

		const suggestions = (result.creditors ?? [])
			.filter(
				(c): c is CampaiCreditor & { name: string; account: number } =>
					typeof c.name === "string" && typeof c.account === "number",
			)
			.map((c) => ({
				name: c.name,
				account: c.account,
			}));

		return NextResponse.json({ suggestions });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
};

/**
 * POST /api/campai/creditors
 *
 * Creates a creditor in Campai via
 *   POST /{organizationId}/{mandateId}/finance/accounts/creditors
 * with optional payment method (cash / creditTransfer + IBAN).
 *
 * Body:
 *   name:              string   (required)
 *   type:              "business" | "person" (default "business")
 *   details:           string   (optional)
 *   paymentMethodType: "cash" | "creditTransfer" | null
 *   iban:              string   (required when creditTransfer)
 *   accountHolderName: string   (required when creditTransfer)
 *   kontoinhaber:      string   (legacy alias for accountHolderName)
 *   bic:               string   (optional)
 *
 * Returns: { creditorId, account, name }
 */
export const POST = async (request: NextRequest) => {
	const { supabase } = createSupabaseRouteClient(request);
	const { data } = await supabase.auth.getUser();

	if (!data.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

		const body = (await request.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;

		const name =
			typeof body.name === "string" ? body.name.trim() : "";
		const type =
			body.type === "person" ? "person" : "business";
		const details =
			typeof body.details === "string" ? body.details.trim() : "";
		const paymentMethodType =
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
		const bic =
			typeof body.bic === "string" ? body.bic.trim() : "";

		if (!name) {
			return NextResponse.json(
				{ error: "Name ist erforderlich." },
				{ status: 400 },
			);
		}

		if (paymentMethodType === "creditTransfer") {
			if (!iban || !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) {
				return NextResponse.json(
					{ error: "Bitte eine gültige IBAN angeben." },
					{ status: 400 },
				);
			}
			if (!accountHolderName) {
				return NextResponse.json(
					{ error: "Kontoinhaber ist erforderlich." },
					{ status: 400 },
				);
			}
		}

		const payload: Record<string, unknown> = {
			type,
			name: name.slice(0, 81),
		};

		if (details) {
			payload.details = details;
		}

		if (paymentMethodType) {
			payload.paymentMethodType = paymentMethodType;
		}

		if (paymentMethodType === "creditTransfer") {
			payload.creditTransfer = {
				accountHolderName: accountHolderName.slice(0, 80),
				iban,
				bic: bic || "",
			};
		}

		const url = `https://cloud.campai.com/api/${organizationId}/${mandateId}/finance/accounts/creditors`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": apiKey,
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			return NextResponse.json(
				{
					error:
						errorBody ||
						`Campai-Kreditor konnte nicht erstellt werden (HTTP ${response.status}).`,
				},
				{ status: response.status },
			);
		}

		const result = (await response.json().catch(() => null)) as {
			_id?: string;
			account?: number;
			name?: string;
		} | null;

		return NextResponse.json({
			creditorId: result?._id ?? null,
			account: result?.account ?? null,
			name: result?.name ?? name,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
};
