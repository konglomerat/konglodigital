/** Only the configured inventory client delegates authorization to inventory. */
export function isInventoryOAuthClient(clientId: unknown, configuredId: string) {
  return Boolean(configuredId) && typeof clientId === "string" && clientId === configuredId;
}
