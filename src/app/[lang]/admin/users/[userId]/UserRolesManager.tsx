"use client";
// Rollen einer Person ansehen, vergeben und entziehen. Was angeboten wird,
// kommt als grantOptions vom Server; geprüft wird dort noch einmal.
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AccessAssignmentView,
  AccessOverviewResponse,
} from "@/app/api/admin/access/route";
import Button from "@/components/knglmrt/Button";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Notice from "@/components/knglmrt/Notice";
import { Table, TBody, Td, THead, Th, Tr } from "@/components/knglmrt/Table";
import { GLOBAL_SCOPE_PARAM } from "@/lib/access/scopes";

type UserRolesManagerProps = {
  userId: string;
};

const toScopeParam = (scopeId: string | null) => scopeId ?? GLOBAL_SCOPE_PARAM;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("de-DE", { dateStyle: "medium" });
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

export default function UserRolesManager({ userId }: UserRolesManagerProps) {
  const [overview, setOverview] = useState<AccessOverviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState("");
  const [scope, setScope] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setOverview(
        await fetchJson<AccessOverviewResponse>(
          `/api/admin/access?userId=${encodeURIComponent(userId)}`,
        ),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Rollen konnten nicht geladen werden.",
      );
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleLabel = useCallback(
    (name: string) =>
      overview?.roles.find((entry) => entry.name === name)?.label ?? name,
    [overview],
  );

  const grantableRoles = useMemo(() => {
    const names = new Set(
      (overview?.grantOptions ?? []).map((option) => option.role),
    );
    return (overview?.roles ?? []).filter((entry) => names.has(entry.name));
  }, [overview]);

  const grantableScopes = useMemo(() => {
    const options = (overview?.grantOptions ?? []).filter(
      (option) => option.role === role,
    );
    const params = new Set(options.map((option) => toScopeParam(option.scopeId)));
    return [
      ...(params.has(GLOBAL_SCOPE_PARAM)
        ? [{ value: GLOBAL_SCOPE_PARAM, label: "Global" }]
        : []),
      ...(overview?.scopes ?? [])
        .filter((entry) => params.has(entry.id))
        .map((entry) => ({ value: entry.id, label: entry.name })),
    ];
  }, [overview, role]);

  const grant = async () => {
    if (!role || !scope) {
      setActionError("Bitte Rolle und Bereich auswählen.");
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await fetchJson("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role, scopeId: scope }),
      });
      setRole("");
      setScope("");
      await load();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Rolle konnte nicht vergeben werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (assignment: AccessAssignmentView) => {
    const subject = `${roleLabel(assignment.role)} · ${assignment.scopeLabel}`;
    if (!window.confirm(`Zuweisung entziehen?\n${subject}`)) return;

    setBusy(true);
    setActionError(null);
    try {
      await fetchJson(
        `/api/admin/access?id=${encodeURIComponent(assignment.id)}`,
        { method: "DELETE" },
      );
      await load();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Rolle konnte nicht entzogen werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return <Notice tone="rosa">{loadError}</Notice>;
  }
  if (!overview) {
    return <p className="text-muted-foreground">Lade Rollen …</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {actionError ? <Notice tone="rosa">{actionError}</Notice> : null}

      {overview.assignments.length === 0 ? (
        <div className="knglmrt-border bg-card p-6 text-muted-foreground">
          Keine Rollen. Ohne Rolle hat die Person nur ihr eigenes Konto.
        </div>
      ) : (
        <Table>
          <THead>
            <Th>Rolle</Th>
            <Th>Bereich</Th>
            <Th>Vergeben von</Th>
            <Th>Seit</Th>
            <Th>
              <span className="sr-only">Aktion</span>
            </Th>
          </THead>
          <TBody>
            {overview.assignments.map((assignment) => (
              <Tr key={assignment.id}>
                <Td className="align-middle">{roleLabel(assignment.role)}</Td>
                <Td className="align-middle">{assignment.scopeLabel}</Td>
                <Td className="align-middle text-muted-foreground">
                  {assignment.grantedByName ?? "—"}
                </Td>
                <Td className="knglmrt-num align-middle">
                  {formatDate(assignment.createdAt)}
                </Td>
                <Td className="align-middle text-right">
                  <Button
                    kind="danger-secondary"
                    size="chip"
                    disabled={busy}
                    onClick={() => void revoke(assignment)}
                  >
                    Entziehen
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {grantableRoles.length > 0 ? (
        <section className="flex flex-col gap-4 knglmrt-border bg-card p-5">
          <h3 className="knglmrt-card-title">Rolle vergeben</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <NativeSelect
              label="Rolle"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setScope("");
              }}
            >
              <option value="">Rolle wählen</option>
              {grantableRoles.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              label="Bereich"
              value={scope}
              disabled={!role}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="">Bereich wählen</option>
              {grantableScopes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {role ? (
            <p className="text-muted-foreground">
              {grantableRoles.find((entry) => entry.name === role)?.description}
            </p>
          ) : null}
          <div>
            <Button
              kind="primary"
              disabled={busy || !role || !scope}
              onClick={() => void grant()}
            >
              {busy ? "Speichert …" : "Vergeben"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
