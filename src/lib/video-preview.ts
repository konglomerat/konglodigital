import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import { isVideoMimeType } from "@/lib/resource-media";

const PREVIEW_DURATION_SECONDS = 12;
const PREVIEW_MAX_WIDTH = 960;
const POSTER_QUALITY = 82;
const FFMPEG_CANDIDATES = [ffmpegPath, "ffmpeg"].filter(
  (value): value is string => typeof value === "string" && value.length > 0,
);

const runFfmpeg = async (args: string[]) => {
  if (FFMPEG_CANDIDATES.length === 0) {
    throw new Error("No ffmpeg binary is available.");
  }

  let lastLaunchError: Error | null = null;

  for (const binary of FFMPEG_CANDIDATES) {
    try {
      await new Promise<void>((resolve, reject) => {
        const stderrChunks: Buffer[] = [];
        const child = spawn(binary, args, {
          stdio: ["ignore", "ignore", "pipe"],
        });

        child.stderr.on("data", (chunk: Buffer | string) => {
          stderrChunks.push(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
          );
        });

        child.on("error", (error) => {
          const launchError = error as NodeJS.ErrnoException;
          if (launchError.code === "ENOENT" || launchError.code === "EACCES") {
            reject(launchError);
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
      const launchError = error as NodeJS.ErrnoException;
      if (launchError.code === "ENOENT" || launchError.code === "EACCES") {
        lastLaunchError = new Error(
          `Unable to launch ffmpeg from ${binary}: ${launchError.message}`,
        );
        continue;
      }
      throw error;
    }
  }

  throw lastLaunchError ??
    new Error("No ffmpeg binary could be launched.");
};

export const generateVideoPreviewBuffer = async (file: File) => {
  if (!isVideoMimeType(file.type)) {
    return null;
  }

  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "konglo-video-preview-"),
  );
  const inputExtension = path.extname(file.name || "") || ".mp4";
  const inputPath = path.join(tempDirectory, `input${inputExtension}`);
  const outputPath = path.join(tempDirectory, "preview.mp4");

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
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

    return {
      data: await readFile(outputPath),
      contentType: "video/mp4",
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

export const generateVideoPosterBuffer = async (file: File) => {
  if (!isVideoMimeType(file.type)) {
    return null;
  }

  const tempDirectory = await mkdtemp(
    path.join(tmpdir(), "konglo-video-poster-"),
  );
  const inputExtension = path.extname(file.name || "") || ".mp4";
  const inputPath = path.join(tempDirectory, `input${inputExtension}`);
  const outputPath = path.join(tempDirectory, "poster.jpg");

  try {
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
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

    return {
      data: await readFile(outputPath),
      contentType: "image/jpeg",
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};