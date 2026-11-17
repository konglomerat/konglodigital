"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  firstName,
  formatDateTime,
  type ReceiptNoteDetail,
} from "./normalize";
import { Avatar, Caret, sectionLabelClassName } from "./ui";

const OPEN_STORAGE_KEY = "receipt-sidebar:comments-open";

const readOpenPreference = (): boolean => {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
};

export default function CommentsPanel({
  notes,
  viewerName,
  onPost,
}: {
  notes: ReceiptNoteDetail[];
  viewerName: string | null;
  onPost: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commentCount = notes.filter((note) => !note.system).length;

  useEffect(() => {
    setOpen(readOpenPreference());
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ohne Speicher gilt die Einstellung nur bis zum Schließen.
    }
  };

  // Öffnet beim neuesten Eintrag, auch nach dem Posten.
  useLayoutEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, notes.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onPost(text);
      setDraft("");
      setReplyTo(null);
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Kommentar konnte nicht gespeichert werden.",
      );
    } finally {
      setPosting(false);
    }
  };

  const reply = (author: string) => {
    const mention = `@${firstName(author)} `;
    setReplyTo(author);
    setDraft((current) => (current.startsWith(mention) ? current : mention + current));
    inputRef.current?.focus();
  };

  return (
    <section className="flex-none border-t border-foreground">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-6 py-3 text-left hover:bg-[var(--knglmrt-tint-zebra)] dark:hover:bg-muted"
      >
        <span className={`${sectionLabelClassName} text-foreground`}>Kommentare</span>
        {commentCount > 0 ? (
          <span className="min-w-[22px] bg-primary px-[5px] text-center knglmrt-num font-bold leading-[20px] text-primary-foreground">
            +{commentCount}
          </span>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[length:var(--ui-size-label)] font-bold text-primary">
          {open ? "Einklappen" : "Anzeigen"}
          <Caret open={open} />
        </span>
      </button>

      {open ? (
        <>
          <div
            ref={listRef}
            className="flex max-h-[220px] flex-col gap-3.5 overflow-y-auto px-6 pb-3 pt-1"
          >
            {notes.length === 0 ? (
              <p className="m-0 text-muted-foreground">Noch keine Kommentare.</p>
            ) : null}
            {notes.map((note) =>
              note.system ? (
                <div
                  key={note.id}
                  className="flex items-center gap-3 text-[length:var(--ui-size-label)] text-muted-foreground"
                  title={formatDateTime(note.writtenAt)}
                >
                  <span className="h-px flex-1 bg-border" />
                  <span className="max-w-[80%] text-center">{note.text}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <div key={note.id} className="flex items-start gap-3">
                  <Avatar name={note.author} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 whitespace-pre-wrap break-words text-foreground">
                      <strong>{note.author ?? "Unbekannt"}</strong> {note.text}
                    </p>
                    <p className="m-0 mt-0.5 flex items-baseline gap-3 text-[length:var(--ui-size-label)] text-muted-foreground">
                      <span className="knglmrt-num">{formatDateTime(note.writtenAt)}</span>
                      {note.author ? (
                        <button
                          type="button"
                          onClick={() => reply(note.author as string)}
                          className="cursor-pointer font-bold hover:text-primary"
                        >
                          Antworten
                        </button>
                      ) : null}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="border-t-[0.5px] border-border px-6 pb-3.5 pt-2.5">
            {replyTo ? (
              <p className="m-0 mb-1.5 text-[length:var(--ui-size-label)] text-muted-foreground">
                Antwort an <strong className="text-foreground">{replyTo}</strong> ·{" "}
                <button
                  type="button"
                  className="cursor-pointer font-bold text-primary hover:text-[var(--ui-action-hover)]"
                  onClick={() => {
                    const mention = `@${firstName(replyTo)} `;
                    setDraft((current) =>
                      current.startsWith(mention) ? current.slice(mention.length) : current,
                    );
                    setReplyTo(null);
                  }}
                >
                  abbrechen
                </button>
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <Avatar name={viewerName} />
              <div className="flex min-w-0 flex-1 items-center knglmrt-border bg-card">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  disabled={posting}
                  placeholder="Kommentar hinzufügen …"
                  aria-label="Kommentar hinzufügen"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!draft.trim() || posting}
                  className={`flex-none cursor-pointer px-3 py-2 font-bold ${
                    draft.trim()
                      ? "text-primary hover:text-[var(--ui-action-hover)]"
                      : "cursor-default text-border"
                  }`}
                >
                  {posting ? "…" : "Posten"}
                </button>
              </div>
            </div>
            {error ? <p className="m-0 mt-2 text-destructive">{error}</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
