import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
};

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const STORAGE_BUCKET =
  process.env.SUPABASE_RESOURCES_BUCKET?.trim() || "resources";
const EXISTING_PROJECT_PUBLISH_DATE = "2023-01-01";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_CATALOG_DIR = path.join(os.homedir(), "Downloads");
const OCR_SWIFT_SOURCE = String.raw`
import Foundation
import Vision
import AppKit

func cgImage(from image: NSImage) -> CGImage? {
    var rect = CGRect(origin: .zero, size: image.size)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

guard CommandLine.arguments.count > 1 else {
    fputs("missing image path\n", stderr)
    exit(1)
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)

guard let image = NSImage(contentsOf: url), let cgImage = cgImage(from: image) else {
    fputs("unable to load image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["de-DE", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

let observations = request.results ?? []
let lines = observations.compactMap { observation in
    observation.topCandidates(1).first?.string
}

print(lines.joined(separator: "\n"))
`;

const LABEL_ALIASES = {
  material: "Material",
  fraesdauer: "Fräsdauer",
  rohlingsmasse: "Rohlingsmaße",
  "benoetigte-fraeser": "Benötigte Fräser",
  materialstaerke: "Materialstärke",
  lizenz: "Lizenz",
  fraesdateien: "Fräsdateien",
};

const LABEL_PATTERNS = [
  ["material", ["material"]],
  ["fraesdauer", ["fraesdauer", "frasdauer"]],
  ["rohlingsmasse", ["rohlingsmasse"]],
  [
    "benoetigte-fraeser",
    ["benoetigte-fraeser", "benotigte-fraser", "benotigte-fraeser"],
  ],
  ["materialstaerke", ["materialstaerke", "materialstarke"]],
  ["lizenz", ["lizenz"]],
  ["fraesdateien", ["fraesdateien", "frasdateien"]],
];

const normalizeLabel = (value) =>
  value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const slugify = (value, fallback = "resource") => {
  const slug = normalizeLabel(value);
  return slug || normalizeLabel(fallback) || "resource";
};

const normalizeWhitespace = (value) =>
  value
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();

const findLabelAlias = (normalized) => {
  for (const [alias, candidates] of LABEL_PATTERNS) {
    if (
      candidates.some(
        (candidate) =>
          normalized === candidate ||
          normalized.startsWith(`${candidate}-`) ||
          normalized.startsWith(candidate),
      )
    ) {
      return alias;
    }
  }
  return null;
};

const toIsoDate = (value) => {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const sanitizeProjectLink = (value) => {
  const trimmed = value.trim().replace(/[)>.,;]+$/g, "");
  if (
    /^https:\/\/drive\.google\.com\/open\?id=[A-Za-z0-9_-]+$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
};

const ensureCatalogDir = async (inputDir) => {
  if (inputDir) {
    return inputDir;
  }

  const entries = await fs.readdir(DEFAULT_CATALOG_DIR, {
    withFileTypes: true,
  });
  const match = entries.find(
    (entry) => entry.isDirectory() && entry.name.startsWith("Projektkatalog"),
  );
  if (!match) {
    throw new Error("Unable to locate Projektkatalog folder in Downloads.");
  }
  return path.join(DEFAULT_CATALOG_DIR, match.name);
};

const runCommand = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
};

const renderPreview = ({ pdfPath, outputDir }) => {
  runCommand("qlmanage", ["-t", "-s", "1800", "-o", outputDir, pdfPath]);
  const fileName = `${path.basename(pdfPath)}.png`;
  return path.join(outputDir, fileName);
};

const writeSwiftOcrScript = async (outputDir) => {
  const scriptPath = path.join(outputDir, "ocr.swift");
  await fs.writeFile(scriptPath, OCR_SWIFT_SOURCE, "utf8");
  return scriptPath;
};

const runOcr = ({ imagePath, swiftScriptPath }) =>
  normalizeWhitespace(runCommand("swift", [swiftScriptPath, imagePath]));

const getPhotoCrop = async (imagePath) => {
  const { data, info } = await sharp(imagePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const minX = Math.floor(width * 0.08);
  const maxX = Math.floor(width * 0.92);
  const minY = Math.floor(height * 0.05);
  const maxY = Math.floor(height * 0.62);

  const measurePhotoLikePixel = (x, y) => {
    const offset = (y * width + x) * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const luminance = (red + green + blue) / 3;
    const saturation = max - min;
    return (
      (luminance > 35 && luminance < 235) ||
      (saturation > 18 && luminance < 245)
    );
  };

  const findLargestSegment = (scores, threshold) => {
    let best = null;
    let current = null;

    for (const item of scores) {
      if (item.score >= threshold) {
        current ??= { start: item.index, end: item.index, size: 0 };
        current.end = item.index;
        current.size += 1;
      } else if (current) {
        if (!best || current.size > best.size) {
          best = current;
        }
        current = null;
      }
    }

    if (current && (!best || current.size > best.size)) {
      best = current;
    }

    return best;
  };

  const rowScores = [];
  for (let y = minY; y < maxY; y += 1) {
    let matches = 0;
    for (let x = minX; x < maxX; x += 1) {
      if (measurePhotoLikePixel(x, y)) {
        matches += 1;
      }
    }
    rowScores.push({ index: y, score: matches / (maxX - minX) });
  }

  const rowSegment = findLargestSegment(rowScores, 0.32);
  if (!rowSegment) {
    return null;
  }

  const columnScores = [];
  for (let x = minX; x < maxX; x += 1) {
    let matches = 0;
    for (let y = rowSegment.start; y <= rowSegment.end; y += 1) {
      if (measurePhotoLikePixel(x, y)) {
        matches += 1;
      }
    }
    columnScores.push({
      index: x,
      score: matches / (rowSegment.end - rowSegment.start + 1),
    });
  }

  const columnSegment = findLargestSegment(columnScores, 0.45);
  if (!columnSegment) {
    return null;
  }

  const paddingX = Math.max(8, Math.round(width * 0.004));
  const paddingY = Math.max(8, Math.round(height * 0.004));
  const left = Math.max(0, columnSegment.start - paddingX);
  const top = Math.max(0, rowSegment.start - paddingY);
  const right = Math.min(width, columnSegment.end + paddingX);
  const bottom = Math.min(height, rowSegment.end + paddingY);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
};

const saveCoverImage = async ({ previewPath, targetPath }) => {
  const crop = await getPhotoCrop(previewPath);
  const pipeline = sharp(previewPath);
  if (crop) {
    pipeline.extract(crop);
  }
  await pipeline.jpeg({ quality: 90 }).toFile(targetPath);
};

const parseCatalogText = (ocrText) => {
  const lines = ocrText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines[0] ?? null;
  const authorLine = lines.find((line) => /^von\s+/i.test(line));
  const authorName = authorLine
    ? authorLine.replace(/^von\s+/i, "").trim()
    : null;
  const dateLine = [...lines]
    .reverse()
    .find((line) => /^\d{2}\.\d{2}\.\d{4}$/.test(line));
  const publishDate = dateLine ? toIsoDate(dateLine) : null;

  const descriptionStartIndex = lines.findIndex(
    (line) => normalizeLabel(line) === "beschreibung",
  );
  const labelOrder = [];
  const metadata = {};
  let description = "";

  const metadataStartIndex = lines.findIndex((line) =>
    normalizeLabel(line).startsWith("material"),
  );
  if (descriptionStartIndex >= 0) {
    const descriptionLines = lines.slice(
      descriptionStartIndex + 1,
      metadataStartIndex >= 0 ? metadataStartIndex : lines.length,
    );
    description = descriptionLines.join(" ").replace(/\s+/g, " ").trim();
  }

  let activeLabel = null;
  for (const line of lines.slice(
    metadataStartIndex >= 0 ? metadataStartIndex : 0,
  )) {
    const normalized = normalizeLabel(line);
    if (!normalized || normalized === "cc") {
      continue;
    }

    const alias = findLabelAlias(normalized);

    if (alias) {
      activeLabel = alias;
      if (!(activeLabel in metadata)) {
        labelOrder.push(activeLabel);
      }
      const inlineValue = line.includes(":")
        ? line.slice(line.indexOf(":") + 1).trim()
        : "";
      metadata[activeLabel] = inlineValue || metadata[activeLabel] || "";
      continue;
    }

    if (!activeLabel || /^\d{2}\.\d{2}\.\d{4}$/.test(line)) {
      continue;
    }

    metadata[activeLabel] = metadata[activeLabel]
      ? `${metadata[activeLabel]} ${line}`.trim()
      : line;
  }

  const projectLinks = [];
  if (metadata.fraesdateien) {
    const urlMatch = metadata.fraesdateien.match(/https?:\/\/\S+/i);
    if (urlMatch) {
      const cleanedUrl = sanitizeProjectLink(urlMatch[0]);
      if (cleanedUrl) {
        projectLinks.push({
          label: LABEL_ALIASES.fraesdateien,
          url: cleanedUrl,
        });
      }
    }
  }

  const details = labelOrder
    .filter((label) => label !== "fraesdateien")
    .map((label) => ({
      label: LABEL_ALIASES[label],
      value: metadata[label]?.replace(/\s+/g, " ").trim(),
    }))
    .filter((item) => item.value);

  const detailMarkdown = details.length
    ? [
        "## Projektdaten",
        ...details.map((item) => `- ${item.label}: ${item.value}`),
      ].join("\n")
    : "";
  const fullDescription = [description, detailMarkdown]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    title,
    authorName,
    publishDate,
    description: fullDescription,
    projectLinks,
    rawText: ocrText,
  };
};

const uploadFile = async ({ filePath, storagePath, contentType }) => {
  const buffer = await fs.readFile(filePath);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      upsert: false,
      contentType,
    });
  if (error) {
    throw new Error(
      `Unable to upload ${path.basename(filePath)}: ${error.message}`,
    );
  }
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath).data
    .publicUrl;
};

const ensurePrettyTitle = async ({ resourceId, name }) => {
  const baseSlug = slugify(name, `resource-${resourceId.slice(0, 8)}`);
  let prettyTitle = baseSlug;

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const { data, error } = await supabase
      .from("resource_pretty_titles")
      .select("resource_id")
      .eq("pretty_title", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Unable to resolve pretty title ${candidate}: ${error.message}`,
      );
    }

    if (!data || data.resource_id === resourceId) {
      prettyTitle = candidate;
      break;
    }
  }

  const { error: historyError } = await supabase
    .from("resource_pretty_titles")
    .upsert(
      {
        resource_id: resourceId,
        pretty_title: prettyTitle,
        is_current: true,
      },
      { onConflict: "resource_id,pretty_title" },
    );

  if (historyError) {
    throw new Error(
      `Unable to save pretty title history: ${historyError.message}`,
    );
  }

  const { error: resourceError } = await supabase
    .from("resources")
    .update({ pretty_title: prettyTitle })
    .eq("id", resourceId);

  if (resourceError) {
    throw new Error(
      `Unable to update resource pretty title: ${resourceError.message}`,
    );
  }

  return prettyTitle;
};

const findExistingProject = async ({ title, prettyTitle }) => {
  const byPrettyTitle = await supabase
    .from("resource_pretty_titles")
    .select("resource_id")
    .eq("pretty_title", prettyTitle)
    .maybeSingle();
  if (byPrettyTitle.error) {
    throw new Error(
      `Unable to check existing pretty title ${prettyTitle}: ${byPrettyTitle.error.message}`,
    );
  }
  if (byPrettyTitle.data?.resource_id) {
    return byPrettyTitle.data.resource_id;
  }

  const byName = await supabase
    .from("resources")
    .select("id")
    .ilike("type", "project")
    .eq("name", title)
    .maybeSingle();
  if (byName.error) {
    throw new Error(
      `Unable to check existing project ${title}: ${byName.error.message}`,
    );
  }
  return byName.data?.id ?? null;
};

const createProject = async ({ parsed, coverImageUrl, pdfUrl }) => {
  const { data, error } = await supabase
    .from("resources")
    .insert({
      author_name: parsed.authorName,
      name: parsed.title,
      description: parsed.description || null,
      image: coverImageUrl,
      images: [coverImageUrl, pdfUrl],
      project_links:
        parsed.projectLinks.length > 0 ? parsed.projectLinks : null,
      social_media_consent: false,
      publish_date: parsed.publishDate,
      type: "project",
      priority: 3,
      attachable: false,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `Unable to create project ${parsed.title}: ${error?.message || "missing id"}`,
    );
  }

  const prettyTitle = await ensurePrettyTitle({
    resourceId: data.id,
    name: parsed.title,
  });
  return { id: data.id, prettyTitle };
};

const updateExistingProject = async ({ resourceId, parsed }) => {
  const updatePayload = {
    publish_date: EXISTING_PROJECT_PUBLISH_DATE,
  };

  if (parsed.authorName) {
    updatePayload.author_name = parsed.authorName;
  }

  const { error } = await supabase
    .from("resources")
    .update(updatePayload)
    .eq("id", resourceId);

  if (error) {
    throw new Error(
      `Unable to backfill project ${parsed.title}: ${error.message}`,
    );
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  return {
    catalogDir: args.find((arg) => !arg.startsWith("--")) ?? null,
    write: args.includes("--write"),
  };
};

const shouldSkipPdf = (fileName) => {
  const normalized = normalizeLabel(
    path.basename(fileName, path.extname(fileName)),
  );
  return normalized === "cnc-projektekatalog";
};

const main = async () => {
  const { catalogDir: rawCatalogDir, write } = parseArgs();
  const catalogDir = await ensureCatalogDir(rawCatalogDir);
  const entries = await fs.readdir(catalogDir, { withFileTypes: true });
  const pdfPaths = entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"),
    )
    .map((entry) => path.join(catalogDir, entry.name))
    .filter((filePath) => !shouldSkipPdf(filePath))
    .sort((left, right) => left.localeCompare(right, "de"));

  if (pdfPaths.length === 0) {
    throw new Error("No project PDFs found in catalog directory.");
  }

  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "konglo-project-catalog-"),
  );
  const previewDir = path.join(tempRoot, "previews");
  const coverDir = path.join(tempRoot, "covers");
  await fs.mkdir(previewDir, { recursive: true });
  await fs.mkdir(coverDir, { recursive: true });
  const swiftScriptPath = await writeSwiftOcrScript(tempRoot);

  const summary = [];

  for (const pdfPath of pdfPaths) {
    const previewPath = renderPreview({ pdfPath, outputDir: previewDir });
    const ocrText = runOcr({ imagePath: previewPath, swiftScriptPath });
    const parsed = parseCatalogText(ocrText);

    if (!parsed.title) {
      throw new Error(
        `Unable to extract a project title from ${path.basename(pdfPath)}.`,
      );
    }

    const prettyTitle = slugify(parsed.title);
    const existingId = await findExistingProject({
      title: parsed.title,
      prettyTitle,
    });

    const result = {
      pdf: path.basename(pdfPath),
      title: parsed.title,
      authorName: parsed.authorName,
      publishDate: parsed.publishDate,
      projectLinks: parsed.projectLinks,
      existingId,
      createdId: null,
      backfilledExisting: false,
      prettyTitle: existingId ? prettyTitle : null,
    };

    if (existingId) {
      if (write) {
        await updateExistingProject({
          resourceId: existingId,
          parsed,
        });
        result.publishDate = EXISTING_PROJECT_PUBLISH_DATE;
        result.backfilledExisting = true;
      }
      summary.push(result);
      continue;
    }

    if (!write) {
      summary.push(result);
      continue;
    }

    const coverPath = path.join(coverDir, `${prettyTitle}.jpg`);
    await saveCoverImage({ previewPath, targetPath: coverPath });

    const coverStoragePath = `resources/catalog-import/${prettyTitle}/${randomUUID()}-cover.jpg`;
    const pdfStoragePath = `resources/catalog-import/${prettyTitle}/${randomUUID()}${path.extname(pdfPath).toLowerCase()}`;
    const [coverImageUrl, pdfUrl] = await Promise.all([
      uploadFile({
        filePath: coverPath,
        storagePath: coverStoragePath,
        contentType: "image/jpeg",
      }),
      uploadFile({
        filePath: pdfPath,
        storagePath: pdfStoragePath,
        contentType: "application/pdf",
      }),
    ]);

    const created = await createProject({ parsed, coverImageUrl, pdfUrl });
    result.createdId = created.id;
    result.prettyTitle = created.prettyTitle;
    summary.push(result);
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        catalogDir,
        processed: summary.length,
        created: summary.filter((item) => item.createdId).length,
        backfilledExisting: summary.filter((item) => item.backfilledExisting)
          .length,
        skippedExisting: summary.filter((item) => item.existingId).length,
        items: summary,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
