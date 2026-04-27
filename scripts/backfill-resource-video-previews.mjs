#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@supabase/supabase-js";

const VIDEO_EXTENSIONS = new Set([
  ".m4v",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".ogv",
  ".webm",
]);

const PREVIEW_DURATION_SECONDS = 12;
const PREVIEW_MAX_WIDTH = 960;
const POSTER_QUALITY = 4;
const FFMPEG_CANDIDATES = [ffmpegPath, "ffmpeg"].filter(
  (value) => typeof value === "string" && value.length > 0,
);

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
    bucket: process.env.SUPABASE_RESOURCES_BUCKET || "resources",
    dryRun: false,
    force: false,
    limit: null,
    resourceId: null,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg.startsWith("--bucket=")) {
      options.bucket = arg.slice("--bucket=".length).trim();
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = parsed;
      continue;
    }

    if (arg.startsWith("--resource-id=")) {
      const value = arg.slice("--resource-id=".length).trim();
      options.resourceId = value || null;
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

const isVideoUrl = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }

  try {
    const pathname = new URL(value).pathname;
    return VIDEO_EXTENSIONS.has(path.extname(pathname).toLowerCase());
  } catch {
    return VIDEO_EXTENSIONS.has(path.extname(value).toLowerCase());
  }
};

const extractStoragePath = (url, bucket) => {
  try {
    const parsed = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return parsed.pathname.slice(index + marker.length);
  } catch {
    return null;
  }
};

const buildPreviewVideoPath = (storagePath) => {
  const extension = path.extname(storagePath);
  const base = extension
    ? storagePath.slice(0, -extension.length)
    : storagePath;
  return `${base}-preview.mp4`;
};

const buildPosterImagePath = (storagePath) => {
  const extension = path.extname(storagePath);
  const base = extension
    ? storagePath.slice(0, -extension.length)
    : storagePath;
  return `${base}-poster.jpg`;
};

const runFfmpeg = async (args) => {
  if (FFMPEG_CANDIDATES.length === 0) {
    throw new Error("No ffmpeg binary is available.");
  }

  let lastLaunchError = null;

  for (const binary of FFMPEG_CANDIDATES) {
    try {
      await new Promise((resolve, reject) => {
        const stderrChunks = [];
        const child = spawn(binary, args, {
          stdio: ["ignore", "ignore", "pipe"],
        });

        child.stderr.on("data", (chunk) => {
          stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        child.on("error", (error) => {
          if (error?.code === "ENOENT" || error?.code === "EACCES") {
            reject(error);
            return;
          }
          reject(error);
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
          reject(
            new Error(
              stderr
                ? `ffmpeg preview generation failed: ${stderr}`
                : "ffmpeg preview generation failed.",
            ),
          );
        });
      });

      return;
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES") {
        lastLaunchError = new Error(
          `Unable to launch ffmpeg from ${binary}: ${error.message}`,
        );
        continue;
      }
      throw error;
    }
  }

  throw lastLaunchError ?? new Error("No ffmpeg binary could be launched.");
};

const generateVideoPreviewBuffer = async (inputBuffer, sourcePath) => {
  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "konglo-video-preview-backfill-"),
  );
  const inputExtension = path.extname(sourcePath) || ".mp4";
  const inputPath = path.join(tempDirectory, `input${inputExtension}`);
  const outputPath = path.join(tempDirectory, "preview.mp4");

  try {
    await writeFile(inputPath, inputBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-an",
      "-sn",
      "-dn",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale='min(${PREVIEW_MAX_WIDTH},iw)':-2:flags=lanczos`,
      "-movflags",
      "+faststart",
      "-t",
      String(PREVIEW_DURATION_SECONDS),
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

const generateVideoPosterBuffer = async (inputBuffer, sourcePath) => {
  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "konglo-video-poster-backfill-"),
  );
  const inputExtension = path.extname(sourcePath) || ".mp4";
  const inputPath = path.join(tempDirectory, `input${inputExtension}`);
  const outputPath = path.join(tempDirectory, "poster.jpg");

  try {
    await writeFile(inputPath, inputBuffer);
    await runFfmpeg([
      "-y",
      "-ss",
      "00:00:01",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      String(POSTER_QUALITY),
      "-vf",
      `scale='min(${PREVIEW_MAX_WIDTH},iw)':-2:flags=lanczos`,
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

const listResourceRows = async (supabase, options) => {
  const pageSize = 500;
  let from = 0;
  const rows = [];

  while (true) {
    let query = supabase
      .from("resources")
      .select("id,image,images,media_previews,media_posters")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (options.resourceId) {
      query = query.eq("id", options.resourceId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load resources: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (options.resourceId || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
};

const main = async () => {
  const options = parseArgs();
  const supabase = createSupabaseAdminClient();

  console.log(`Bucket: ${options.bucket}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);
  console.log(`Force regenerate: ${options.force ? "yes" : "no"}`);
  console.log(`Limit: ${options.limit ?? "none"}`);
  console.log(`Resource filter: ${options.resourceId ?? "none"}`);

  const rows = await listResourceRows(supabase, options);
  console.log(`Loaded ${rows.length} resource row(s).`);

  let processedResources = 0;
  let generatedPreviews = 0;
  let generatedPosters = 0;
  let skippedExisting = 0;
  let skippedNoVideo = 0;
  let failed = 0;

  for (const row of rows) {
    const mediaUrls = [
      ...(typeof row.image === "string" ? [row.image] : []),
      ...(Array.isArray(row.images)
        ? row.images.filter((entry) => typeof entry === "string")
        : []),
    ];
    const videoUrls = Array.from(new Set(mediaUrls.filter(isVideoUrl)));

    if (videoUrls.length === 0) {
      skippedNoVideo += 1;
      continue;
    }

    const currentMediaPreviews =
      row.media_previews && typeof row.media_previews === "object"
        ? { ...row.media_previews }
        : {};
    const currentMediaPosters =
      row.media_posters && typeof row.media_posters === "object"
        ? { ...row.media_posters }
        : {};

    let resourceChanged = false;
    let resourceGeneratedCount = 0;

    for (const videoUrl of videoUrls) {
      if (
        !options.force &&
        typeof currentMediaPreviews[videoUrl] === "string" &&
        typeof currentMediaPosters[videoUrl] === "string"
      ) {
        skippedExisting += 1;
        continue;
      }

      if (options.limit !== null && generatedPreviews >= options.limit) {
        break;
      }

      const sourcePath = extractStoragePath(videoUrl, options.bucket);
      if (!sourcePath) {
        console.warn(
          `[skip] ${row.id} could not resolve storage path for ${videoUrl}`,
        );
        failed += 1;
        continue;
      }

      const previewPath = buildPreviewVideoPath(sourcePath);
      const previewUrl = supabase.storage
        .from(options.bucket)
        .getPublicUrl(previewPath).data.publicUrl;
      const posterPath = buildPosterImagePath(sourcePath);
      const posterUrl = supabase.storage
        .from(options.bucket)
        .getPublicUrl(posterPath).data.publicUrl;

      try {
        if (options.dryRun) {
          console.log(
            `[dry-run] ${row.id} ${sourcePath} -> ${previewPath}, ${posterPath}`,
          );
          currentMediaPreviews[videoUrl] = previewUrl;
          currentMediaPosters[videoUrl] = posterUrl;
          resourceChanged = true;
          resourceGeneratedCount += 1;
          generatedPreviews += 1;
          generatedPosters += 1;
          continue;
        }

        const { data: downloadData, error: downloadError } = await supabase.storage
          .from(options.bucket)
          .download(sourcePath);

        if (downloadError || !downloadData) {
          throw new Error(downloadError?.message || "download failed");
        }

        const sourceBuffer = Buffer.from(await downloadData.arrayBuffer());
        const previewBuffer = await generateVideoPreviewBuffer(
          sourceBuffer,
          sourcePath,
        );
        const posterBuffer = await generateVideoPosterBuffer(
          sourceBuffer,
          sourcePath,
        );

        const { error: uploadError } = await supabase.storage
          .from(options.bucket)
          .upload(previewPath, previewBuffer, {
            upsert: true,
            contentType: "video/mp4",
          });

        if (uploadError) {
          throw new Error(`upload failed: ${uploadError.message}`);
        }

        const { error: posterUploadError } = await supabase.storage
          .from(options.bucket)
          .upload(posterPath, posterBuffer, {
            upsert: true,
            contentType: "image/jpeg",
          });

        if (posterUploadError) {
          throw new Error(`poster upload failed: ${posterUploadError.message}`);
        }

        currentMediaPreviews[videoUrl] = previewUrl;
        currentMediaPosters[videoUrl] = posterUrl;
        resourceChanged = true;
        resourceGeneratedCount += 1;
        generatedPreviews += 1;
        generatedPosters += 1;
        console.log(
          `[ok] ${row.id} ${sourcePath} -> ${previewPath}, ${posterPath}`,
        );
      } catch (error) {
        failed += 1;
        console.error(
          `[error] ${row.id} ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (resourceChanged) {
      processedResources += 1;
      if (!options.dryRun) {
        const { error: updateError } = await supabase
          .from("resources")
          .update({
            media_previews: currentMediaPreviews,
            media_posters: currentMediaPosters,
          })
          .eq("id", row.id);

        if (updateError) {
          failed += resourceGeneratedCount;
          generatedPreviews -= resourceGeneratedCount;
          generatedPosters -= resourceGeneratedCount;
          console.error(
            `[error] ${row.id} failed to update media metadata: ${updateError.message}`,
          );
        }
      }
    }

    if (options.limit !== null && generatedPreviews >= options.limit) {
      break;
    }
  }

  console.log("Summary:");
  console.log(`  Resources updated: ${processedResources}`);
  console.log(`  Preview videos generated: ${generatedPreviews}`);
  console.log(`  Poster images generated: ${generatedPosters}`);
  console.log(`  Existing previews skipped: ${skippedExisting}`);
  console.log(`  Resources without videos skipped: ${skippedNoVideo}`);
  console.log(`  Failures: ${failed}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});