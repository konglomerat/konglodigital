// Geltungsbereiche (Tabelle `scopes`): Werkbereiche und Projekte, an die eine
// Rolle gebunden sein kann. campaiCostCenter verknüpft den Bereich mit seiner
// zweistelligen Campai-Kostenstelle 2 — darüber filtert die Buchhaltung.

export const SCOPE_TYPES = ["werkbereich", "projekt"] as const;

export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SCOPE_TYPE_LABELS: Record<ScopeType, string> = {
  werkbereich: "Werkbereich",
  projekt: "Projekt",
};

export type Scope = {
  id: string;
  name: string;
  type: ScopeType;
  campaiCostCenter: string | null;
};

/** In URLs und Formularen steht der globale Geltungsbereich als "global". */
export const GLOBAL_SCOPE_PARAM = "global";

/** Das Volkshaus-Projekt — die Raumbuchung gehört zu seinen Tools. */
export const VOLKSHAUS_SCOPE_ID = "vhc";

export const findScope = (scopes: readonly Scope[], scopeId: string | null) =>
  scopeId === null
    ? null
    : (scopes.find((scope) => scope.id === scopeId) ?? null);

export const sortScopes = (scopes: readonly Scope[]) =>
  [...scopes].sort(
    (left, right) =>
      SCOPE_TYPES.indexOf(left.type) - SCOPE_TYPES.indexOf(right.type) ||
      left.name.localeCompare(right.name, "de"),
  );
