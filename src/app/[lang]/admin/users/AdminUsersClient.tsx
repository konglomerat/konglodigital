"use client";

import { useCallback, useEffect, useState } from "react";

import Button from "@/app/[lang]/components/Button";
import PageTitle from "@/app/[lang]/components/PageTitle";

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
      <PageTitle
        title="Admin: Benutzer"
        subTitle="Verwalte registrierte Benutzerprofile und ihre Rollen. Die Registrierung selbst läuft wieder direkt über Supabase-Mail links mit Mitgliedsabgleich."
        links={[
          {
            label: isSendingTestEmail
              ? "Sende Test-E-Mail ..."
              : "Test-E-Mail an robert@wirewire.de senden",
            onClick: () => {
              void handleSendTestEmail();
            },
            disabled: isSendingTestEmail,
            className: "px-4 py-2 text-sm",
          },
        ]}
      />

        {testEmailError ? (
          <div className="rounded-3xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive shadow-sm">
            {testEmailError}
          </div>
        ) : null}
        {testEmailSuccess ? (
          <div className="rounded-3xl border border-success-border bg-success-soft p-4 text-sm text-success shadow-sm">
            {testEmailSuccess}
          </div>
        ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Aktive Profile
            </h2>
            <p className="text-sm text-muted-foreground">
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
          <div className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive shadow-sm">
            {profileListError}
          </div>
        ) : null}

        {roleError ? (
          <div className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive shadow-sm">
            {roleError}
          </div>
        ) : null}

        {!profileListError && profiles.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            Noch keine aktiven Profile gefunden.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <tbody className="divide-y divide-border/60 bg-card">
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
                            <p className="font-semibold text-foreground">
                              {displayName}
                            </p>
                            <p className="text-muted-foreground">{profile.email}</p>
                            {profile.campaiContactId ? (
                              <p className="text-xs text-muted-foreground">
                                Campai-ID: {profile.campaiContactId}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              hasCampaiLink
                                ? "bg-success-soft text-success"
                                : "bg-accent text-foreground/80"
                            }`}
                          >
                            {hasCampaiLink
                              ? "Mit Campai verknuepft"
                              : "Ohne Campai-Link"}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
                          {profile.campaiMemberNumber ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
                          {profile.campaiDebtorAccount ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
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
                            className="min-w-36 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-border disabled:cursor-not-allowed disabled:bg-accent"
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
                        <td className="px-4 py-4 text-foreground/80">
                          {formatDateTime(profile.createdAt) ?? "—"}
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
                          {formatDateTime(profile.lastSignInAt) ?? "Noch nie"}
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
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
