import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listAllActiveCampaiContacts } from "@/app/api/campai/contacts/route";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const dynamic = "force-dynamic";

const createForbiddenResponse = () =>
	NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
	NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const GET = async (request: NextRequest) => {
	try {
		const { supabase } = createSupabaseRouteClient(request);
		const { data } = await supabase.auth.getUser();

		if (!data.user) {
			return createUnauthorizedResponse();
		}

		if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
			return createForbiddenResponse();
		}

		const contacts = await listAllActiveCampaiContacts();

		const rows = contacts
			.map((contact) => ({
				id: contact.id,
				name: contact.name,
				email: contact.email,
				memberNumber: contact.memberNumber,
				tags: contact.tags,
				types: contact.types,
				entryAt: contact.entryAt,
			}))
			.sort((left, right) => {
				const leftTime = left.entryAt ? Date.parse(left.entryAt) : NaN;
				const rightTime = right.entryAt ? Date.parse(right.entryAt) : NaN;
				const leftValid = Number.isFinite(leftTime);
				const rightValid = Number.isFinite(rightTime);
				if (leftValid && rightValid) {
					return rightTime - leftTime;
				}
				if (leftValid) return -1;
				if (rightValid) return 1;
				return left.name.localeCompare(right.name, "de-DE");
			});

		return NextResponse.json({ contacts: rows });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Campai-Kontakte konnten nicht geladen werden.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
};
