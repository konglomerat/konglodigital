import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import {
  getUploadedMediaPublicUrl,
  uploadOpeninaryMedia,
} from "@/lib/openinary-server";

const MAX_GIF_FRAMES = 12;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const OUTPUT_WIDTH = 1_080;
const MIN_FRAME_DURATION_MS = 200;
const MAX_FRAME_DURATION_MS = 10_000;
const FFMPEG_EXECUTABLE = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const installedFfmpegPath = path.join(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  FFMPEG_EXECUTABLE,
);
const FFMPEG_CANDIDATES = Array.from(
  new Set(
    [process.env.FFMPEG_BIN, installedFfmpegPath, ffmpegPath, "ffmpeg"].filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0,
    ),
  ),
);

export type NewsletterImagePosition = {
  x: number;
  y: number;
};

const CENTER_IMAGE_POSITION: NewsletterImagePosition = { x: 0.5, y: 0.5 };

const clampPosition = (value: number) => Math.min(1, Math.max(0, value));

const normalizeImagePosition = (
  value: NewsletterImagePosition | null | undefined,
): NewsletterImagePosition => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return {
    x: Number.isFinite(x) ? clampPosition(x) : CENTER_IMAGE_POSITION.x,
    y: Number.isFinite(y) ? clampPosition(y) : CENTER_IMAGE_POSITION.y,
  };
};

export const normalizeGifFrameDuration = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1_000;
  return Math.min(
    MAX_FRAME_DURATION_MS,
    Math.max(MIN_FRAME_DURATION_MS, Math.round(parsed)),
  );
};

const runFfmpeg = async (args: string[]) => {
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
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
          reject(
            new Error(
              stderr
                ? `GIF-Erzeugung mit ffmpeg fehlgeschlagen: ${stderr}`
                : "GIF-Erzeugung mit ffmpeg fehlgeschlagen.",
            ),
          );
        });
      });
      return;
    } catch (error) {
      const launchError = error as NodeJS.ErrnoException;
      if (launchError.code === "ENOENT" || launchError.code === "EACCES") {
        lastLaunchError = launchError;
        continue;
      }
      throw error;
    }
  }

  throw lastLaunchError ?? new Error("ffmpeg ist nicht verfügbar.");
};

const downloadImage = async (url: string) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Projektbild konnte nicht geladen werden (HTTP ${response.status}).`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
    throw new Error("Ein ausgewähltes Projektbild ist zu groß.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    throw new Error("Ein ausgewähltes Projektbild ist zu groß.");
  }
  return buffer;
};

const getTargetSize = async (
  firstFrame: Buffer,
  ratio: { width: number; height: number } | null,
) => {
  if (ratio) {
    return {
      width: OUTPUT_WIDTH,
      height: Math.round((OUTPUT_WIDTH * ratio.height) / ratio.width),
    };
  }

  const metadata = await sharp(firstFrame, { animated: false }).metadata();
  const sourceWidth = metadata.width ?? OUTPUT_WIDTH;
  const sourceHeight = metadata.height ?? Math.round((OUTPUT_WIDTH * 9) / 16);
  const sourceRatio = sourceWidth / Math.max(sourceHeight, 1);
  const height = Math.round(OUTPUT_WIDTH / sourceRatio);

  return {
    width: OUTPUT_WIDTH,
    height: Math.min(1_440, Math.max(540, height)),
  };
};

const renderFocalCrop = async ({
  source,
  size,
  position,
  format,
}: {
  source: Buffer;
  size: { width: number; height: number };
  position: NewsletterImagePosition;
  format: "jpeg" | "png";
}) => {
  const oriented = await sharp(source, {
    animated: false,
    failOn: "error",
    limitInputPixels: 60_000_000,
  })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const sourceWidth = oriented.info.width;
  const sourceHeight = oriented.info.height;
  const targetRatio = size.width / size.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const normalizedPosition = normalizeImagePosition(position);

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let left = 0;
  let top = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = Math.max(
      1,
      Math.min(sourceWidth, Math.round(sourceHeight * targetRatio)),
    );
    left = Math.round((sourceWidth - cropWidth) * normalizedPosition.x);
  } else if (sourceRatio < targetRatio) {
    cropHeight = Math.max(
      1,
      Math.min(sourceHeight, Math.round(sourceWidth / targetRatio)),
    );
    top = Math.round((sourceHeight - cropHeight) * normalizedPosition.y);
  }

  const pipeline = sharp(oriented.data)
    .extract({
      left: Math.min(sourceWidth - cropWidth, Math.max(0, left)),
      top: Math.min(sourceHeight - cropHeight, Math.max(0, top)),
      width: cropWidth,
      height: cropHeight,
    })
    .resize({
      width: size.width,
      height: size.height,
      fit: "fill",
    })
    .flatten({ background: "#ffffff" });

  return format === "png"
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
};

const publicAssetUrl = (assetPath: string, contentType: string) =>
  getUploadedMediaPublicUrl({ path: assetPath, contentType });

const assetExists = async (url: string) => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const createNewsletterGifAsset = async ({
  projectId,
  imageUrls,
  imagePositions,
  frameDurationMs,
  ratio,
}: {
  projectId: string;
  imageUrls: string[];
  imagePositions?: Record<string, NewsletterImagePosition>;
  frameDurationMs: number;
  ratio: { width: number; height: number } | null;
}) => {
  const frames = Array.from(new Set(imageUrls)).slice(0, MAX_GIF_FRAMES);
  if (frames.length < 2) {
    throw new Error("Für ein GIF werden mindestens zwei Projektbilder benötigt.");
  }

  const duration = normalizeGifFrameDuration(frameDurationMs);
  const positions = Object.fromEntries(
    frames.map((imageUrl) => [
      imageUrl,
      normalizeImagePosition(imagePositions?.[imageUrl]),
    ]),
  );
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: 2,
        frames,
        positions,
        duration,
        ratio,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const assetPath = `newsletter-gifs/${safeProjectId}/${hash}.gif`;
  const cachedUrl = publicAssetUrl(assetPath, "image/gif");

  if (cachedUrl && (await assetExists(cachedUrl))) {
    return cachedUrl;
  }

  const buffers = await Promise.all(frames.map(downloadImage));
  const size = await getTargetSize(buffers[0], ratio);
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "konglo-newsletter-gif-"),
  );
  const outputPath = path.join(temporaryDirectory, "newsletter.gif");

  try {
    for (let index = 0; index < buffers.length; index += 1) {
      const frame = await renderFocalCrop({
        source: buffers[index],
        size,
        position: positions[frames[index]],
        format: "png",
      });
      await writeFile(
        path.join(
          temporaryDirectory,
          `frame-${String(index).padStart(3, "0")}.png`,
        ),
        frame,
      );
    }

    await runFfmpeg([
      "-y",
      "-framerate",
      `1000/${duration}`,
      "-i",
      path.join(temporaryDirectory, "frame-%03d.png"),
      "-vf",
      "split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
      "-loop",
      "0",
      "-an",
      outputPath,
    ]);

    const data = await readFile(outputPath);
    if (data.byteLength > MAX_OUTPUT_BYTES) {
      throw new Error(
        "Das erzeugte GIF ist größer als 10 MB. Wähle weniger Bilder oder ein kompakteres Bildformat.",
      );
    }

    const uploaded = await uploadOpeninaryMedia({
      data,
      contentType: "image/gif",
      path: assetPath,
    });
    return uploaded.url;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const createNewsletterImageAsset = async ({
  projectId,
  imageUrl,
  position,
  ratio,
}: {
  projectId: string;
  imageUrl: string;
  position: NewsletterImagePosition;
  ratio: { width: number; height: number };
}) => {
  const normalizedPosition = normalizeImagePosition(position);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        imageUrl,
        position: normalizedPosition,
        ratio,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const assetPath = `newsletter-images/${safeProjectId}/${hash}.jpg`;
  const cachedUrl = publicAssetUrl(assetPath, "image/jpeg");

  if (cachedUrl && (await assetExists(cachedUrl))) {
    return cachedUrl;
  }

  const source = await downloadImage(imageUrl);
  const size = {
    width: OUTPUT_WIDTH,
    height: Math.round((OUTPUT_WIDTH * ratio.height) / ratio.width),
  };
  const data = await renderFocalCrop({
    source,
    size,
    position: normalizedPosition,
    format: "jpeg",
  });
  const uploaded = await uploadOpeninaryMedia({
    data,
    contentType: "image/jpeg",
    path: assetPath,
  });
  return uploaded.url;
};

export const MAX_NEWSLETTER_GIF_FRAMES = MAX_GIF_FRAMES;
