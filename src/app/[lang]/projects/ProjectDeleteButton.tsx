"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { faTrash } from "@fortawesome/free-solid-svg-icons";

import { useI18n } from "@/i18n/client";
import { localizePathname } from "@/i18n/config";
import Button from "../components/Button";

type ProjectDeleteButtonProps = {
  projectId: string;
};

export default function ProjectDeleteButton({
  projectId,
}: ProjectDeleteButtonProps) {
  const router = useRouter();
  const { tx, locale } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    const confirmed = window.confirm(
      tx(
        "Dieses Projekt wirklich löschen? Dies kann nicht rückgängig gemacht werden.",
        "de",
      ),
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/campai/resources/${projectId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(tx("Projekt konnte nicht gelöscht werden.", "de"));
      }

      router.push(localizePathname("/projects", locale));
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : tx("Projekt konnte nicht gelöscht werden.", "de"),
      );
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        kind="danger-secondary"
        size="small"
        icon={faTrash}
        disabled={deleting}
        onClick={handleDelete}
      >
        {deleting
          ? tx("Projekt wird gelöscht…", "de")
          : tx("Projekt löschen", "de")}
      </Button>
      {errorMessage ? (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
