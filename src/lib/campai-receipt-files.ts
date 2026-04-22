const DEFAULT_FILE_NAME = "nachweis.dat";
const DEFAULT_CONTENT_TYPE = "application/octet-stream";
const UPLOAD_WARNING =
  "Upload von 'Nachweis über Vorgang' zu Campai fehlgeschlagen. Beleg wurde ohne Dateianhang erstellt.";

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
  formData.append("file", blob, fileName || DEFAULT_FILE_NAME);
  return formData;
};

const uploadViaStorageUrl = async (
  apiKey: string,
  blob: Blob,
  fileName: string,
  contentType: string,
): Promise<string | null> => {
  const urlResponse = await fetch(
    "https://cloud.campai.com/api/storage/uploadUrl",
    { method: "GET", headers: { "X-API-Key": apiKey } },
  );
  if (!urlResponse.ok) return null;

  const payload = (await urlResponse.json().catch(() => null)) as
    | { id?: string; url?: string }
    | null;
  const id = payload?.id;
  const url = payload?.url;
  if (!id || !url) return null;

  const putResponse = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || DEFAULT_CONTENT_TYPE,
      "Content-Disposition": `inline; filename="${fileName || DEFAULT_FILE_NAME}"`,
    },
    body: blob,
  });
  if (putResponse.ok) return id;

  const postResponse = await fetch(url, {
    method: "POST",
    body: buildFormData(blob, fileName),
  });
  return postResponse.ok ? id : null;
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
  if (!response.ok) return null;
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
