#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const localesRoot = path.join(projectRoot, "src", "i18n", "locales");
const generatedRoot = path.join(projectRoot, "src", "i18n", "generated");

const localeFile = (locale) => path.join(localesRoot, `${locale}.json`);
const generatedFile = (locale) => path.join(generatedRoot, `${locale}.json`);
const metaFile = path.join(localesRoot, "meta.json");

const locales = ["de", "en"];
const namespaces = ["konglodigital", "resources"];
const defaultNamespace = "konglodigital";
const model = process.env.I18N_TRANSLATE_MODEL?.trim() || "gpt-4.1-mini";

const parseEnvFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = {};

    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      parsed[key] = value;
    });

    return parsed;
  } catch {
    return {};
  }
};

const loadLocalEnv = async () => {
  const [envFromDotEnv, envFromDotEnvLocal] = await Promise.all([
    parseEnvFile(path.join(projectRoot, ".env")),
    parseEnvFile(path.join(projectRoot, ".env.local")),
  ]);

  const merged = {
    ...envFromDotEnv,
    ...envFromDotEnvLocal,
  };

  Object.entries(merged).forEach(([key, value]) => {
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  });
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

const createEmptyNamespacedData = () => {
  return {
    konglodigital: {},
    resources: {},
  };
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

const chunksOf = (input, chunkSize) => {
  const result = [];
  for (let index = 0; index < input.length; index += chunkSize) {
    result.push(input.slice(index, index + chunkSize));
  }
  return result;
};

const translateChunk = async ({ client, sourceLocale, targetLocale, items }) => {
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are a careful product UI translator. Return JSON only.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Translate the values from ${sourceLocale} to ${targetLocale}.\n\nRules:\n- Keep placeholders and punctuation.\n- Keep tone natural and concise for a web app UI.\n- Return exactly one JSON object where each property is the key and the translated string as value.\n- Do not include markdown.\n\nInput:\n${JSON.stringify(items, null, 2)}`,
          },
        ],
      },
    ],
  });

  const output = response.output_text?.trim();
  if (!output) {
    throw new Error("OpenAI translation response was empty.");
  }

  let parsed = null;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("OpenAI translation response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI translation response had an invalid shape.");
  }

  return parsed;
};

const parseMetaEntries = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }

  return Object.entries(raw)
    .map(([id, entry]) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const inferredNamespace = (() => {
        const separator = id.includes("::") ? "::" : ".";
        const [candidate] = id.split(separator);
        return namespaces.includes(candidate) ? candidate : null;
      })();

      const namespace =
        typeof entry.namespace === "string" && namespaces.includes(entry.namespace)
          ? entry.namespace
          : inferredNamespace ?? defaultNamespace;

      const key =
        typeof entry.key === "string" && entry.key.trim()
          ? entry.key.trim()
          : id.startsWith(`${namespace}::`)
            ? id.slice(namespace.length + 2)
            : id.startsWith(`${namespace}.`)
              ? id.slice(namespace.length + 1)
            : id;

      if (typeof entry.sourceText !== "string" || !entry.sourceText.trim()) {
        return null;
      }

      const sourceLocale =
        entry.sourceLocale === "en"
          ? "en"
          : entry.sourceLocale === "de"
            ? "de"
            : "de";

      return {
        id,
        namespace,
        key,
        sourceLocale,
        sourceText: entry.sourceText,
      };
    })
    .filter(Boolean);
};

const run = async () => {
  await loadLocalEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  const baseURL =
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.IMAGE_EDIT_BASE_URL?.trim() ||
    undefined;

  const client = new OpenAI({ apiKey, baseURL });

  const [deBaseRaw, enBaseRaw, metaRaw, deGeneratedRaw, enGeneratedRaw] =
    await Promise.all([
    readJsonFile(localeFile("de")),
    readJsonFile(localeFile("en")),
    readJsonFile(metaFile),
    readJsonFile(generatedFile("de")),
    readJsonFile(generatedFile("en")),
    ]);

  const deBase = normalizeLocaleData(deBaseRaw);
  const enBase = normalizeLocaleData(enBaseRaw);
  const deGenerated = normalizeLocaleData(deGeneratedRaw);
  const enGenerated = normalizeLocaleData(enGeneratedRaw);

  const baseByLocale = {
    de: deBase,
    en: enBase,
  };

  const generatedByLocale = {
    de: deGenerated,
    en: enGenerated,
  };

  const metaEntries = parseMetaEntries(metaRaw);

  for (const targetLocale of locales) {
    const previousTargetGenerated = generatedByLocale[targetLocale];
    const targetGenerated = {
      konglodigital: {},
      resources: {},
    };

    for (const namespace of namespaces) {
      const pendingBySource = {
        de: [],
        en: [],
      };

      metaEntries
        .filter((entry) => entry.namespace === namespace)
        .forEach((entry) => {
          const existingTargetTranslation =
            previousTargetGenerated[namespace][entry.key];
          if (
            typeof existingTargetTranslation === "string" &&
            existingTargetTranslation.trim()
          ) {
            targetGenerated[namespace][entry.key] =
              existingTargetTranslation.trim();
            return;
          }

          const sourceLocale = entry.sourceLocale;
          if (sourceLocale === targetLocale) {
            return;
          }

          const sourceText =
            baseByLocale[sourceLocale][namespace][entry.key] ?? entry.sourceText;

          if (typeof sourceText !== "string" || !sourceText.trim()) {
            return;
          }

          pendingBySource[sourceLocale].push({
            key: entry.key,
            text: sourceText,
          });
        });

      for (const sourceLocale of locales) {
        const pending = pendingBySource[sourceLocale];
        if (pending.length === 0) {
          continue;
        }

        console.log(
          `[i18n-autotranslate] Translating ${pending.length} keys in namespace ${namespace} from ${sourceLocale} to ${targetLocale}.`,
        );

        const chunks = chunksOf(pending, 40);

        for (const chunk of chunks) {
          const payload = Object.fromEntries(
            chunk.map((entry) => [entry.key, entry.text]),
          );

          const translated = await translateChunk({
            client,
            sourceLocale,
            targetLocale,
            items: payload,
          });

          for (const entry of chunk) {
            const translatedValue = translated[entry.key];
            if (typeof translatedValue === "string" && translatedValue.trim()) {
              targetGenerated[namespace][entry.key] = translatedValue.trim();
            }
          }
        }
      }
    }

    generatedByLocale[targetLocale] = targetGenerated;
  }

  await Promise.all([
    writeJsonFile(generatedFile("de"), generatedByLocale.de),
    writeJsonFile(generatedFile("en"), generatedByLocale.en),
  ]);

  console.log(`[i18n-autotranslate] Model: ${model}`);
  console.log("[i18n-autotranslate] Updated src/i18n/generated/de.json and en.json.");
};

await run();
