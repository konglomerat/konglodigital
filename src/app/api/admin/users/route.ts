import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
	listMemberProfilesByUserIds,
	setMemberProfileCampaiLink,
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

const toLinkResponse = (
	userId: string,
	memberProfile: Awaited<ReturnType<typeof setMemberProfileCampaiLink>>,
) =>
	NextResponse.json({
		profile: {
			id: userId,
			campaiContactId: memberProfile.campaiContactId,
			campaiMemberNumber: memberProfile.campaiMemberNumber,
			campaiDebtorAccount: memberProfile.campaiDebtorAccount,
			campaiName: memberProfile.campaiName,
		},
	});

// Verknüpfen, neu verknüpfen und lösen: `campaiContactId` als ID setzt den
// Kontakt, `null` löst die Verknüpfung.
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

		if (body.campaiContactId === null) {
			const memberProfile = await setMemberProfileCampaiLink(
				adminClient,
				userLookup.user.id,
				null,
			);
			return toLinkResponse(userLookup.user.id, memberProfile);
		}

		const requestedCampaiContactId =
			typeof body.campaiContactId === "string"
				? body.campaiContactId.trim()
				: "";

		if (!requestedCampaiContactId) {
			return NextResponse.json(
				{ error: "Keine Änderung angegeben." },
				{ status: 400 },
			);
		}

		const contact = await getCampaiActiveMemberContactById(
			requestedCampaiContactId,
		);

		if (!contact) {
			return NextResponse.json(
				{ error: "Campai-Konto konnte nicht gefunden werden." },
				{ status: 404 },
			);
		}

		// Ein Kontakt gehört zu genau einem Konto (eindeutiger Index) — sonst
		// scheitert das Speichern mit einer Datenbankmeldung statt einer Erklärung.
		const { data: otherLinks, error: otherLinksError } = await adminClient
			.from("member_profiles")
			.select("user_id")
			.eq("campai_contact_id", contact.id)
			.neq("user_id", userLookup.user.id)
			.limit(1);

		if (otherLinksError) {
			throw otherLinksError;
		}

		if (otherLinks && otherLinks.length > 0) {
			const { data: otherUser } = await adminClient.auth.admin.getUserById(
				otherLinks[0].user_id as string,
			);
			return NextResponse.json(
				{
					error: `Dieser Campai-Kontakt ist schon mit ${
						otherUser?.user?.email ?? "einem anderen Konto"
					} verknüpft. Löse diese Verknüpfung zuerst.`,
				},
				{ status: 409 },
			);
		}

		const profileData = buildCampaiProfileData(contact);
		const memberProfile = await setMemberProfileCampaiLink(
			adminClient,
			userLookup.user.id,
			profileData,
		);

		return toLinkResponse(userLookup.user.id, memberProfile);
	} catch (error) {
		const message = getErrorMessage(
			error,
			"Änderung konnte nicht gespeichert werden.",
		);
		return NextResponse.json({ error: message }, { status: 500 });
	}
};

// Löscht das Konto in Supabase. Profil, Rollen und eigene Einträge fallen per
// Fremdschlüssel mit weg oder verlieren nur den Verweis; der Campai-Kontakt
// bleibt unberührt.
export const DELETE = async (request: NextRequest) => {
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

		if (!userId) {
			return NextResponse.json({ error: "Benutzer fehlt." }, { status: 400 });
		}

		if (userId === data.user.id) {
			return NextResponse.json(
				{ error: "Das eigene Konto kannst du hier nicht löschen." },
				{ status: 400 },
			);
		}

		const adminClient = createSupabaseAdminClient();
		const { error } = await adminClient.auth.admin.deleteUser(userId);

		if (error) {
			throw error;
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		const message = getErrorMessage(
			error,
			"Konto konnte nicht gelöscht werden.",
		);
		return NextResponse.json({ error: message }, { status: 500 });
	}
};
