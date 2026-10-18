"use client";

// Vorstand → Anträge: Mitgliedsanträge von /registration prüfen, korrigieren,
// nachfragen, annehmen oder ablehnen — und nach dem Annehmen Rechnung und
// Willkommensmails anstoßen. Links die Liste, rechts der gewählte Antrag.
import { useCallback, useEffect, useMemo, useState } from "react";

import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import Badge from "@/components/knglmrt/Badge";
import Notice from "@/components/knglmrt/Notice";
import SearchField from "@/components/knglmrt/SearchField";
import SegmentedControl from "@/components/knglmrt/SegmentedControl";
import { Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/knglmrt/Table";
import type { RegistrationErrors } from "@/lib/campai-registration";
import {
  APPLICATION_TABS,
  STATUS_LABELS,
  STATUS_TONES,
  describeAccess,
  describeFee,
  formatDate,
  formatEuro,
  isOnboarding,
  onboardingItems,
  tabOf,
  type ApplicationData,
  type ApplicationInvoice,
  type ApplicationTab,
  type MembershipApplication,
} from "@/lib/membership-applications/types";

import ApplicationPanel, { ProgressBar, type PanelAction } from "./ApplicationPanel";

type Detail = {
  application: MembershipApplication;
  invoice: ApplicationInvoice | null;
  invoiceError?: string;
};

/** Solange Campai den Rechnungsentwurf anlegt, fragt die Ansicht nach. */
const INVOICE_POLL_MS = 5000;

const daysAgo = (value: string) => {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
};

const readJson = async <T,>(response: Response) =>
  (await response.json().catch(() => ({}))) as T & {
    error?: string;
    fieldErrors?: RegistrationErrors;
  };

/** Fortschritt der Aufnahme in der Liste: Balken, „3/4" und der nächste offene Punkt. */
function Progress({ application }: { application: MembershipApplication }) {
  const items = onboardingItems(application);
  const done = items.filter((item) => item.done).length;
  const next = items.find((item) => !item.done);
  return (
    <span className="mt-2 block">
      <span className="flex items-center gap-2">
        <ProgressBar done={done} total={items.length} />
        <span className="knglmrt-num shrink-0">
          {done}/{items.length}
        </span>
      </span>
      <span className="mt-1 block text-muted-foreground">
        Offen: {next ? next.short : "Abschluss"}
      </span>
    </span>
  );
}

export default function AntraegeClient() {
  const [applications, setApplications] = useState<MembershipApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ApplicationTab>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/applications", { cache: "no-store" });
      const payload = await readJson<{ applications?: MembershipApplication[] }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Anträge konnten nicht geladen werden.");
      setApplications(payload.applications ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Anträge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /** Übernimmt einen neuen Stand in Panel und Liste (die Liste ohne Unterschriften). */
  const applyDetail = useCallback((next: Detail) => {
    setDetail(next);
    setApplications((current) =>
      current.map((entry) =>
        entry.id === next.application.id ? { ...next.application, signatures: null } : entry,
      ),
    );
  }, []);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailError(null);
      try {
        const response = await fetch(`/api/admin/applications/${id}`, { cache: "no-store" });
        const payload = await readJson<Detail>(response);
        if (!response.ok) throw new Error(payload.error ?? "Antrag konnte nicht geladen werden.");
        applyDetail(payload);
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "Antrag konnte nicht geladen werden.");
      }
    },
    [applyDetail],
  );

  const visible = useMemo(() => {
    const statuses: readonly string[] =
      APPLICATION_TABS.find((entry) => entry.value === tab)?.statuses ?? [];
    const needle = search.trim().toLowerCase();
    return applications.filter(
      (entry) =>
        statuses.includes(entry.status) &&
        (!needle ||
          `${entry.firstName} ${entry.lastName} ${entry.email} ${entry.number}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [applications, search, tab]);

  // Ohne eigene Wahl steht der erste Antrag der Liste offen.
  const activeId =
    selectedId && visible.some((entry) => entry.id === selectedId)
      ? selectedId
      : (visible[0]?.id ?? null);

  useEffect(() => {
    setActionError(null);
    setFieldErrors({});
    if (!activeId) {
      setDetail(null);
      return;
    }
    if (detail?.application.id !== activeId) {
      setDetail(null);
      void loadDetail(activeId);
    }
    // Nur beim Wechsel des Antrags laden, nicht bei jedem neuen Stand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadDetail]);

  // Der Rechnungsentwurf erscheint in Campai erst ~30 s nach dem Annehmen.
  const waitingForInvoice =
    detail?.application.status === "invoice_draft" &&
    !detail.application.campai.invoiceId &&
    !detail.application.campai.noInvoiceDue;
  useEffect(() => {
    if (!waitingForInvoice || !activeId) return;
    const timer = setInterval(() => void loadDetail(activeId), INVOICE_POLL_MS);
    return () => clearInterval(timer);
  }, [waitingForInvoice, activeId, loadDetail]);

  const send = async (method: "POST" | "PATCH", body: unknown) => {
    if (!activeId) return false;
    setBusy(true);
    setActionError(null);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/admin/applications/${activeId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readJson<Partial<Detail>>(response);
      if (payload.application) {
        applyDetail({
          application: payload.application,
          invoice: payload.invoice ?? null,
          invoiceError: payload.invoiceError,
        });
        // Nach Annehmen oder Abschluss wandert der Antrag in einen anderen
        // Tab — die Ansicht geht mit, damit er ausgewählt bleibt.
        const nextTab = tabOf(payload.application.status);
        if (tab !== "all" && nextTab !== tab) {
          setSelectedId(payload.application.id);
          setTab(nextTab);
        }
      }
      if (!response.ok) {
        setFieldErrors(payload.fieldErrors ?? {});
        throw new Error(payload.error ?? "Das hat nicht geklappt.");
      }
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Das hat nicht geklappt.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_TABS.map((entry) => [
          entry.value,
          applications.filter((application) =>
            (entry.statuses as readonly string[]).includes(application.status),
          ).length,
        ]),
      ) as Record<ApplicationTab, number>,
    [applications],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SubPageTitle
          ressort="vorstand"
          title="Mitgliedschaftsanträge"
          subTitle="Neue Anträge prüfen, annehmen und die Aufnahme Schritt für Schritt nachhalten, bis aus dem Antrag ein Mitglied geworden ist."
        />
      </div>

      {loadError ? (
        <Notice title="Anträge nicht geladen" tone="gelb">
          {loadError}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={tab}
          tone="ink"
          size="small"
          onChange={setTab}
          options={APPLICATION_TABS.map((entry) => ({
            value: entry.value,
            label: `${entry.label} ${loading ? "" : counts[entry.value]}`.trim(),
          }))}
        />
        <SearchField
          value={search}
          placeholder="Name oder E-Mail suchen"
          onChange={(event) => setSearch(event.target.value)}
          className="w-full sm:w-[300px]"
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Table>
          <THead>
            <Th>Antragsteller:in</Th>
            <Th>Eingang</Th>
            <Th>Jahresbeitrag</Th>
            <Th>Zugangskarte</Th>
            <Th>Status</Th>
          </THead>
          <TBody>
            {loading ? (
              <TableEmpty colSpan={5}>Anträge werden geladen …</TableEmpty>
            ) : visible.length === 0 ? (
              <TableEmpty colSpan={5}>
                {search ? "Kein Antrag passt zur Suche." : "Keine Anträge in dieser Auswahl."}
              </TableEmpty>
            ) : (
              visible.map((entry) => {
                const fee = describeFee(entry.data);
                const active = entry.id === activeId;
                return (
                  <Tr key={entry.id} tone={active ? "rosa" : "weiss"} onClick={() => setSelectedId(entry.id)}>
                    <Td className={active ? "shadow-[inset_3px_0_0_var(--primary)]" : undefined}>
                      <span className="block font-bold">
                        {entry.firstName} {entry.lastName}
                      </span>
                      <span className="block text-muted-foreground">{entry.email}</span>
                    </Td>
                    <Td>
                      <span className="knglmrt-num block">{formatDate(entry.createdAt)}</span>
                      <span className="knglmrt-num block text-muted-foreground">
                        {daysAgo(entry.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <span className="block">{fee.label}</span>
                      <span className="knglmrt-num block text-muted-foreground">
                        {fee.euro === null ? "—" : formatEuro(fee.euro)}
                      </span>
                    </Td>
                    <Td>{describeAccess(entry.data)}</Td>
                    <Td className="min-w-[150px]">
                      <Badge tone={STATUS_TONES[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
                      {isOnboarding(entry.status) ? <Progress application={entry} /> : null}
                    </Td>
                  </Tr>
                );
              })
            )}
          </TBody>
        </Table>

        {detail && detail.application.id === activeId ? (
          <ApplicationPanel
            key={detail.application.id}
            application={detail.application}
            invoice={detail.invoice}
            invoiceError={detail.invoiceError ?? null}
            busy={busy}
            actionError={actionError}
            fieldErrors={fieldErrors}
            onAction={(action: PanelAction) => send("POST", action)}
            onSave={(data: ApplicationData) => send("PATCH", { data })}
          />
        ) : activeId ? (
          <div className="knglmrt-border bg-card p-[18px] text-muted-foreground">
            {detailError ?? "Antrag wird geladen …"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
