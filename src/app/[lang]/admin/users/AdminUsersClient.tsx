"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type CampaiContactOption = {
  id: string;
  name: string;
  email: string | null;
  memberNumber: string | null;
  tags: string[];
  types: string[];
  entryAt: string | null;
};

const MAX_CAMPAI_RESULTS = 8;

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
  const [campaiLinkError, setCampaiLinkError] = useState<string | null>(null);
  const [campaiContacts, setCampaiContacts] = useState<CampaiContactOption[] | null>(null);
  const [isLoadingCampaiContacts, setIsLoadingCampaiContacts] = useState(false);
  const [editingCampaiForId, setEditingCampaiForId] = useState<string | null>(null);
  const [savingCampaiForId, setSavingCampaiForId] = useState<string | null>(null);
  const [campaiSearchTerm, setCampaiSearchTerm] = useState("");
  const [selectedCampaiContactId, setSelectedCampaiContactId] = useState("");
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);
  const [testEmailSuccess, setTestEmailSuccess] = useState<string | null>(null);
  const editingCampaiProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingCampaiForId) ?? null,
    [editingCampaiForId, profiles],
  );

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

  const loadCampaiContacts = useCallback(async () => {
    setIsLoadingCampaiContacts(true);
    setCampaiLinkError(null);

    try {
      const data = await fetchJson<{ contacts: CampaiContactOption[] }>(
        "/api/admin/campai-contacts",
      );
      const memberContacts = (data.contacts ?? []).filter((contact) =>
        contact.types.some((type) => type.toLowerCase() === "member"),
      );
      setCampaiContacts(memberContacts);
      return memberContacts;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Campai-Konten konnten nicht geladen werden.";
      setCampaiLinkError(message);
      throw error;
    } finally {
      setIsLoadingCampaiContacts(false);
    }
  }, []);

  const filteredCampaiContacts = useMemo(() => {
    if (!campaiContacts) {
      return [] as CampaiContactOption[];
    }

    const needle = campaiSearchTerm.trim().toLocaleLowerCase("de-DE");
    const filtered = !needle
      ? campaiContacts
      : campaiContacts.filter((contact) => {
          const haystack = [
            contact.name,
            contact.email ?? "",
            contact.memberNumber ?? "",
            contact.tags.join(" "),
          ]
            .join(" ")
            .toLocaleLowerCase("de-DE");
          return haystack.includes(needle);
        });

    if (!needle) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftEmail = left.email?.toLocaleLowerCase("de-DE") ?? "";
      const rightEmail = right.email?.toLocaleLowerCase("de-DE") ?? "";
      const leftName = left.name.toLocaleLowerCase("de-DE");
      const rightName = right.name.toLocaleLowerCase("de-DE");
      const leftScore =
        (leftEmail === needle ? 4 : 0) +
        (leftName === needle ? 3 : 0) +
        (leftEmail.startsWith(needle) ? 2 : 0) +
        (leftName.startsWith(needle) ? 1 : 0);
      const rightScore =
        (rightEmail === needle ? 4 : 0) +
        (rightName === needle ? 3 : 0) +
        (rightEmail.startsWith(needle) ? 2 : 0) +
        (rightName.startsWith(needle) ? 1 : 0);

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return left.name.localeCompare(right.name, "de-DE");
    });
  }, [campaiContacts, campaiSearchTerm]);

  const visibleCampaiContacts = useMemo(
    () => filteredCampaiContacts.slice(0, MAX_CAMPAI_RESULTS),
    [filteredCampaiContacts],
  );

  const selectedCampaiContact = useMemo(
    () =>
      campaiContacts?.find((contact) => contact.id === selectedCampaiContactId) ??
      null,
    [campaiContacts, selectedCampaiContactId],
  );

  const startCampaiLink = useCallback(
    async (profile: ActiveProfile) => {
      setCampaiLinkError(null);
      setEditingCampaiForId(profile.id);
      setCampaiSearchTerm(profile.email);

      try {
        const contacts = campaiContacts ?? (await loadCampaiContacts());
        const matchingContact = contacts.find(
          (contact) =>
            contact.email?.trim().toLowerCase() ===
            profile.email.trim().toLowerCase(),
        );

        setSelectedCampaiContactId(
          profile.campaiContactId ?? matchingContact?.id ?? "",
        );
      } catch {
        setSelectedCampaiContactId(profile.campaiContactId ?? "");
      }
    },
    [campaiContacts, loadCampaiContacts],
  );

  const cancelCampaiLink = useCallback(() => {
    setEditingCampaiForId(null);
    setCampaiSearchTerm("");
    setSelectedCampaiContactId("");
    setCampaiLinkError(null);
  }, []);

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

  const handleCampaiLink = async (profileId: string) => {
    if (!selectedCampaiContactId) {
      setCampaiLinkError("Bitte waehle zuerst ein Campai-Konto aus.");
      return;
    }

    setSavingCampaiForId(profileId);
    setCampaiLinkError(null);

    try {
      const data = await fetchJson<{
        profile: Pick<
          ActiveProfile,
          | "id"
          | "campaiContactId"
          | "campaiMemberNumber"
          | "campaiDebtorAccount"
          | "campaiName"
        >;
      }>("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profileId,
          campaiContactId: selectedCampaiContactId,
        }),
      });

      setProfiles((currentProfiles) =>
        currentProfiles.map((profile) =>
          profile.id === data.profile.id
            ? {
                ...profile,
                campaiContactId: data.profile.campaiContactId,
                campaiMemberNumber: data.profile.campaiMemberNumber,
                campaiDebtorAccount: data.profile.campaiDebtorAccount,
                campaiName: data.profile.campaiName,
              }
            : profile,
        ),
      );
      cancelCampaiLink();
    } catch (error) {
      setCampaiLinkError(
        error instanceof Error
          ? error.message
          : "Campai-Konto konnte nicht verknuepft werden.",
      );
    } finally {
      setSavingCampaiForId(null);
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

        {campaiLinkError && editingCampaiForId === null ? (
          <div className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive shadow-sm">
            {campaiLinkError}
          </div>
        ) : null}

        {!profileListError && profiles.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            Noch keine aktiven Profile gefunden.
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm whitespace-nowrap">
                <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Profil</th>
                    <th className="px-4 py-3">E-Mail</th>
                    <th className="px-4 py-3">Status</th>
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
                    const isEditingCampai = editingCampaiForId === profile.id;

                    return (
                      <tr key={profile.id}>
                        <td className="px-4 py-3 align-middle font-semibold text-foreground">
                          {displayName}
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground">
                          {profile.email}
                        </td>
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {hasCampaiLink ? (
                              <span
                                className="inline-flex whitespace-nowrap rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success"
                              >
                                Mit Campai verknuepft
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={savingCampaiForId === profile.id}
                                onClick={() => {
                                  if (isEditingCampai) {
                                    cancelCampaiLink();
                                    return;
                                  }
                                  void startCampaiLink(profile);
                                }}
                                className="inline-flex whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-semibold text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isEditingCampai
                                  ? "Campai-Auswahl schliessen"
                                  : "Mit Campai verknuepfen"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle text-foreground/80">
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
                            className="min-w-28 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-border disabled:cursor-not-allowed disabled:bg-accent"
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
                        <td className="px-4 py-3 align-middle text-foreground/80">
                          {formatDateTime(profile.createdAt) ?? "—"}
                        </td>
                        <td className="px-4 py-3 align-middle text-foreground/80">
                          {formatDateTime(profile.lastSignInAt) ?? "Noch nie"}
                        </td>
                        <td className="px-4 py-3 align-middle text-foreground/80">
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

      {editingCampaiProfile ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 p-6 pt-20">
          <div
            className="absolute inset-0"
            onClick={cancelCampaiLink}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-border bg-card p-5 shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Campai-Konto verknuepfen
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {editingCampaiProfile.campaiName ||
                      [editingCampaiProfile.firstName, editingCampaiProfile.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                      editingCampaiProfile.email}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {editingCampaiProfile.email}
                  </p>
                </div>
                <Button
                  type="button"
                  kind="secondary"
                  className="px-2 py-1 text-xs"
                  disabled={savingCampaiForId === editingCampaiProfile.id}
                  onClick={cancelCampaiLink}
                >
                  Schliessen
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {filteredCampaiContacts.length} Treffer
                </span>
                {selectedCampaiContact ? (
                  <span className="text-sm text-muted-foreground">
                    Ausgewaehlt: {selectedCampaiContact.name}
                  </span>
                ) : null}
              </div>

              <input
                type="search"
                value={campaiSearchTerm}
                placeholder="Suche nach Name, Mail oder Mitgliedsnummer"
                onChange={(event) => {
                  setCampaiSearchTerm(event.target.value);
                }}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-border"
              />

              {campaiLinkError ? (
                <div className="rounded-xl border border-destructive-border bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  {campaiLinkError}
                </div>
              ) : null}

              {isLoadingCampaiContacts ? (
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                  Lade Campai-Konten ...
                </div>
              ) : visibleCampaiContacts.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                  Keine passenden Campai-Konten gefunden.
                </div>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-border bg-background shadow-sm">
                  <div className="divide-y divide-border/60">
                    {visibleCampaiContacts.map((contact) => {
                      const isSelected = selectedCampaiContactId === contact.id;

                      return (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => {
                            setSelectedCampaiContactId(contact.id);
                          }}
                          className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-muted/50 ${
                            isSelected ? "bg-primary/10" : "bg-transparent"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {contact.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {contact.email ?? "Keine Mail"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {contact.memberNumber
                                ? `Mitgliedsnummer ${contact.memberNumber}`
                                : "Keine Mitgliedsnummer"}
                            </span>
                          </span>
                          {isSelected ? (
                            <span className="text-xs font-semibold text-primary">
                              Ausgewaehlt
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredCampaiContacts.length > MAX_CAMPAI_RESULTS ? (
                <p className="text-xs text-muted-foreground">
                  Zeige die ersten {MAX_CAMPAI_RESULTS} Treffer. Suche weiter ein, um genauer zu filtern.
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  kind="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={savingCampaiForId === editingCampaiProfile.id}
                  onClick={cancelCampaiLink}
                >
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  kind="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={
                    !selectedCampaiContactId ||
                    savingCampaiForId === editingCampaiProfile.id
                  }
                  onClick={() => {
                    void handleCampaiLink(editingCampaiProfile.id);
                  }}
                >
                  {savingCampaiForId === editingCampaiProfile.id
                    ? "Speichert ..."
                    : "Verknuepfen"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
