#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
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

const main = async () => {
  const bucket = process.env.SUPABASE_RESOURCES_BUCKET || "resources";
  const supabase = createSupabaseAdminClient();

  console.log("Running Supabase cutover smoke checks...");
  console.log(`URL: ${requiredEnv("SUPABASE_URL")}`);
  console.log(`Bucket: ${bucket}`);

  const checks = [];

  // Auth admin check verifies service-role permissions on the target instance.
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (error) {
      throw new Error(error.message);
    }

    checks.push({
      name: "Auth admin list users",
      ok: true,
      detail: `ok (sample size: ${data?.users?.length ?? 0})`,
    });
  } catch (error) {
    checks.push({
      name: "Auth admin list users",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const { count, error } = await supabase
      .from("resources")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw new Error(error.message);
    }

    checks.push({
      name: "Database resources access",
      ok: true,
      detail: `ok (resources count: ${count ?? "unknown"})`,
    });
  } catch (error) {
    checks.push({
      name: "Database resources access",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).list("", {
      limit: 1,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    checks.push({
      name: "Storage bucket list",
      ok: true,
      detail: `ok (sample entries: ${Array.isArray(data) ? data.length : 0})`,
    });
  } catch (error) {
    checks.push({
      name: "Storage bucket list",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  console.log("\nCheck results:");
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`- [${status}] ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll cutover smoke checks passed.");
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
