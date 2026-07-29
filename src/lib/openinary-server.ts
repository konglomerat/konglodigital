import "server-only";

type OpeninaryUploadFile = {
  filename: string;
  path: string;
  size: number;
  url: string;
  prewarmedUrls?: string[];
};

type OpeninaryUploadResponse = {
  success: boolean;
  files?: OpeninaryUploadFile[];
  errors?: Array<{ filename?: string; error?: string }>;
};

type UploadOpeninaryMediaOptions = {
  data: Buffer | Uint8Array;
  contentType: string;
  path: string;
  transformations?: string[];
};

const requiredEnv = (name: "OPENINARY_BASE_URL" | "OPENINARY_API_KEY") => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
};

const splitStoragePath = (path: string) => {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const filename = segments.pop();

  if (!filename) {
    throw new Error("Openinary upload path must include a filename.");
  }

  return {
    filename,
    folder: segments.join("/"),
  };
};

export const uploadOpeninaryMedia = async ({
  data,
  contentType,
  path,
  transformations = [],
}: UploadOpeninaryMediaOptions) => {
  const baseUrl = requiredEnv("OPENINARY_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("OPENINARY_API_KEY");
  const { filename, folder } = splitStoragePath(path);
  const bytes = new Uint8Array(data);
  const form = new FormData();

  form.append("files", new File([bytes], filename, { type: contentType }));
  form.append("names", filename);
  if (folder) {
    form.append("folder", folder);
  }
  for (const transformation of transformations) {
    form.append("transformations", transformation);
  }

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const responseText = await response.text();

  let payload: OpeninaryUploadResponse | null = null;
  try {
    payload = JSON.parse(responseText) as OpeninaryUploadResponse;
  } catch {
    payload = null;
  }

  const uploadedFile = payload?.files?.[0];
  if (!response.ok || !uploadedFile?.path) {
    const uploadError =
      payload?.errors?.[0]?.error ??
      (responseText && responseText.length < 500 ? responseText : null) ??
      `HTTP ${response.status}`;
    throw new Error(`Openinary upload failed: ${uploadError}`);
  }

  return {
    ...uploadedFile,
    url: `${baseUrl}/t/${uploadedFile.path.replace(/^\/+/, "")}`,
  };
};
