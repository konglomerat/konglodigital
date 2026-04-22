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

const emptyUploadResult = (): UploadCampaiReceiptFileResult => ({
  receiptFileId: null,
  uploadWarning: undefined,
});

const successfulUploadResult = (
  receiptFileId: string,
): UploadCampaiReceiptFileResult => ({
  receiptFileId,
  uploadWarning: undefined,
});

const failedUploadResult = (): UploadCampaiReceiptFileResult => ({
  receiptFileId: null,
  uploadWarning: UPLOAD_WARNING,
});

const extractUploadId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const direct = record._id ?? record.id ?? record.fileId ?? record.documentId;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    return extractUploadId(data);
  }

  const result = record.result;
  if (result && typeof result === "object") {
    return extractUploadId(result);
  }

  return null;
};

const createFileBlob = (fileBytes: Uint8Array, fileContentType: string) => {
  const arrayBuffer = new ArrayBuffer(fileBytes.byteLength);
  new Uint8Array(arrayBuffer).set(fileBytes);

  return new Blob([arrayBuffer], {
    type: fileContentType || DEFAULT_CONTENT_TYPE,
  });
};

const createUploadFormData = (fileBlob: Blob, fileName: string) => {
  const formData = new FormData();
  formData.append("file", fileBlob, fileName || DEFAULT_FILE_NAME);
  return formData;
};

const resolveUploadEndpoints = (
  baseUrl: string,
  endpointOverride?: string,
) =>
  endpointOverride
    ? [endpointOverride]
    : [
        `${baseUrl}/files/upload`,
        `${baseUrl}/documents/upload`,
        `${baseUrl}/finance/files/upload`,
        `${baseUrl}/finance/receipts/files/upload`,
      ];

const tryUploadViaEndpoint = async (params: {
  apiKey: string;
  endpoint: string;
  fileBlob: Blob;
  fileName: string;
}) => {
  const { apiKey, endpoint, fileBlob, fileName } = params;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
    },
    body: createUploadFormData(fileBlob, fileName),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return extractUploadId(payload);
};

const uploadViaStorageUploadUrl = async (params: {
  apiKey: string;
  fileBytes: Uint8Array;
  fileName: string;
  fileContentType: string;
}) => {
  const { apiKey, fileBytes, fileName, fileContentType } = params;

  const uploadUrlResponse = await fetch(
    "https://cloud.campai.com/api/storage/uploadUrl",
    {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
      },
    },
  );

  if (!uploadUrlResponse.ok) {
    return null;
  }

  const uploadUrlPayload = (await uploadUrlResponse
    .json()
    .catch(() => null)) as { id?: string; url?: string } | null;

  const uploadId =
    typeof uploadUrlPayload?.id === "string" ? uploadUrlPayload.id : "";
  const uploadUrl =
    typeof uploadUrlPayload?.url === "string" ? uploadUrlPayload.url : "";

  if (!uploadId || !uploadUrl) {
    return null;
  }

  const fileBlob = createFileBlob(fileBytes, fileContentType);

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": fileContentType || DEFAULT_CONTENT_TYPE,
      "Content-Disposition": `inline; filename="${fileName || DEFAULT_FILE_NAME}"`,
    },
    body: fileBlob,
  });

  if (putResponse.ok) {
    return uploadId;
  }

  const postResponse = await fetch(uploadUrl, {
    method: "POST",
    body: createUploadFormData(fileBlob, fileName),
  });

  return postResponse.ok ? uploadId : null;
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

  if (!fileBase64) {
    return emptyUploadResult();
  }

  const bytes = Uint8Array.from(Buffer.from(fileBase64, "base64"));
  const fileBlob = createFileBlob(bytes, fileContentType);

  const storageUploadId = await uploadViaStorageUploadUrl({
    apiKey,
    fileBytes: bytes,
    fileName,
    fileContentType,
  });

  if (storageUploadId) {
    return successfulUploadResult(storageUploadId);
  }

  for (const endpoint of resolveUploadEndpoints(baseUrl, endpointOverride)) {
    const fileId = await tryUploadViaEndpoint({
      apiKey,
      endpoint,
      fileBlob,
      fileName,
    });

    if (fileId) {
      return successfulUploadResult(fileId);
    }
  }

  return failedUploadResult();
};