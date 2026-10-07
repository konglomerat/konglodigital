"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "@/components/knglmrt/Button";
import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import AccessRulesExplainer from "@/app/[lang]/admin/users/AccessRulesExplainer";
import { type Locale, localizePathname } from "@/i18n/config";
import SearchField from "@/components/knglmrt/SearchField";
import Badge from "@/components/knglmrt/Badge";
import Dialog from "@/components/knglmrt/Dialog";
import Notice from "@/components/knglmrt/Notice";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/knglmrt/Table";

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
  /** „Buchhaltung · Holz" usw. — vergeben wird in der Profilansicht. */
  roleLabels: string[];
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

export default function AdminUsersClient({ locale }: { locale: Locale }) {
  const [profiles, setProfiles] = useState<ActiveProfile[]>([]);
  const [profileListError, setProfileListError] = useState<string | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [campaiLinkError, setCampaiLinkError] = useState<string | null>(null);
  const [campaiContacts, setCampaiContacts] = useState<
    CampaiContactOption[] | null
  >(null);
  const [isLoadingCampaiContacts, setIsLoadingCampaiContacts] = useState(false);
  const [editingCampaiForId, setEditingCampaiForId] = useState<string | null>(
    null,
  );
  const [savingCampaiForId, setSavingCampaiForId] = useState<string | null>(
    null,
  );
  const [campaiSearchTerm, setCampaiSearchTerm] = useState("");
  const [selectedCampaiContactId, setSelectedCampaiContactId] = useState("");
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
      campaiContacts?.find(
        (contact) => contact.id === selectedCampaiContactId,
      ) ?? null,
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

  return (
    <div className="space-y-6">
      <SubPageTitle
        ressort="admin"
        title="Benutzer"
        subTitle="Registrierte Benutzerprofile. Rollen vergibst du in der Profilansicht einer Person. Die Registrierung selbst läuft über Supabase-Maillinks mit Mitgliedsabgleich."
      />

      <AccessRulesExplainer />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="knglmrt-card-title text-foreground">
              Aktive Profile
            </h2>
            <p className="text-sm text-muted-foreground">
              Hier siehst du alle registrierten und aktiven Benutzerprofile.
            </p>
          </div>
          <Button
            size="small"
            type="button"
            kind="secondary"
            disabled={isLoadingProfiles}
            onClick={() => {
              void loadProfiles();
            }}
          >
            {isLoadingProfiles ? "Aktualisiert ..." : "Aktualisieren"}
          </Button>
        </div>

        {profileListError ? (
          <Notice tone="rosa">{profileListError}</Notice>
        ) : null}

        {campaiLinkError && editingCampaiForId === null ? (
          <Notice tone="rosa">{campaiLinkError}</Notice>
        ) : null}

        {!profileListError && profiles.length === 0 ? (
          <div className="knglmrt-border bg-card p-6 text-muted-foreground">
            Noch keine aktiven Profile gefunden.
          </div>
        ) : (
          <Table className="whitespace-nowrap">
            <THead>
              <Th>Profil</Th>
              <Th>E-Mail</Th>
              <Th>Status</Th>
              <Th>Rollen</Th>
              <Th>Erstellt</Th>
              <Th>Letzte Anmeldung</Th>
              <Th>Mail bestaetigt</Th>
            </THead>
            <TBody>
              {profiles.map((profile) => {
                const fallbackName = [profile.firstName, profile.lastName]
                  .filter(Boolean)
                  .join(" ");
                const displayName =
                  profile.campaiName || fallbackName || profile.email;
                const hasCampaiLink = Boolean(profile.campaiContactId);
                const isEditingCampai = editingCampaiForId === profile.id;
                const profileHref = localizePathname(
                  `/admin/users/${encodeURIComponent(profile.id)}`,
                  locale,
                );

                return (
                  <Tr key={profile.id}>
                    <Td className="align-middle font-semibold">
                      <Link href={profileHref} className="hover:text-primary">
                        {displayName}
                      </Link>
                    </Td>
                    <Td className="align-middle text-muted-foreground">
                      {profile.email}
                    </Td>
                    <Td className="align-middle whitespace-nowrap">
                      {hasCampaiLink ? (
                        <Badge tone="gebucht">Mit Campai verknuepft</Badge>
                      ) : (
                        <Button
                          kind="quiet"
                          size="chip"
                          className="whitespace-nowrap"
                          disabled={savingCampaiForId === profile.id}
                          onClick={() => {
                            if (isEditingCampai) {
                              cancelCampaiLink();
                              return;
                            }
                            void startCampaiLink(profile);
                          }}
                        >
                          {isEditingCampai
                            ? "Campai-Auswahl schliessen"
                            : "Mit Campai verknuepfen"}
                        </Button>
                      )}
                    </Td>
                    <Td className="align-middle">
                      <Link
                        href={profileHref}
                        className="flex min-w-48 flex-wrap gap-1.5"
                        title="Rollen in der Profilansicht vergeben"
                      >
                        {profile.roleLabels.length > 0 ? (
                          profile.roleLabels.map((label) => (
                            <Badge key={label} tone="neutral">
                              {label}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">
                            Keine Rolle
                          </span>
                        )}
                      </Link>
                    </Td>
                    <Td className="knglmrt-num align-middle">
                      {formatDateTime(profile.createdAt) ?? "—"}
                    </Td>
                    <Td className="knglmrt-num align-middle">
                      {formatDateTime(profile.lastSignInAt) ?? "Noch nie"}
                    </Td>
                    <Td className="knglmrt-num align-middle">
                      {formatDateTime(profile.emailConfirmedAt) ?? "Nein"}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      <Dialog
        open={Boolean(editingCampaiProfile)}
        title="Campai-Konto verknuepfen"
        width={672}
        onCancel={cancelCampaiLink}
        actions={
          <>
            <Button
              type="button"
              kind="secondary"
              disabled={savingCampaiForId === editingCampaiProfile?.id}
              onClick={cancelCampaiLink}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              kind="primary"
              disabled={
                !selectedCampaiContactId ||
                savingCampaiForId === editingCampaiProfile?.id
              }
              onClick={() => {
                if (editingCampaiProfile) {
                  void handleCampaiLink(editingCampaiProfile.id);
                }
              }}
            >
              {savingCampaiForId === editingCampaiProfile?.id
                ? "Speichert ..."
                : "Verknuepfen"}
            </Button>
          </>
        }
      >
        {editingCampaiProfile ? (
          <>
            <div>
              <h3 className="knglmrt-card-title text-foreground">
                {editingCampaiProfile.campaiName ||
                  [
                    editingCampaiProfile.firstName,
                    editingCampaiProfile.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  editingCampaiProfile.email}
              </h3>
              <p className="text-muted-foreground">
                {editingCampaiProfile.email}
              </p>
            </div>

            <SearchField
              value={campaiSearchTerm}
              count={`${filteredCampaiContacts.length} Treffer`}
              placeholder="Suche nach Name, Mail oder Mitgliedsnummer"
              onChange={(event) => {
                setCampaiSearchTerm(event.target.value);
              }}
              onClear={() => setCampaiSearchTerm("")}
            />

            {selectedCampaiContact ? (
              <p className="text-muted-foreground">
                Ausgewaehlt: {selectedCampaiContact.name}
              </p>
            ) : null}

            {campaiLinkError ? (
              <Notice tone="rosa">{campaiLinkError}</Notice>
            ) : null}

            {isLoadingCampaiContacts ? (
              <div className="knglmrt-border bg-muted px-4 py-6 text-muted-foreground">
                Lade Campai-Konten ...
              </div>
            ) : visibleCampaiContacts.length === 0 ? (
              <div className="knglmrt-border bg-muted px-4 py-6 text-muted-foreground">
                Keine passenden Campai-Konten gefunden.
              </div>
            ) : (
              <div className="max-h-[28rem] overflow-y-auto knglmrt-border bg-card">
                {visibleCampaiContacts.map((contact, index) => {
                  const isSelected = selectedCampaiContactId === contact.id;

                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        setSelectedCampaiContactId(contact.id);
                      }}
                      className={`flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-ui-tint-zebra ${
                        index > 0 ? "border-t border-border" : ""
                      } ${isSelected ? "bg-primary-soft" : "bg-transparent"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">
                          {contact.name}
                        </span>
                        <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">
                          {contact.email ?? "Keine Mail"}
                        </span>
                        <span className="knglmrt-num block truncate text-muted-foreground">
                          {contact.memberNumber
                            ? `Mitgliedsnummer ${contact.memberNumber}`
                            : "Keine Mitgliedsnummer"}
                        </span>
                      </span>
                      {isSelected ? (
                        <Badge tone="offen">Ausgewaehlt</Badge>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredCampaiContacts.length > MAX_CAMPAI_RESULTS ? (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                Zeige die ersten {MAX_CAMPAI_RESULTS} Treffer. Suche weiter ein,
                um genauer zu filtern.
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
