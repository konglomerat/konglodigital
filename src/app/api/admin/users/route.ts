import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listMemberProfilesByUserIds } from "@/lib/member-profiles";
import {
	getUserRole,
	normalizeUserRole,
	USER_ROLES,
	userCanAccessModule,
} from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import {
	getUserAccessByUserId,
	getUserRightsFromAppMetadata,
	listUserAccessByUserIds,
	syncUserAccessToAuthMetadata,
	upsertUserAccess,
} from "@/lib/user-access";

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
		const [memberProfilesByUserId, userAccessByUserId] = await Promise.all([
			listMemberProfilesByUserIds(adminClient, userIds),
			listUserAccessByUserIds(adminClient, userIds),
		]);

		const profiles = users
			.filter((user) => Boolean(user.email_confirmed_at || user.last_sign_in_at))
			.map((user) => {
				const memberProfile = memberProfilesByUserId.get(user.id);
				const access = userAccessByUserId.get(user.id);

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
					role: access?.role ?? "member",
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
		const message = error instanceof Error ? error.message : "Profile konnten nicht geladen werden.";
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

		if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
			return createForbiddenResponse();
		}

		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const userId = typeof body.userId === "string" ? body.userId.trim() : "";
		const requestedRole =
			typeof body.role === "string" ? body.role.trim().toLowerCase() : "";

		if (!userId) {
			return NextResponse.json({ error: "Benutzer fehlt." }, { status: 400 });
		}

		if (!USER_ROLES.includes(requestedRole as (typeof USER_ROLES)[number])) {
			return NextResponse.json({ error: "Ungueltige Rolle." }, { status: 400 });
		}

		const role = normalizeUserRole(requestedRole);

		const adminClient = createSupabaseAdminClient();
		const { data: userLookup, error: userLookupError } = await adminClient.auth.admin.getUserById(
			userId,
		);

		if (userLookupError) {
			throw userLookupError;
		}

		const currentAccess = await getUserAccessByUserId(adminClient, userId);
		const updatedAccess = await upsertUserAccess(adminClient, {
			userId,
			role,
			rights: currentAccess?.rights ?? getUserRightsFromAppMetadata(userLookup.user),
		});
		await syncUserAccessToAuthMetadata(adminClient, userLookup.user, updatedAccess);

		return NextResponse.json({
			profile: {
				id: userLookup.user.id,
				role: updatedAccess.role,
			},
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Rolle konnte nicht gespeichert werden.";
		return NextResponse.json({ error: message }, { status: 500 });
	}
};