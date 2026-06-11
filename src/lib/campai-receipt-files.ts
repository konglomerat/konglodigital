const DEFAULT_FILE_NAME = "nachweis.dat";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
// A failed upload is non-fatal: the receipt is still created, only without the
// file attached. This warning informs the user so they can re-upload manually.
const UPLOAD_WARNING =
  "Upload der Belegdatei fehlgeschlagen, Buchung wurde erstmal ohne Anhang angelegt. Bitte wende dich an die Buchhaltung, die Datei kann manuell in Campai hochgeladen werden.";

const logUploadFailure = (step: string, detail: string) => {
  console.error(`[campai-upload] ${step}: ${detail}`);
};

const sanitizeHeaderFileName = (fileName: string) => {
  const cleaned = (fileName || DEFAULT_FILE_NAME)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || DEFAULT_FILE_NAME;
};

const buildContentDisposition = (fileName: string) => {
  const safeFileName = sanitizeHeaderFileName(fileName);
  const encodedFileName = encodeURIComponent(fileName || DEFAULT_FILE_NAME);
  return `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`;
};

type UploadCampaiReceiptFileParams = {
  apiKey: string;
  baseUrl: string;
  endpointOverride?: string;
  fileBase64: string;
  fileName: string;
  fileContentType: string;
};

type UploadCampaiReceiptFileResult = {
  receiptFileId: string | null;
  uploadWarning?: string;
};

const extractUploadId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const direct = record._id ?? record.id ?? record.fileId ?? record.documentId;
  if (typeof direct === "string" && direct.trim()) return direct;
  return extractUploadId(record.data) ?? extractUploadId(record.result);
};

const buildFormData = (blob: Blob, fileName: string) => {
  const formData = new FormData();
  formData.append("file", blob, sanitizeHeaderFileName(fileName));
  return formData;
};

const uploadViaStorageUrl = async (
  apiKey: string,
  blob: Blob,
  fileName: string,
  contentType: string,
): Promise<string | null> => {
  const urlResponse = await fetch(
    "https://cloud.campai.com/api/misc/storage/uploadUrl",
    { method: "GET", headers: { "X-API-Key": apiKey } },
  );
  if (!urlResponse.ok) {
    const detail = await urlResponse.text().catch(() => "");
    logUploadFailure(
      "GET /misc/storage/uploadUrl",
      `${urlResponse.status} ${detail}`.trim(),
    );
    return null;
  }

  const payload = (await urlResponse.json().catch(() => null)) as
    | { id?: string; url?: string }
    | null;
  const id = payload?.id;
  const url = payload?.url;
  if (!id || !url) {
    logUploadFailure(
      "GET /misc/storage/uploadUrl",
      `Antwort ohne id/url: ${JSON.stringify(payload)}`,
    );
    return null;
  }

  const putResponse = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || DEFAULT_CONTENT_TYPE,
      "Content-Disposition": buildContentDisposition(fileName),
    },
    body: blob,
  });
  if (putResponse.ok) return id;

  const putDetail = await putResponse.text().catch(() => "");
  logUploadFailure("PUT presigned URL", `${putResponse.status} ${putDetail}`.trim());

  const postResponse = await fetch(url, {
    method: "POST",
    body: buildFormData(blob, fileName),
  });
  if (postResponse.ok) return id;

  const postDetail = await postResponse.text().catch(() => "");
  logUploadFailure(
    "POST presigned URL",
    `${postResponse.status} ${postDetail}`.trim(),
  );
  return null;
};

const uploadViaEndpoint = async (
  apiKey: string,
  endpoint: string,
  blob: Blob,
  fileName: string,
): Promise<string | null> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: buildFormData(blob, fileName),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logUploadFailure(`POST ${endpoint}`, `${response.status} ${detail}`.trim());
    return null;
  }
  return extractUploadId(await response.json().catch(() => null));
};

export const uploadCampaiReceiptFile = async (
  params: UploadCampaiReceiptFileParams,
): Promise<UploadCampaiReceiptFileResult> => {
  const {
    apiKey,
    baseUrl,
    endpointOverride,
    fileBase64,
    fileName,
    fileContentType,
  } = params;

  if (!fileBase64) return { receiptFileId: null };

  const bytes = Uint8Array.from(Buffer.from(fileBase64, "base64"));
  const blob = new Blob([bytes], {
    type: fileContentType || DEFAULT_CONTENT_TYPE,
  });

  const storageId = await uploadViaStorageUrl(
    apiKey,
    blob,
    fileName,
    fileContentType,
  );
  if (storageId) return { receiptFileId: storageId };

  const endpoints = endpointOverride
    ? [endpointOverride]
    : [
        `${baseUrl}/files/upload`,
        `${baseUrl}/documents/upload`,
        `${baseUrl}/finance/files/upload`,
        `${baseUrl}/finance/receipts/files/upload`,
      ];

  for (const endpoint of endpoints) {
    const id = await uploadViaEndpoint(apiKey, endpoint, blob, fileName);
    if (id) return { receiptFileId: id };
  }

  return { receiptFileId: null, uploadWarning: UPLOAD_WARNING };
};
