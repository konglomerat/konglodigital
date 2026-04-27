#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const localesRoot = path.join(sourceRoot, "i18n", "locales");

const namespaces = ["konglodigital", "resources"];
const defaultNamespace = "konglodigital";

const localeFiles = {
  de: path.join(localesRoot, "de.json"),
  en: path.join(localesRoot, "en.json"),
};

const metaFile = path.join(localesRoot, "meta.json");

const decodeQuotedString = (raw, quote) => {
  let decoded = raw;
  decoded = decoded.replace(/\\r/g, "\r");
  decoded = decoded.replace(/\\n/g, "\n");
  decoded = decoded.replace(/\\t/g, "\t");
  decoded = decoded.replace(/\\\\/g, "\\");

  if (quote === "\"") {
    decoded = decoded.replace(/\\\"/g, "\"");
  }
  if (quote === "'") {
    decoded = decoded.replace(/\\'/g, "'");
  }
  if (quote === "`") {
    decoded = decoded.replace(/\\`/g, "`");
  }

  return decoded;
};

const normalizeSourceText = (value) => value.trim().replace(/\s+/g, " ");

const buildTranslationKey = (sourceText) => {
  return normalizeSourceText(sourceText);
};

const txRegex = /\btx\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*(?:,\s*(["'])(de|en)\3)?/g;

const createEmptyNamespacedData = () => {
  return {
    konglodigital: {},
    resources: {},
  };
};

const readJsonFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // File does not exist yet or contains invalid JSON.
  }

  return {};
};

const normalizeLocaleData = (raw) => {
  const normalized = createEmptyNamespacedData();

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return normalized;
  }

  const hasNamespacedShape = namespaces.some(
    (namespace) => raw[namespace] && typeof raw[namespace] === "object",
  );

  if (!hasNamespacedShape) {
    Object.entries(raw)
      .filter(([, value]) => typeof value === "string")
      .forEach(([key, value]) => {
        normalized[defaultNamespace][key] = value;
      });

    return normalized;
  }

  namespaces.forEach((namespace) => {
    const namespaceData = raw[namespace];
    if (!namespaceData || typeof namespaceData !== "object") {
      return;
    }

    Object.entries(namespaceData)
      .filter(([, value]) => typeof value === "string")
      .forEach(([key, value]) => {
        normalized[namespace][key] = value;
      });
  });

  return normalized;
};

const resolveEntryNamespace = (metaKey, entry) => {
  if (typeof entry?.namespace === "string" && namespaces.includes(entry.namespace)) {
    return entry.namespace;
  }

  const separator = String(metaKey).includes("::") ? "::" : ".";
  const [maybeNamespace] = String(metaKey).split(separator);
  if (namespaces.includes(maybeNamespace)) {
    return maybeNamespace;
  }

  return defaultNamespace;
};

const resolveEntryKey = (metaKey, entry, namespace) => {
  if (typeof entry?.key === "string" && entry.key.trim()) {
    return entry.key.trim();
  }

  const doubleColonPrefix = `${namespace}::`;
  if (String(metaKey).startsWith(doubleColonPrefix)) {
    return String(metaKey).slice(doubleColonPrefix.length);
  }

  const prefix = `${namespace}.`;
  if (String(metaKey).startsWith(prefix)) {
    return String(metaKey).slice(prefix.length);
  }

  return String(metaKey);
};

const buildValueBySourceText = (meta, localeData) => {
  const valuesBySourceText = new Map();

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return valuesBySourceText;
  }

  Object.entries(meta).forEach(([metaKey, entry]) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    if (typeof entry.sourceText !== "string" || !entry.sourceText.trim()) {
      return;
    }

    const namespace = resolveEntryNamespace(metaKey, entry);
    const key = resolveEntryKey(metaKey, entry, namespace);
    const value = localeData[namespace]?.[key];

    if (typeof value === "string" && value.trim()) {
      valuesBySourceText.set(entry.sourceText, value);
    }
  });

  return valuesBySourceText;
};

const sortObjectDeep = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const sorted = {};
  Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      sorted[key] = sortObjectDeep(value[key]);
    });

  return sorted;
};

const writeJsonFile = async (filePath, data) => {
  const sortedData = sortObjectDeep(data);
  await fs.writeFile(filePath, `${JSON.stringify(sortedData, null, 2)}\n`, "utf8");
};

const collectSourceFiles = async (dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      const nestedFiles = await collectSourceFiles(absolutePath);
      files.push(...nestedFiles);
      continue;
    }

    if (!absolutePath.endsWith(".ts") && !absolutePath.endsWith(".tsx")) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
};

const namespaceForFilePath = (filePath) => {
  return (
    filePath.includes(
      `${path.sep}src${path.sep}app${path.sep}resources${path.sep}`,
    ) ||
    filePath.includes(
      `${path.sep}src${path.sep}app${path.sep}[lang]${path.sep}resources${path.sep}`,
    )
  )
    ? "resources"
    : "konglodigital";
};

const extractTranslations = async () => {
  const [deLocaleRaw, enLocaleRaw, metaRaw] = await Promise.all([
    readJsonFile(localeFiles.de),
    readJsonFile(localeFiles.en),
    readJsonFile(metaFile),
  ]);

  const deLocale = normalizeLocaleData(deLocaleRaw);
  const enLocale = normalizeLocaleData(enLocaleRaw);
  const existingDeBySourceText = buildValueBySourceText(metaRaw, deLocale);
  const existingEnBySourceText = buildValueBySourceText(metaRaw, enLocale);

  const files = await collectSourceFiles(sourceRoot);
  const extraction = new Map();

  for (const filePath of files) {
    if (filePath.includes(`${path.sep}src${path.sep}i18n${path.sep}`)) {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");
    txRegex.lastIndex = 0;

    for (let match = txRegex.exec(content); match; match = txRegex.exec(content)) {
      const quote = match[1];
      const rawText = match[2];
      const namespace = namespaceForFilePath(filePath);
      const sourceLocale = match[4] ?? (namespace === "resources" ? "en" : "de");

      if (quote === "`" && rawText.includes("${")) {
        continue;
      }

      const sourceText = normalizeSourceText(decodeQuotedString(rawText, quote));
      if (!sourceText) {
        continue;
      }

      const key = buildTranslationKey(sourceText);
      const id = `${namespace}::${key}`;
      const existing = extraction.get(id);

      if (existing && existing.sourceText !== sourceText) {
        console.warn(
          `[i18n-extract] Key collision for ${id}: "${existing.sourceText}" vs "${sourceText}"`,
        );
        continue;
      }

      extraction.set(id, {
        id,
        namespace,
        key,
        sourceText,
        sourceLocale,
        filePath: path.relative(projectRoot, filePath),
      });
    }
  }

  const nextDeLocale = createEmptyNamespacedData();
  const nextEnLocale = createEmptyNamespacedData();
  const nextMeta = {};

  for (const [, entry] of extraction.entries()) {
    if (entry.sourceLocale === "de") {
      nextDeLocale[entry.namespace][entry.key] = entry.sourceText;
      nextEnLocale[entry.namespace][entry.key] =
        existingEnBySourceText.get(entry.sourceText) ?? "";
    } else {
      nextEnLocale[entry.namespace][entry.key] = entry.sourceText;
      nextDeLocale[entry.namespace][entry.key] =
        existingDeBySourceText.get(entry.sourceText) ?? "";
    }

    nextMeta[entry.id] = {
      namespace: entry.namespace,
      key: entry.key,
      sourceLocale: entry.sourceLocale,
      sourceText: entry.sourceText,
      filePath: entry.filePath,
    };
  }

  await Promise.all([
    writeJsonFile(localeFiles.de, nextDeLocale),
    writeJsonFile(localeFiles.en, nextEnLocale),
    writeJsonFile(metaFile, nextMeta),
  ]);

  console.log(`[i18n-extract] Scanned ${files.length} files.`);
  console.log(`[i18n-extract] Extracted ${extraction.size} translation keys.`);
  console.log("[i18n-extract] Updated src/i18n/locales/de.json, en.json and meta.json.");
};

await extractTranslations();
