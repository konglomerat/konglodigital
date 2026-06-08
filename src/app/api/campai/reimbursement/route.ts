import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCampaiBookingTags } from "@/lib/campai-booking-tags";
import { uploadCampaiReceiptFile } from "@/lib/campai-receipt-files";
import {
	addCampaiReceiptNotes,
	buildCampaiReceiptCreatorNote,
} from "@/lib/campai-receipt-notes";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const requiredEnv = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} environment variable.`);
	}
	return value;
};

const compactText = (value: unknown, fallback = "") => {
	if (typeof value !== "string") {
		return fallback;
	}
	const text = value.replace(/\s+/g, " ").trim();
	return text || fallback;
};

const parseDate = (value: unknown): string => {
	if (typeof value !== "string" || !value.trim()) {
		return new Date().toISOString().slice(0, 10);
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return new Date().toISOString().slice(0, 10);
	}
	return parsed.toISOString().slice(0, 10);
};

const parseEuroToCents = (value: unknown): number | null => {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (!/^\d+(,\d{1,2})?$/.test(trimmed)) {
		return null;
	}
	const normalized = trimmed.replace(",", ".");
	const parsed = Number.parseFloat(normalized);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return null;
	}
	return Math.round(parsed * 100);
};

const parsePositiveInt = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isInteger(value) && value > 0) {
		return value;
	}

	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		const parsed = Number.parseInt(value, 10);
		return parsed > 0 ? parsed : null;
	}

	return null;
};

const extractId = (payload: unknown): string | null => {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	const record = payload as Record<string, unknown>;
	const direct = record._id ?? record.id ?? record.fileId ?? record.documentId;
	if (typeof direct === "string" && direct.trim()) {
		return direct;
	}

	const data = record.data;
	if (data && typeof data === "object") {
		return extractId(data);
	}

	const result = record.result;
	if (result && typeof result === "object") {
		return extractId(result);
	}

	return null;
};

export const POST = async (request: NextRequest) => {
	const { supabase } = createSupabaseRouteClient(request);
	const { data } = await supabase.auth.getUser();

	if (!data.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const tags = buildCampaiBookingTags(data.user);
	const memberProfile = await getMemberProfileByUserId(supabase, data.user.id);
	const creatorNote = buildCampaiReceiptCreatorNote({
		user: data.user,
		memberProfile,
	});

	try {
		const apiKey = requiredEnv("CAMPAI_API_KEY");
		const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
		const mandateId = requiredEnv("CAMPAI_MANDATE_ID");
		const creditorAccount = Number.parseInt(
			requiredEnv("CAMPAI_CREDITOR_ACCOUNT"),
			10,
		);
		const expenseAccount = Number.parseInt(
			process.env.CAMPAI_EXPENSE_ACCOUNT ?? requiredEnv("CAMPAI_ACCOUNT"),
			10,
		);
		const accountName = compactText(process.env.CAMPAI_ACCOUNT_NAME, "");

		if (!Number.isInteger(expenseAccount) || expenseAccount <= 0) {
			return NextResponse.json(
				{ error: "Invalid CAMPAI_EXPENSE_ACCOUNT/CAMPAI_ACCOUNT" },
				{ status: 500 },
			);
		}

		if (!Number.isInteger(creditorAccount) || creditorAccount <= 0) {
			return NextResponse.json(
				{ error: "Invalid CAMPAI_CREDITOR_ACCOUNT" },
				{ status: 500 },
			);
		}

		const body = (await request.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;

		const betreff = compactText(body.betreff);
		const internalNote = compactText(body.internalNote ?? body.notiz);
		const belegdatum = parseDate(body.belegdatum);
		const bereitsBeglichen = body.bereitsBeglichen === true;
		const empfaengerName = compactText(body.empfaengerName);
		const empfaengerEmail = compactText(body.empfaengerEmail);
		const clientCreditorAccount =
			typeof body.creditorAccount === "number" && body.creditorAccount > 0
				? body.creditorAccount
				: null;

		if (!betreff) {
			return NextResponse.json(
				{ error: "Bitte einen Betreff angeben." },
				{ status: 400 },
			);
		}

		const rawPositions = Array.isArray(body.positions)
			? (body.positions as Array<Record<string, unknown>>)
			: [];

		const positions = rawPositions
			.map((position) => {
				const positionAmount = parseEuroToCents(position.betragEuro);
				// Vom Nutzer gewählte Kostenstelle ist der Werkbereich/das Projekt
				// (costCenter2). costCenter1 wird – wie bei Einnahme/Ausgabe –
				// fest auf 9 gesetzt.
				const positionCostCenter2 = parsePositiveInt(position.kostenstelle);
				if (!positionAmount || !positionCostCenter2) {
					return null;
				}

				const positionDescription = compactText(position.beschreibung);

				return {
					account: expenseAccount,
					amount: positionAmount,
					description: (positionDescription || betreff).slice(0, 140),
					costCenter1: 9,
					costCenter2: positionCostCenter2,
				};
			})
			.filter((position): position is NonNullable<typeof position> =>
				Boolean(position),
			);

		if (positions.length === 0) {
			return NextResponse.json(
				{
					error:
						"Bitte mindestens eine gültige Position mit Betrag und Kostenstelle angeben.",
				},
				{ status: 400 },
			);
		}

		const totalAmountCents = positions.reduce(
			(sum, position) => sum + position.amount,
			0,
		);

		const receiptFileBase64 = compactText(body.receiptFileBase64);
		const receiptFileName = compactText(body.receiptFileName, "beleg.dat");
		const receiptFileContentType = compactText(
			body.receiptFileContentType,
			"application/octet-stream",
		);

		if (!receiptFileBase64) {
			return NextResponse.json(
				{ error: "Bitte eine Belegdatei hochladen." },
				{ status: 400 },
			);
		}

		const uploadResult = await uploadCampaiReceiptFile({
			apiKey,
			baseUrl: `https://cloud.campai.com/api/${organizationId}/${mandateId}`,
			fileBase64: receiptFileBase64,
			fileName: receiptFileName,
			fileContentType: receiptFileContentType,
		});

		// Upload-Fehler ist nicht fatal: Der Beleg wird trotzdem (ohne Dateianhang)
		// angelegt und der Nutzer per uploadWarning informiert.
		if (!uploadResult.receiptFileId) {
			console.error(
				"[reimbursement] Campai file upload failed:",
				uploadResult.uploadWarning,
			);
		}

		const receiptFileId = uploadResult.receiptFileId;

		const timeStamp = new Date()
			.toISOString()
			.replace(/[-:TZ.]/g, "")
			.slice(0, 14);
		const receiptNumber = `RR-${timeStamp}`.slice(0, 30);

		const description = [betreff]
			.filter(Boolean)
			.join(" | ")
			.slice(0, 140);

		// ── Kreditor-Konto: vom Client übergeben oder Fallback auf Env ──
		const finalCreditorAccount = clientCreditorAccount ?? creditorAccount;
		const finalAccountName = clientCreditorAccount
			? (empfaengerName || accountName)
			: accountName;

		const payload: Record<string, unknown> = {
			account: finalCreditorAccount,
			receiptNumber,
			isNet: false,
			totalGrossAmount: totalAmountCents,
			receiptDate: belegdatum,
			dueDate: belegdatum,
			accountName: finalAccountName,
			description,
			refund: false,
			positions,
			tags,
			queueReceiptDocument: false,
			electronic: false,
		};

		if (receiptFileId) {
			payload.receiptFileId = receiptFileId;
			payload.receiptFileName = receiptFileName;
		}

		const response = await fetch(
			`https://cloud.campai.com/api/${organizationId}/${mandateId}/receipts/expense`,
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

		const dataResponse = (await response.json().catch(() => null)) as
			| Record<string, unknown>
			| null;
		const receiptId = extractId(dataResponse);

		let noteWarning: string | undefined;
		if (!receiptId) {
			noteWarning = "Beleg erstellt, aber Campai hat keine Receipt-ID zurückgegeben – Campai-Notizen konnten nicht angelegt werden.";
		} else {
			const noteResult = await addCampaiReceiptNotes({
				apiKey,
				organizationId,
				mandateId,
				receiptId,
				contents: [creatorNote, internalNote],
			});

			if (!noteResult.ok) {
				noteWarning = `Beleg erstellt, aber die Campai-Notizen konnten nicht gespeichert werden: ${noteResult.error}`;
			}
		}

		const warnings = [uploadResult.uploadWarning, noteWarning].filter(Boolean);

		return NextResponse.json({
			id: receiptId ?? null,
			uploadWarning: warnings.length > 0 ? warnings.join(" ") : undefined,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
};
