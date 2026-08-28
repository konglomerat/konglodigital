"use client";

import {
  faCheck,
  faPaperPlane,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useMemo, useState } from "react";

import Button from "@/components/knglmrt/Button";
import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import SearchField from "@/components/knglmrt/SearchField";
import Badge, { type BadgeTone } from "@/components/knglmrt/Badge";
import Notice from "@/components/knglmrt/Notice";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/knglmrt/Table";

type InviteStatus = "idle" | "loading" | "sent" | "error";

type InviteState = {
  status: InviteStatus;
  message?: string;
};

type ContactInviteStatus = "pending" | "invited" | "active";

type CampaiContactRow = {
  id: string;
  name: string;
  email: string | null;
  memberNumber: string | null;
  balance: number | null;
  tags: string[];
  types: string[];
  entryAt: string | null;
  inviteStatus: ContactInviteStatus;
  invitedAt: string | null;
  userId: string | null;
};

const balanceFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const formatBalance = (value: number | null) => {
  if (value === null || value === undefined) {
    return null;
  }
  return balanceFormatter.format(value);
};

const formatJoinedDate = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("de-DE", {
    dateStyle: "medium",
  });
};

const formatInvitedAt = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("de-DE", {
    dateStyle: "medium",
  });
};

const STATUS_STYLES: Record<
  ContactInviteStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "Pending", tone: "neutral" },
  invited: { label: "Invited", tone: "wartet" },
  active: { label: "Active", tone: "gebucht" },
};

const StatusBadge = ({ status }: { status: ContactInviteStatus }) => {
  const config = STATUS_STYLES[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
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

const isMember = (contact: CampaiContactRow) =>
  contact.types.some((type) => type.toLowerCase() === "member");

type ContactSectionProps = {
  title: string;
  description: React.ReactNode;
  filter: (contact: CampaiContactRow) => boolean;
  emptyText: string;
  loadLabel: string;
};

const ContactSection = ({
  title,
  description,
  filter,
  emptyText,
  loadLabel,
}: ContactSectionProps) => {
  const [rows, setRows] = useState<CampaiContactRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ contacts: CampaiContactRow[] }>(
        "/api/campai/contacts",
      );
      setRows((data.contacts ?? []).filter(filter));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Campai-Kontakte konnten nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  const filteredRows = useMemo(() => {
    if (!rows) {
      return null;
    }
    const needle = searchTerm.trim().toLocaleLowerCase("de-DE");
    if (!needle) {
      return rows;
    }
    return rows.filter((contact) => {
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
  }, [rows, searchTerm]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {title}
            {rows
              ? ` (${
                  searchTerm.trim() && filteredRows
                    ? `${filteredRows.length} von ${rows.length}`
                    : rows.length
                })`
              : null}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rows ? (
            <SearchField
              className="min-w-64"
              value={searchTerm}
              placeholder="Suche nach Name, Nummer oder Tag"
              onChange={(event) => setSearchTerm(event.target.value)}
              onClear={() => setSearchTerm("")}
            />
          ) : null}
          <Button
            size="small"
            type="button"
            kind="secondary"
            disabled={isLoading}
            onClick={() => {
              void load();
            }}
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                Lädt ...
              </span>
            ) : rows ? (
              "Aktualisieren"
            ) : (
              loadLabel
            )}
          </Button>
        </div>
      </div>

      {error ? <Notice tone="rosa">{error}</Notice> : null}

      {isLoading && !rows ? (
        <div className="flex items-center justify-center gap-2 knglmrt-border bg-card p-10 text-muted-foreground">
          <FontAwesomeIcon
            icon={faSpinner}
            className="animate-spin text-base"
          />
          Lade Kontakte ...
        </div>
      ) : null}

      {filteredRows ? (
        filteredRows.length === 0 ? (
          <div className="knglmrt-border bg-card p-6 text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <ContactTable rows={filteredRows} />
        )
      ) : null}
    </section>
  );
};

const InviteCell = ({ contact }: { contact: CampaiContactRow }) => {
  const [state, setState] = useState<InviteState>({ status: "idle" });

  if (contact.inviteStatus === "active") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (contact.inviteStatus === "invited" && state.status !== "sent") {
    const invitedAt = formatInvitedAt(contact.invitedAt);
    return (
      <span
        className="whitespace-nowrap text-xs text-foreground/80"
        title="Eingeladen am"
      >
        {invitedAt ?? "Eingeladen"}
      </span>
    );
  }

  if (!contact.email) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const sendInvite = async () => {
    setState({ status: "loading" });
    try {
      await fetchJson("/api/admin/contacts/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contact.email, name: contact.name }),
      });
      setState({ status: "sent" });
    } catch (caught) {
      setState({
        status: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "Einladung konnte nicht gesendet werden.",
      });
    }
  };

  if (state.status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-foreground/80">
        <FontAwesomeIcon icon={faCheck} />
        Gesendet
      </span>
    );
  }

  return (
    <Button
      kind="secondary"
      size="chip"
      icon={faPaperPlane}
      loading={state.status === "loading"}
      onClick={() => {
        void sendInvite();
      }}
      title={
        state.status === "error" && state.message
          ? state.message
          : "Einladung senden"
      }
    >
      {state.status === "loading" ? "..." : "Einladen"}
    </Button>
  );
};

const ContactTable = ({ rows }: { rows: CampaiContactRow[] }) => (
  <Table>
    <THead>
      <Th>Mitglied</Th>
      <Th>Name</Th>
      <Th>E-Mail</Th>
      <Th className="text-right">Balance</Th>
      <Th>Tags</Th>
      <Th>Beigetreten</Th>
      <Th>Status</Th>
      <Th>Einladung</Th>
    </THead>
    <TBody>
      {rows.map((contact) => {
        const joined = formatJoinedDate(contact.entryAt);
        const balance = formatBalance(contact.balance);
        const isNegative = contact.balance !== null && contact.balance < 0;

        return (
          <Tr key={contact.id} interactive>
            <Td className="knglmrt-num">{contact.memberNumber ?? "—"}</Td>
            <Td className="font-semibold">{contact.name}</Td>
            <Td>
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Td>
            <Td
              className={`knglmrt-num text-right${
                isNegative ? " text-destructive" : ""
              }`}
            >
              {balance ?? "—"}
            </Td>
            <Td>
              {contact.tags.length === 0 ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {contact.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </Td>
            <Td className="knglmrt-num">{joined ?? "—"}</Td>
            <Td className="whitespace-nowrap">
              <StatusBadge status={contact.inviteStatus} />
            </Td>
            <Td className="whitespace-nowrap">
              <InviteCell contact={contact} />
            </Td>
          </Tr>
        );
      })}
    </TBody>
  </Table>
);

const isNonMember = (contact: CampaiContactRow) => !isMember(contact);

export default function AdminContactsPage() {
  return (
    <div className="space-y-8">
      <SubPageTitle
        ressort="admin"
        title="Mitglieder"
        subTitle="Aktive Mitglieder und Kontakte aus Campai. Tabellen werden bei Bedarf live geladen."
      />

      <ContactSection
        title="Aktive Kontakte"
        description={
          <>
            Alle übrigen Kontakte (z. B. <code>customer</code>,{" "}
            <code>address</code>, <code>sponsor</code>).
          </>
        }
        filter={isNonMember}
        emptyText="Keine weiteren Kontakte gefunden."
        loadLabel="Kontakte laden"
      />

      <ContactSection
        title="Aktive Mitglieder"
        description={
          <>
            Kontakte mit Typ <code>member</code>.
          </>
        }
        filter={isMember}
        emptyText="Keine Mitglieder gefunden."
        loadLabel="Mitglieder laden"
      />
    </div>
  );
}
