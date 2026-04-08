"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectWithStatus = (status: string, message?: string) => {
  const params = new URLSearchParams({ status });
  if (message) {
    params.set("message", message);
  }
  redirect(`/account?${params.toString()}`);
};

const redirectWithError = (message: string) => {
  const params = new URLSearchParams({ error: message });
  redirect(`/account?${params.toString()}`);
};

export const updateProfile = async (formData: FormData) => {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  if (!firstName || !lastName) {
    redirectWithError("First and last name are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirectWithError("You must be signed in to update your profile.");
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (error) {
    redirectWithError(error.message);
  }

  revalidatePath("/account");
  redirectWithStatus("profile-updated", "Profile saved.");
};

export const updatePassword = async (formData: FormData) => {
  const password = String(formData.get("password") ?? "").trim();
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "").trim();

  if (!password) {
    redirectWithError("Password is required.");
  }

  if (password.length < 8) {
    redirectWithError("Password must be at least 8 characters.");
  }

  if (password !== passwordConfirm) {
    redirectWithError("Passwords do not match.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirectWithError("You must be signed in to update your password.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirectWithError(error.message);
  }

  revalidatePath("/account");
  redirectWithStatus("password-updated", "Password updated.");
};
