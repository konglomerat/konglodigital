#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

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
    tables: [],
    pageSize: 500,
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--tables=")) {
      const value = arg.slice("--tables=".length).trim();
      options.tables = value
        .split(",")
        .map((table) => table.trim())
        .filter(Boolean);
      continue;
    }

    if (arg.startsWith("--page-size=")) {
      const value = Number(arg.slice("--page-size=".length));
      if (!Number.isFinite(value) || value < 1 || value > 5000) {
        throw new Error("--page-size must be a number between 1 and 5000.");
      }
      options.pageSize = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.tables.length === 0) {
    throw new Error("Missing --tables=<table1,table2,...>");
  }

  return options;
};

const createAdminClient = (urlVarName, keyVarName) => {
  const url = requiredEnv(urlVarName);
  const key = requiredEnv(keyVarName);

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const formatDbError = (error) => {
  if (!error) {
    return "Unknown database error";
  }

  const parts = [];
  if (error.message) {
    parts.push(error.message);
  }
  if (error.code) {
    parts.push(`code=${error.code}`);
  }
  if (error.details) {
    parts.push(`details=${error.details}`);
  }
  if (error.hint) {
    parts.push(`hint=${error.hint}`);
  }

  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(error);
};

const fetchPage = async ({ client, table, from, to }) => {
  const { data, error } = await client.from(table).select("*").range(from, to);

  if (error) {
    throw new Error(error.message || `Failed to read from table '${table}'.`);
  }

  return data || [];
};

const upsertRows = async ({ client, table, rows }) => {
  if (rows.length === 0) {
    return;
  }

  const chunkSize = 50;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from(table).upsert(chunk);

    if (!error) {
      continue;
    }

    if (chunk.length === 1) {
      const single = chunk[0];
      const id =
        single && typeof single === "object" && "id" in single
          ? String(single.id)
          : "unknown";

      throw new Error(
        `Failed to upsert row in '${table}' (id=${id}): ${formatDbError(error)}`,
      );
    }

    // Retry one-by-one to pinpoint which row(s) fail.
    for (const row of chunk) {
      const { error: rowError } = await client.from(table).upsert([row]);
      if (rowError) {
        const id =
          row && typeof row === "object" && "id" in row
            ? String(row.id)
            : "unknown";
        throw new Error(
          `Failed to upsert row in '${table}' (id=${id}): ${formatDbError(rowError)}`,
        );
      }
    }
  }
};

const syncTable = async ({ source, target, table, pageSize, dryRun }) => {
  let from = 0;
  let readRows = 0;
  let writtenRows = 0;

  while (true) {
    const to = from + pageSize - 1;
    const rows = await fetchPage({ client: source, table, from, to });

    if (rows.length === 0) {
      break;
    }

    readRows += rows.length;

    if (!dryRun) {
      await upsertRows({ client: target, table, rows });
      writtenRows += rows.length;
    }

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { readRows, writtenRows };
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

  console.log("Running table sync...");
  console.log(`Tables: ${options.tables.join(", ")}`);
  console.log(`Page size: ${options.pageSize}`);
  console.log(`Dry run: ${options.dryRun ? "yes" : "no"}`);

  let totalRead = 0;
  let totalWritten = 0;

  for (const table of options.tables) {
    try {
      const result = await syncTable({
        source,
        target,
        table,
        pageSize: options.pageSize,
        dryRun: options.dryRun,
      });

      totalRead += result.readRows;
      totalWritten += result.writtenRows;

      console.log(
        `[ok] ${table}: read=${result.readRows} written=${result.writtenRows}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${table}: ${message}`);
      process.exit(1);
    }
  }

  console.log("\nSummary:");
  console.log(`- Total rows read: ${totalRead}`);
  console.log(`- Total rows written: ${totalWritten}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
