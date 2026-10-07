import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
	listMemberProfilesByUserIds,
	upsertMemberProfile,
} from "@/lib/member-profiles";
import { can } from "@/lib/access/access";
import { listAssignments, listScopes } from "@/lib/access/assignments";
import { describeAssignment } from "@/lib/access/labels";
import { loadUserAccess } from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

import {
	buildCampaiProfileData,
	getCampaiActiveMemberContactById,
} from "@/lib/campai-contact-directory";

const getErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error) {
		const message = error.message.trim();
		if (message) {
			return message;
		}
	}

	if (error && typeof error === "object" && "message" in error) {
		const message = error.message;
		if (typeof message === "string" && message.trim()) {
			return message;
		}
	}

	return fallback;
};

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

		if (!can(await loadUserAccess(supabase, data.user), "users.manage")) {
			return createForbiddenResponse();
		}

		const adminClient = createSupabaseAdminClient();
		const { data: usersPage, error } = await adminClient.auth.admin.listUsers({
			page: 1,
			perPage: 1000,
		});

		if (error) {
			throw error;
		}

		const users = usersPage.users ?? [];
		const userIds = users.map((user) => user.id);
		const [memberProfilesByUserId, assignments, scopes] = await Promise.all([
			listMemberProfilesByUserIds(adminClient, userIds),
			listAssignments(adminClient),
			listScopes(adminClient),
		]);

		const profiles = users
			.filter((user) => Boolean(user.email_confirmed_at || user.last_sign_in_at))
			.map((user) => {
				const memberProfile = memberProfilesByUserId.get(user.id);

				return {
					id: user.id,
					email: user.email ?? "",
					createdAt: user.created_at ?? null,
					lastSignInAt: user.last_sign_in_at ?? null,
					emailConfirmedAt: user.email_confirmed_at ?? null,
					firstName:
						typeof user.user_metadata?.first_name === "string"
							? user.user_metadata.first_name
							: null,
					lastName:
						typeof user.user_metadata?.last_name === "string"
							? user.user_metadata.last_name
							: null,
					campaiContactId: memberProfile?.campaiContactId ?? null,
					campaiMemberNumber: memberProfile?.campaiMemberNumber ?? null,
					campaiDebtorAccount: memberProfile?.campaiDebtorAccount ?? null,
					campaiName: memberProfile?.campaiName ?? null,
					roleLabels: assignments
						.filter((assignment) => assignment.userId === user.id)
						.map((assignment) => describeAssignment(assignment, scopes)),
				};
			})
			.sort((left, right) => {
				const rightTime = Date.parse(right.createdAt ?? "") || 0;
				const leftTime = Date.parse(left.createdAt ?? "") || 0;
				return rightTime - leftTime;
			});

		return NextResponse.json({
			profiles,
		});
	} catch (error) {
		const message = getErrorMessage(
			error,
			"Profile konnten nicht geladen werden.",
		);
		return NextResponse.json({ error: message }, { status: 500 });
	}
};

export const PATCH = async (request: NextRequest) => {
	try {
		const { supabase } = createSupabaseRouteClient(request);
		const { data } = await supabase.auth.getUser();

		if (!data.user) {
			return createUnauthorizedResponse();
		}

		if (!can(await loadUserAccess(supabase, data.user), "users.manage")) {
			return createForbiddenResponse();
		}

		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const userId = typeof body.userId === "string" ? body.userId.trim() : "";
		const requestedCampaiContactId =
			typeof body.campaiContactId === "string"
				? body.campaiContactId.trim()
				: "";

		if (!userId) {
			return NextResponse.json({ error: "Benutzer fehlt." }, { status: 400 });
		}

		const adminClient = createSupabaseAdminClient();
		const { data: userLookup, error: userLookupError } = await adminClient.auth.admin.getUserById(
			userId,
		);

		if (userLookupError) {
			throw userLookupError;
		}

		if (requestedCampaiContactId) {
			const contact = await getCampaiActiveMemberContactById(
				requestedCampaiContactId,
			);

			if (!contact) {
				return NextResponse.json(
					{ error: "Campai-Konto konnte nicht gefunden werden." },
					{ status: 404 },
				);
			}

			const memberProfile = await upsertMemberProfile(
				adminClient,
				userId,
				buildCampaiProfileData(contact),
			);

			return NextResponse.json({
				profile: {
					id: userLookup.user.id,
					campaiContactId: memberProfile.campaiContactId,
					campaiMemberNumber: memberProfile.campaiMemberNumber,
					campaiDebtorAccount: memberProfile.campaiDebtorAccount,
					campaiName: memberProfile.campaiName,
				},
			});
		}

		return NextResponse.json(
			{ error: "Keine Aenderung angegeben." },
			{ status: 400 },
		);
	} catch (error) {
		const message = getErrorMessage(
			error,
			"Aenderung konnte nicht gespeichert werden.",
		);
		return NextResponse.json({ error: message }, { status: 500 });
	}
};
