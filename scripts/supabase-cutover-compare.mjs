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

const getErrorMessage = (error) => {
  if (error instanceof Error) {
    if (error.message && error.message.trim().length > 0) {
      return error.message;
    }

    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error));
    } catch {
      return "Unknown error object";
    }
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    bucket: DEFAULT_BUCKET,
    tables: [
      "resources",
      "resource_links",
      "resource_pretty_titles",
      "print_job_descriptions",
      "printer_emptying_state",
    ],
  };

  for (const arg of args) {
    if (arg.startsWith("--bucket=")) {
      options.bucket = arg.slice("--bucket=".length).trim();
      continue;
    }

    if (arg.startsWith("--tables=")) {
      const raw = arg.slice("--tables=".length).trim();
      if (!raw) {
        throw new Error("--tables cannot be empty.");
      }
      options.tables = raw
        .split(",")
        .map((table) => table.trim())
        .filter(Boolean);
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

const getTableCount = async (client, table) => {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(
      error.message || `Failed to count rows for table '${table}'.`,
    );
  }

  return count ?? 0;
};

const getUserCount = async (client) => {
  const pageSize = 1000;
  let page = 1;
  let total = 0;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(error.message || "Failed to list auth users.");
    }

    const users = data?.users ?? [];
    total += users.length;

    if (users.length < pageSize) {
      break;
    }

    page += 1;
  }

  return total;
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

  console.log("Comparing source and target Supabase instances...");

  let sourceUsers = 0;
  let targetUsers = 0;
  try {
    sourceUsers = await getUserCount(source);
  } catch (error) {
    throw new Error(`Source auth user count failed: ${getErrorMessage(error)}`);
  }
  try {
    targetUsers = await getUserCount(target);
  } catch (error) {
    throw new Error(`Target auth user count failed: ${getErrorMessage(error)}`);
  }

  let sourceFiles = [];
  let targetFiles = [];
  try {
    sourceFiles = await listAllFiles(source.storage, options.bucket);
  } catch (error) {
    throw new Error(`Source storage list failed: ${getErrorMessage(error)}`);
  }
  try {
    targetFiles = await listAllFiles(target.storage, options.bucket);
  } catch (error) {
    throw new Error(`Target storage list failed: ${getErrorMessage(error)}`);
  }

  const tableRows = [];
  for (const table of options.tables) {
    let sourceCount = 0;
    let targetCount = 0;
    try {
      sourceCount = await getTableCount(source, table);
    } catch (error) {
      throw new Error(
        `Source table count failed for '${table}': ${getErrorMessage(error)}`,
      );
    }
    try {
      targetCount = await getTableCount(target, table);
    } catch (error) {
      throw new Error(
        `Target table count failed for '${table}': ${getErrorMessage(error)}`,
      );
    }

    tableRows.push({ table, sourceCount, targetCount });
  }

  console.log("\nAuth users:");
  console.log(`- Source: ${sourceUsers}`);
  console.log(`- Target: ${targetUsers}`);

  console.log("\nStorage objects:");
  console.log(`- Bucket: ${options.bucket}`);
  console.log(`- Source: ${sourceFiles.length}`);
  console.log(`- Target: ${targetFiles.length}`);

  console.log("\nTable counts:");
  for (const row of tableRows) {
    const marker = row.sourceCount === row.targetCount ? "OK" : "DIFF";
    console.log(
      `- [${marker}] ${row.table}: source=${row.sourceCount} target=${row.targetCount}`,
    );
  }

  const hasMismatch =
    sourceUsers !== targetUsers ||
    sourceFiles.length !== targetFiles.length ||
    tableRows.some((row) => row.sourceCount !== row.targetCount);

  if (hasMismatch) {
    console.error("\nComparison found differences.");
    process.exit(1);
  }

  console.log(
    "\nComparison passed: source and target appear aligned for checked metrics.",
  );
};

main().catch((error) => {
  const message = getErrorMessage(error);
  console.error(message);
  process.exit(1);
});
