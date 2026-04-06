#!/usr/bin/env node

import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const optionalEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    bucket: process.env.SUPABASE_RESOURCES_BUCKET || "resources",
    prefix: "",
    quality: 80,
    dryRun: false,
    skipDb: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--skip-db") {
      options.skipDb = true;
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

    if (arg.startsWith("--quality=")) {
      const value = Number(arg.slice("--quality=".length));
      if (!Number.isFinite(value) || value < 1 || value > 100) {
        throw new Error("--quality must be a number between 1 and 100.");
      }
      options.quality = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const createSupabaseAdminClient = () => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (serviceRoleKey.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be the service role secret, not a publishable key.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
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
        const nestedFiles = await listAllFiles(storage, bucket, itemPath);
        files.push(...nestedFiles);
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

const toJpgPath = (filePath) => filePath.replace(/\.png$/i, ".jpg");

const normalizeBaseUrl = (value, envName) => {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/g, "");
    return `${parsed.origin}${pathname}/`;
  } catch {
    throw new Error(`${envName} must be a valid URL.`);
  }
};

const resolveStorageBases = ({ origin, bucket }) => {
  const objectBaseFromEnv = optionalEnv(
    "SUPABASE_STORAGE_OBJECT_PUBLIC_BASE_URL",
  );
  const renderBaseFromEnv = optionalEnv(
    "SUPABASE_STORAGE_RENDER_PUBLIC_BASE_URL",
  );

  return {
    objectBase: objectBaseFromEnv
      ? normalizeBaseUrl(
          objectBaseFromEnv,
          "SUPABASE_STORAGE_OBJECT_PUBLIC_BASE_URL",
        )
      : `${origin}/storage/v1/object/public/${bucket}/`,
    renderBase: renderBaseFromEnv
      ? normalizeBaseUrl(
          renderBaseFromEnv,
          "SUPABASE_STORAGE_RENDER_PUBLIC_BASE_URL",
        )
      : `${origin}/storage/v1/render/image/public/${bucket}/`,
  };
};

const buildPathVariants = (bases, bucket, sourcePath, targetPath) => {
  const { objectBase, renderBase } = bases;

  return new Map([
    [sourcePath, targetPath],
    [`/${sourcePath}`, `/${targetPath}`],
    [`${bucket}/${sourcePath}`, `${bucket}/${targetPath}`],
    [`/${bucket}/${sourcePath}`, `/${bucket}/${targetPath}`],
    [`${objectBase}${sourcePath}`, `${objectBase}${targetPath}`],
    [`${renderBase}${sourcePath}`, `${renderBase}${targetPath}`],
  ]);
};

const replaceReference = (value, replacements) => {
  if (!value || typeof value !== "string") {
    return value;
  }

  const direct = replacements.get(value);
  if (direct) {
    return direct;
  }

  try {
    const parsed = new URL(value);
    const withoutQuery = `${parsed.origin}${parsed.pathname}`;
    const pathReplacement = replacements.get(withoutQuery);

    if (pathReplacement) {
      const replacementUrl = new URL(pathReplacement);
      replacementUrl.search = parsed.search;
      replacementUrl.hash = parsed.hash;
      return replacementUrl.toString();
    }
  } catch {
    return value;
  }

  return value;
};

const updateResourcesTableReferences = async (
  supabase,
  replacements,
  options,
) => {
  if (options.skipDb) {
    console.log("Skipping DB reference updates (--skip-db).");
    return {
      scannedRows: 0,
      updatedRows: 0,
      updatedImageFields: 0,
      updatedImagesEntries: 0,
    };
  }

  let scannedRows = 0;
  let updatedRows = 0;
  let updatedImageFields = 0;
  let updatedImagesEntries = 0;

  const pageSize = 500;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("resources")
      .select("id,image,images")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to read resources table: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    scannedRows += data.length;

    for (const row of data) {
      const currentImage = typeof row.image === "string" ? row.image : null;
      const currentImages = Array.isArray(row.images)
        ? row.images.filter((entry) => typeof entry === "string")
        : null;

      const nextImage = currentImage
        ? replaceReference(currentImage, replacements)
        : currentImage;

      let imagesChangedCount = 0;
      const nextImages = currentImages
        ? currentImages.map((entry) => {
            const nextEntry = replaceReference(entry, replacements);
            if (nextEntry !== entry) {
              imagesChangedCount += 1;
            }
            return nextEntry;
          })
        : currentImages;

      const imageChanged = currentImage !== nextImage;
      const imagesChanged = imagesChangedCount > 0;

      if (!imageChanged && !imagesChanged) {
        continue;
      }

      if (options.dryRun) {
        updatedRows += 1;
        if (imageChanged) {
          updatedImageFields += 1;
        }
        updatedImagesEntries += imagesChangedCount;
        console.log(`[dry-run][db] resources/${row.id}`);
        continue;
      }

      const updatePayload = {};
      if (imageChanged) {
        updatePayload.image = nextImage;
      }
      if (imagesChanged) {
        updatePayload.images = nextImages;
      }

      const { error: updateError } = await supabase
        .from("resources")
        .update(updatePayload)
        .eq("id", row.id);

      if (updateError) {
        throw new Error(
          `Failed to update resources row ${row.id}: ${updateError.message}`,
        );
      }

      updatedRows += 1;
      if (imageChanged) {
        updatedImageFields += 1;
      }
      updatedImagesEntries += imagesChangedCount;
      console.log(`[ok][db] resources/${row.id}`);
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return {
    scannedRows,
    updatedRows,
    updatedImageFields,
    updatedImagesEntries,
  };
};

const main = async () => {
  const options = parseArgs();
  const supabase = createSupabaseAdminClient();
  const storage = supabase.storage;
  const supabaseOrigin = new URL(requiredEnv("SUPABASE_URL")).origin;
  const storageBases = resolveStorageBases({
    origin: supabaseOrigin,
    bucket: options.bucket,
  });

  console.log(`Bucket: ${options.bucket}`);
  console.log(`Prefix: ${options.prefix || "/"}`);
  console.log(`Quality: ${options.quality}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Update DB refs: ${options.skipDb ? "no" : "yes"}`);
  console.log(`Object base URL: ${storageBases.objectBase}`);
  console.log(`Render base URL: ${storageBases.renderBase}`);

  const allFiles = await listAllFiles(storage, options.bucket, options.prefix);
  const pngFiles = allFiles.filter(
    (filePath) => path.extname(filePath).toLowerCase() === ".png",
  );

  const replacements = new Map();
  for (const sourcePath of pngFiles) {
    const targetPath = toJpgPath(sourcePath);
    for (const [source, target] of buildPathVariants(
      storageBases,
      options.bucket,
      sourcePath,
      targetPath,
    )) {
      replacements.set(source, target);
    }
  }

  if (pngFiles.length === 0) {
    console.log("No PNG files found in storage.");
  } else {
    console.log(`Found ${pngFiles.length} PNG file(s).`);
  }

  let converted = 0;
  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const sourcePath of pngFiles) {
    const targetPath = toJpgPath(sourcePath);

    try {
      if (options.dryRun) {
        console.log(`[dry-run] ${sourcePath} -> ${targetPath}`);
        skipped += 1;
        continue;
      }

      const { data: downloadData, error: downloadError } = await storage
        .from(options.bucket)
        .download(sourcePath);

      if (downloadError || !downloadData) {
        throw new Error(downloadError?.message || "download failed");
      }

      const sourceBuffer = Buffer.from(await downloadData.arrayBuffer());
      const jpgBuffer = await sharp(sourceBuffer)
        .jpeg({ quality: options.quality, mozjpeg: true })
        .toBuffer();

      const { error: uploadError } = await storage
        .from(options.bucket)
        .upload(targetPath, jpgBuffer, {
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        throw new Error(`upload failed: ${uploadError.message}`);
      }

      converted += 1;

      const { error: removeError } = await storage
        .from(options.bucket)
        .remove([sourcePath]);

      if (removeError) {
        throw new Error(
          `uploaded JPG but failed to delete PNG: ${removeError.message}`,
        );
      }

      deleted += 1;
      console.log(`[ok] ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${sourcePath}: ${message}`);
    }
  }

  console.log("\nSummary:");
  console.log(`- Converted: ${converted}`);
  console.log(`- Deleted PNG: ${deleted}`);
  console.log(`- Dry-run skipped: ${skipped}`);
  console.log(`- Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }

  const dbResult = await updateResourcesTableReferences(
    supabase,
    replacements,
    options,
  );

  console.log("\nDB Summary:");
  console.log(`- Rows scanned: ${dbResult.scannedRows}`);
  console.log(`- Rows updated: ${dbResult.updatedRows}`);
  console.log(`- image fields changed: ${dbResult.updatedImageFields}`);
  console.log(`- images[] entries changed: ${dbResult.updatedImagesEntries}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
