"use client";

// src/app/[lang]/account/AccountDepartmentsEditor.tsx — der Dialog unter
// „Deine Mitgliedschaft", in dem ein Mitglied seine Abteilungen selbst wählt.
//
// Oben die gewählten Abteilungen, jede mit Mülleimer; darunter „Hinzufügen"
// mit allen Abteilungen, die Campai für Mitglieder führt. Nach Campai geht
// erst beim Speichern etwas — und dann die ganze Wahl auf einmal.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import { OptionList, type SelectOption } from "@/components/knglmrt/Select";
import type { AccountCampaiDepartmentsResponse } from "@/app/api/account/campai-departments/route";
import type {
  CampaiContactProfile,
  CampaiDepartment,
} from "@/lib/campai-contact-profile";
import { InlineEditor } from "./AccountSection";

type DepartmentsResponse = Partial<AccountCampaiDepartmentsResponse> & {
  error?: string;
};

export default function AccountDepartmentsEditor({
  id,
  current,
  save,
  onSaved,
  onCancel,
}: {
  id: string;
  current: CampaiDepartment[];
  save: (patch: Record<string, unknown>) => Promise<CampaiContactProfile>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<CampaiDepartment[]>(current);
  // `null`, solange die Auswahl lädt.
  const [offered, setOffered] = useState<CampaiDepartment[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/account/campai-departments");
        const data = (await response.json()) as DepartmentsResponse;
        if (!response.ok || !data.departments) {
          throw new Error(
            data.error ?? "Die Abteilungen sind gerade nicht abrufbar.",
          );
        }
        if (active) {
          setOffered(data.departments);
        }
      } catch (loadError) {
        if (active) {
          setOffered([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Die Abteilungen sind gerade nicht abrufbar.",
          );
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ departmentIds: selected.map((entry) => entry.id) });
      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedIds = new Set(selected.map((entry) => entry.id));
  const addable = (offered ?? []).filter((entry) => !selectedIds.has(entry.id));

  return (
    <InlineEditor
      id={id}
      title="Abteilungen wählen"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      {selected.length > 0 ? (
        <ul className="m-0 list-none border-t border-border p-0">
          {selected.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 border-b border-border py-1.5"
            >
              <span className="font-medium">{entry.name}</span>
              <Button
                type="button"
                kind="ghost"
                size="chip"
                iconOnly
                icon={faTrash}
                aria-label={`${entry.name} entfernen`}
                disabled={saving}
                onClick={() =>
                  setSelected((list) =>
                    list.filter((item) => item.id !== entry.id),
                  )
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted-foreground">
          Noch keine Abteilung gewählt.
        </p>
      )}

      <AddDepartmentMenu
        options={addable}
        loading={offered === null}
        disabled={saving}
        onPick={(entry) => setSelected((list) => [...list, entry])}
      />
    </InlineEditor>
  );
}

/** „Hinzufügen" mit der Liste darunter. Ein Klick fügt hinzu und schließt. */
function AddDepartmentMenu({
  options,
  loading,
  disabled,
  onPick,
}: {
  options: CampaiDepartment[];
  loading: boolean;
  disabled: boolean;
  onPick: (department: CampaiDepartment) => void;
}) {
  const listboxId = `${useId()}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [open]);

  const listOptions: SelectOption[] = options.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));

  const pick = (option: SelectOption) => {
    const department = options.find((entry) => entry.id === option.value);
    if (department) {
      onPick(department);
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        listOptions.length === 0
          ? -1
          : (index + step + listOptions.length) % listOptions.length,
      );
      return;
    }
    if (event.key === "Enter" && open && listOptions[activeIndex]) {
      event.preventDefault();
      pick(listOptions[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-[280px]">
      <Button
        type="button"
        kind="secondary"
        size="small"
        icon={faPlus}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        onKeyDown={handleKeyDown}
        onClick={() => {
          setOpen((value) => !value);
          setActiveIndex(-1);
        }}
      >
        Hinzufügen
      </Button>
      {open ? (
        <OptionList
          options={listOptions}
          activeIndex={activeIndex}
          listboxId={listboxId}
          onPick={pick}
          onHover={setActiveIndex}
          empty={
            loading ? "Wird geladen …" : "Keine weitere Abteilung zur Auswahl."
          }
        />
      ) : null}
    </div>
  );
}
