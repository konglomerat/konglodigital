// Fetch für die serverseitigen Supabase-Clients.
//
// Der selbst gehostete Supabase-Server hängt gelegentlich für mehrere Sekunden.
// Ohne Timeout wartet `auth.getUser()` dann bis zum Connect-Timeout von undici
// und liefert anschließend keinen User — die API-Routen antworten mit 401
// "Unauthorized", obwohl die Sitzung gültig ist. Deshalb bekommen Requests an
// /auth/v1/ pro Versuch ein eigenes Timeout, und lesende (GET/HEAD, z. B.
// /auth/v1/user) werden bei Netzwerk- oder Gateway-Fehlern wiederholt.
// Schreibende Requests werden nie wiederholt. Datenbank- und Storage-Requests
// laufen unverändert durch — dort darf ein Download auch länger dauern.

const ATTEMPT_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const describeUrl = (input: RequestInfo | URL) => {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
};

export const resilientSupabaseFetch: typeof fetch = async (input, init) => {
  const path = describeUrl(input);
  if (!path.includes("/auth/v1/")) {
    return fetch(input, init);
  }

  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const retryable = method === "GET" || method === "HEAD";
  const attempts = retryable ? MAX_ATTEMPTS : 1;
  const callerSignal = init?.signal ?? undefined;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await fetch(input, { ...init, signal });
      if (attempt === attempts || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }
      void response.body?.cancel().catch(() => {});
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      // Vom Aufrufer abgebrochen: nicht wiederholen.
      if (callerSignal?.aborted) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < attempts) {
      console.warn(
        `[supabase] ${method} ${path} fehlgeschlagen (Versuch ${attempt}/${attempts}), neuer Versuch:`,
        lastError instanceof Error ? lastError.message : lastError,
      );
      await wait(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(
    `[supabase] ${method} ${path} nach ${attempts} Versuch(en) fehlgeschlagen:`,
    lastError instanceof Error ? lastError.message : lastError,
  );
  throw lastError;
};
