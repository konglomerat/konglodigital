"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JobDescription = {
  jobId: string;
  description: string;
  ownerId: string | null;
};

export const getJobDescriptions = async (jobIds: string[]) => {
  if (jobIds.length === 0) {
    return {} as Record<string, JobDescription>;
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("You must be signed in to view descriptions.");
  }

  const { data, error } = await supabase
    .from("print_job_descriptions")
    .select("job_id,description,owner_id")
    .in("job_id", jobIds);

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  return (data ?? []).reduce<Record<string, JobDescription>>((acc, row) => {
    if (row.job_id) {
      acc[row.job_id] = {
        jobId: row.job_id,
        description: row.description ?? "",
        ownerId: row.owner_id ?? null,
      };
    }
    return acc;
  }, {});
};

export const saveJobDescription = async (formData: FormData) => {
  const jobId = String(formData.get("jobId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!jobId) {
    throw new Error("Missing job id.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("You must be signed in to save descriptions.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("print_job_descriptions")
    .select("owner_id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Supabase fetch failed: ${existingError.message}`);
  }

  if (existing?.owner_id && existing.owner_id !== userData.user.id) {
    throw new Error("This print is already owned by another user.");
  }

  const { error } = await supabase.from("print_job_descriptions").upsert(
    {
      job_id: jobId,
      owner_id: existing?.owner_id ?? userData.user.id,
      description,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "job_id" },
  );

  if (error) {
    throw new Error(`Supabase save failed: ${error.message}`);
  }

  revalidatePath("/");
};

export const signOut = async () => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/");
};
