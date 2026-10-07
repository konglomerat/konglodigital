"use client";
// Die eigenen Zuweisungen im Browser — nur zum Ein- und Ausblenden von
// Knöpfen. Ein Abruf pro Seitenaufruf, geteilt von allen Komponenten.
import { useEffect, useState } from "react";

import type { UserAccess } from "@/lib/access/access";
import type { AccountAccessResponse } from "@/app/api/account/access/route";

let pending: Promise<UserAccess | null> | null = null;

const fetchAccess = () => {
  pending ??= fetch("/api/account/access", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : { access: null }))
    .then((data: AccountAccessResponse) => data.access)
    .catch(() => null);
  return pending;
};

/** undefined, solange geladen wird — dann lieber nichts zeigen. */
export const useAccess = (): UserAccess | null | undefined => {
  const [access, setAccess] = useState<UserAccess | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;
    void fetchAccess().then((result) => {
      if (active) setAccess(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return access;
};
