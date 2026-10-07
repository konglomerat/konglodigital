#!/usr/bin/env node
// Legt für jede Mailadresse eine globale Admin-Zuweisung mit Vergaberecht an.
// Adressen kommen als Argumente oder aus BOOTSTRAP_ADMIN_EMAILS:
//   node --env-file=.env.local scripts/seed-bootstrap-admin.mjs a@b.de c@d.de

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

const listAllUsers = async (supabase) => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
};

const main = async () => {
  const emails = (
    process.argv.length > 2
      ? process.argv.slice(2)
      : (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "").split(",")
  )
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error(
      "Keine Adresse angegeben. Argumente oder BOOTSTRAP_ADMIN_EMAILS setzen.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const users = await listAllUsers(supabase);

  for (const email of emails) {
    const user = users.find((entry) => entry.email?.toLowerCase() === email);
    if (!user) {
      console.warn(`✗ ${email}: kein Supabase-Konto gefunden.`);
      continue;
    }

    const { data: existing, error: lookupError } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .is("scope_id", null)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      console.log(`= ${email}: ist bereits globaler Admin.`);
      continue;
    }

    const { error } = await supabase.from("role_assignments").insert({
      user_id: user.id,
      role: "admin",
      scope_id: null,
      can_grant: true,
    });
    if (error) throw error;
    console.log(`✓ ${email}: globaler Admin angelegt.`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
