import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  inviteUserByEmail: vi.fn(),
  updateUserById: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  findContact: vi.fn(),
  upsertMemberProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: mocks.listUsers,
        inviteUserByEmail: mocks.inviteUserByEmail,
        updateUserById: mocks.updateUserById,
      },
    },
  }),
}));

vi.mock("@/lib/supabase/route", () => ({
  createSupabaseRouteClient: () => ({
    supabase: { auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } },
    response: new Response(),
  }),
  withSupabaseCookies: (response: Response) => response,
}));

vi.mock("@/lib/campai-contact-directory", () => ({
  buildCampaiProfileData: () => ({}),
  getCampaiActiveMemberContactByEmail: mocks.findContact,
  splitCampaiContactName: () => ({ firstName: "Ada", lastName: "Muster" }),
}));

vi.mock("@/lib/member-profiles", () => ({
  upsertMemberProfile: mocks.upsertMemberProfile,
}));

import { POST } from "./route";

const post = (email: string) =>
  POST({
    url: "https://example.org/api/auth/register",
    json: async () => ({ email }),
  } as unknown as NextRequest);

const withUser = (user: Record<string, unknown>) =>
  mocks.listUsers.mockResolvedValue({
    data: { users: [{ id: "u1", email: "ada@example.org", ...user }] },
    error: null,
  });

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.updateUserById.mockResolvedValue({ error: null });
    mocks.findContact.mockResolvedValue({
      name: "Ada Muster",
      email: "ada@example.org",
      memberNumber: "1",
      debtorAccount: 1,
    });
  });

  it("sends the registration mail again for an open invite", async () => {
    const metadata = { first_name: "Ada", last_name: "Muster" };
    withUser({ user_metadata: metadata });

    const response = await post(" Ada@Example.org ");

    expect(response.status).toBe(200);
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith(
      "ada@example.org",
      expect.objectContaining({ data: metadata }),
    );
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("resends without a Campai match, e.g. to an alternative address", async () => {
    withUser({});
    mocks.findContact.mockResolvedValue(null);

    await post("ada@example.org");

    expect(mocks.inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(mocks.findContact).not.toHaveBeenCalled();
  });

  it("keeps the password reset for activated accounts", async () => {
    withUser({ email_confirmed_at: "2026-11-01T10:00:00Z" });

    await post("ada@example.org");

    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("does not reveal details when resending fails", async () => {
    withUser({});
    mocks.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "secret detail" },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await post("ada@example.org");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Registrierung konnte nicht gestartet werden.",
    });
    consoleError.mockRestore();
  });
});
