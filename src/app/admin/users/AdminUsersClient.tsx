"use client";

import { useCallback, useEffect, useState } from "react";

import Button from "@/app/components/Button";

type ActiveProfile = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  campaiContactId: string | null;
  campaiMemberNumber: string | null;
  campaiDebtorAccount: number | null;
  campaiName: string | null;
  role: "admin" | "accounting" | "member";
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "accounting", label: "Accounting" },
  { value: "member", label: "Member" },
] as const;

const formatDateTime = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen.");
  }
  return data;
};

export default function AdminUsersClient() {
  const [profiles, setProfiles] = useState<ActiveProfile[]>([]);
  const [profileListError, setProfileListError] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [savingRoleForId, setSavingRoleForId] = useState<string | null>(null);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);
  const [testEmailSuccess, setTestEmailSuccess] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    setProfileListError(null);

    try {
      const data = await fetchJson<{ profiles: ActiveProfile[] }>(
        "/api/admin/users",
      );
      setProfiles(data.profiles ?? []);
    } catch (error) {
      setProfileListError(
        error instanceof Error
          ? error.message
          : "Profile konnten nicht geladen werden.",
      );
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const handleRoleChange = async (
    profileId: string,
    nextRole: ActiveProfile["role"],
  ) => {
    setSavingRoleForId(profileId);
    setRoleError(null);

    try {
      const data = await fetchJson<{
        profile: {
          id: string;
          role: ActiveProfile["role"];
        };
      }>("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profileId, role: nextRole }),
      });

      setProfiles((currentProfiles) =>
        currentProfiles.map((profile) =>
          profile.id === data.profile.id
            ? { ...profile, role: data.profile.role }
            : profile,
        ),
      );
    } catch (error) {
      setRoleError(
        error instanceof Error
          ? error.message
          : "Rolle konnte nicht gespeichert werden.",
      );
    } finally {
      setSavingRoleForId(null);
    }
  };

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailError(null);
    setTestEmailSuccess(null);

    try {
      await fetchJson<{ ok: true; recipient: string }>(
        "/api/admin/test-email",
        {
          method: "POST",
        },
      );

      setTestEmailSuccess(
        "Test-E-Mail wurde an robert@wirewire.de angestossen.",
      );
    } catch (error) {
      setTestEmailError(
        error instanceof Error
          ? error.message
          : "Test-E-Mail konnte nicht gesendet werden.",
      );
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Admin: Benutzer
        </h1>
        <p className="text-sm text-zinc-600">
          Verwalte registrierte Benutzerprofile und ihre Rollen. Die
          Registrierung selbst läuft wieder direkt über Supabase-Mail links mit
          Mitgliedsabgleich.
        </p>
        <div className="pt-2">
          <Button
            type="button"
            kind="secondary"
            className="px-4 py-2 text-sm"
            disabled={isSendingTestEmail}
            onClick={() => {
              void handleSendTestEmail();
            }}
          >
            {isSendingTestEmail
              ? "Sende Test-E-Mail ..."
              : "Test-E-Mail an robert@wirewire.de senden"}
          </Button>
        </div>
        {testEmailError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {testEmailError}
          </div>
        ) : null}
        {testEmailSuccess ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
            {testEmailSuccess}
          </div>
        ) : null}
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">
              Aktive Profile
            </h2>
            <p className="text-sm text-zinc-500">
              Hier siehst du alle registrierten und aktiven Benutzerprofile.
            </p>
          </div>
          <Button
            type="button"
            kind="secondary"
            className="px-4 py-2 text-sm"
            disabled={isLoadingProfiles}
            onClick={() => {
              void loadProfiles();
            }}
          >
            {isLoadingProfiles ? "Aktualisiert ..." : "Aktualisieren"}
          </Button>
        </div>

        {profileListError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {profileListError}
          </div>
        ) : null}

        {roleError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {roleError}
          </div>
        ) : null}

        {!profileListError && profiles.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
            Noch keine aktiven Profile gefunden.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Profil</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Mitglied</th>
                    <th className="px-4 py-3">Debitor</th>
                    <th className="px-4 py-3">Rolle</th>
                    <th className="px-4 py-3">Erstellt</th>
                    <th className="px-4 py-3">Letzte Anmeldung</th>
                    <th className="px-4 py-3">Mail bestaetigt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {profiles.map((profile) => {
                    const fallbackName = [profile.firstName, profile.lastName]
                      .filter(Boolean)
                      .join(" ");
                    const displayName =
                      profile.campaiName || fallbackName || profile.email;
                    const hasCampaiLink = Boolean(profile.campaiContactId);

                    return (
                      <tr key={profile.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <p className="font-semibold text-zinc-900">
                              {displayName}
                            </p>
                            <p className="text-zinc-600">{profile.email}</p>
                            {profile.campaiContactId ? (
                              <p className="text-xs text-zinc-500">
                                Campai-ID: {profile.campaiContactId}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              hasCampaiLink
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {hasCampaiLink
                              ? "Mit Campai verknuepft"
                              : "Ohne Campai-Link"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {profile.campaiMemberNumber ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {profile.campaiDebtorAccount ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          <label
                            className="sr-only"
                            htmlFor={`role-${profile.id}`}
                          >
                            Rolle fuer {displayName}
                          </label>
                          <select
                            id={`role-${profile.id}`}
                            value={profile.role}
                            disabled={savingRoleForId === profile.id}
                            onChange={(event) => {
                              const nextRole = event.target
                                .value as ActiveProfile["role"];
                              void handleRoleChange(profile.id, nextRole);
                            }}
                            className="min-w-36 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          >
                            {ROLE_OPTIONS.map((roleOption) => (
                              <option
                                key={roleOption.value}
                                value={roleOption.value}
                              >
                                {roleOption.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {formatDateTime(profile.createdAt) ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {formatDateTime(profile.lastSignInAt) ?? "Noch nie"}
                        </td>
                        <td className="px-4 py-4 text-zinc-700">
                          {formatDateTime(profile.emailConfirmedAt) ?? "Nein"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
