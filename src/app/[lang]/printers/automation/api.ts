export async function automationApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/printer-automation${path}`, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Anfrage fehlgeschlagen.");
  return data;
}
