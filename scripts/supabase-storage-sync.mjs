#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = process.env.SUPABASE_RESOURCES_BUCKET || "resources";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    bucket: DEFAULT_BUCKET,
    prefix: "",
    dryRun: false,
    overwrite: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (arg.startsWith("--bucket=")) {
      options.bucket = arg.slice("--bucket=".length).trim();
      continue;
    }

    if (arg.startsWith("--prefix=")) {
      options.prefix = arg
        .slice("--prefix=".length)
        .trim()
        .replace(/^\/+|\/+$/g, "");
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const createAdminClient = (urlVarName, keyVarName) => {
  const url = requiredEnv(urlVarName);
  const serviceRoleKey = requiredEnv(keyVarName);

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const listAllFiles = async (storage, bucket, prefix = "") => {
  const files = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(
        `Failed to list bucket '${bucket}' at prefix '${prefix || "/"}': ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      const isFolder = !item.id && !item.metadata;

      if (isFolder) {
        const nested = await listAllFiles(storage, bucket, itemPath);
        files.push(...nested);
      } else {
        files.push(itemPath);
      }
    }

    if (data.length < limit) {
      break;
    }

    offset += limit;
  }

  return files;
};

const ensureBucketExists = async (client, bucket) => {
  const { data, error } = await client.storage.getBucket(bucket);
  if (!error && data) {
    return;
  }

  const { error: createError } = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: "50MB",
  });

  if (createError) {
    throw new Error(
      `Target bucket '${bucket}' does not exist and could not be created: ${createError.message}`,
    );
  }
};

const detectMimeType = (path) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
};

const main = async () => {
  const options = parseArgs();

  const source = createAdminClient(
    "SOURCE_SUPABASE_URL",
    "SOURCE_SUPABASE_SERVICE_ROLE_KEY",
  );
  const target = createAdminClient(
    "TARGET_SUPABASE_URL",
    "TARGET_SUPABASE_SERVICE_ROLE_KEY",
  );

  await ensureBucketExists(target, options.bucket);

  console.log("Running storage sync...");
  console.log(`Bucket: ${options.bucket}`);
  console.log(`Prefix: ${options.prefix || "/"}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Overwrite existing: ${options.overwrite ? "yes" : "no"}`);

  const sourceFiles = await listAllFiles(
    source.storage,
    options.bucket,
    options.prefix,
  );
  const targetFiles = await listAllFiles(
    target.storage,
    options.bucket,
    options.prefix,
  );
  const targetSet = new Set(targetFiles);

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of sourceFiles) {
    if (!options.overwrite && targetSet.has(filePath)) {
      skipped += 1;
      continue;
    }

    if (options.dryRun) {
      copied += 1;
      console.log(`[dry-run] ${filePath}`);
      continue;
    }

    try {
      const { data: sourceBlob, error: downloadError } = await source.storage
        .from(options.bucket)
        .download(filePath);

      if (downloadError || !sourceBlob) {
        throw new Error(downloadError?.message || "download failed");
      }

      const buffer = Buffer.from(await sourceBlob.arrayBuffer());
      const { error: uploadError } = await target.storage
        .from(options.bucket)
        .upload(filePath, buffer, {
          upsert: options.overwrite,
          contentType: detectMimeType(filePath),
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      copied += 1;
      console.log(`[ok] ${filePath}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${filePath}: ${message}`);
    }
  }

  console.log("\nSummary:");
  console.log(`- Source files scanned: ${sourceFiles.length}`);
  console.log(`- Target files scanned: ${targetFiles.length}`);
  console.log(`- Copied: ${copied}`);
  console.log(`- Skipped existing: ${skipped}`);
  console.log(`- Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
