"use client";

import {
  faCheck,
  faPaperPlane,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useMemo, useState } from "react";

import Button from "@/app/[lang]/components/Button";
import PageTitle from "@/app/[lang]/components/PageTitle";

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
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-muted text-muted-foreground",
  },
  invited: {
    label: "Invited",
    className: "bg-accent text-foreground/80",
  },
  active: {
    label: "Active",
    className: "bg-primary-soft text-primary",
  },
};

const StatusBadge = ({ status }: { status: ContactInviteStatus }) => {
  const config = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
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
            <input
              type="search"
              value={searchTerm}
              placeholder="Suche nach Name, Nummer oder Tag"
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-w-64 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-border"
            />
          ) : null}
          <Button
            type="button"
            kind="secondary"
            className="px-4 py-2 text-sm"
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

      {error ? (
        <div className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive shadow-sm">
          {error}
        </div>
      ) : null}

      {isLoading && !rows ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-base" />
          Lade Kontakte ...
        </div>
      ) : null}

      {filteredRows ? (
        filteredRows.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
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
      <span className="whitespace-nowrap text-xs text-foreground/80" title="Eingeladen am">
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
    <button
      type="button"
      disabled={state.status === "loading"}
      onClick={() => {
        void sendInvite();
      }}
      title={
        state.status === "error" && state.message
          ? state.message
          : "Einladung senden"
      }
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground/80 shadow-sm transition hover:border-primary hover:text-foreground disabled:opacity-60"
    >
      <FontAwesomeIcon
        icon={state.status === "loading" ? faSpinner : faPaperPlane}
        className={state.status === "loading" ? "animate-spin" : undefined}
      />
      {state.status === "loading" ? "..." : "Einladen"}
    </button>
  );
};

const ContactTable = ({ rows }: { rows: CampaiContactRow[] }) => (
  <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Mitglied</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">E-Mail</th>
            <th className="px-3 py-2 text-right">Balance</th>
            <th className="px-3 py-2">Tags</th>
            <th className="px-3 py-2">Beigetreten</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Einladung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 bg-card">
          {rows.map((contact) => {
            const joined = formatJoinedDate(contact.entryAt);
            const balance = formatBalance(contact.balance);

            return (
              <tr key={contact.id} className="align-middle">
                <td className="px-3 py-1.5 font-mono text-foreground/80">
                  {contact.memberNumber ?? "—"}
                </td>
                <td className="px-3 py-1.5 font-semibold text-foreground">
                  {contact.name}
                </td>
                <td className="px-3 py-1.5 text-foreground/80">
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:underline"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                    contact.balance !== null && contact.balance < 0
                      ? "text-destructive"
                      : "text-foreground/80"
                  }`}
                >
                  {balance ?? "—"}
                </td>
                <td className="px-3 py-1.5">
                  {contact.tags.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-foreground/80"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5 text-foreground/80">
                  {joined ?? "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <StatusBadge status={contact.inviteStatus} />
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <InviteCell contact={contact} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const isNonMember = (contact: CampaiContactRow) => !isMember(contact);

export default function AdminContactsPage() {
  return (
    <div className="space-y-8">
      <PageTitle
        title="Admin: Campai-Kontakte"
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
