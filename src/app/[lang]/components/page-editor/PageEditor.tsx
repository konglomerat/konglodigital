"use client";

import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { can } from "@/lib/access/access";
import { useAccess } from "@/lib/access/use-access";
import {
  matchesWerkbereichBlockGroup,
  type WerkbereichBlockGroup,
} from "@/lib/werkbereich-content";
import Fields, { type Json, type Library } from "./Fields";
import InlineBlock, { supportsInlineText } from "./InlineBlock";
import "./editor.css";

type Document = Json & { title: string; layout: Json[]; sidebarLayout: Json[] };
type Session = Library & {
  page: Document;
  revision: string;
  cmsEditUrl?: string;
};
type Context = {
  session: Session | null;
  baseline: string;
  saving: boolean;
  update: (page: Document) => void;
};
const EditorContext = createContext<Context | null>(null);

export default function PageEditor({
  pageId,
  children,
}: {
  pageId?: string | number;
  children: ReactNode;
}) {
  const access = useAccess();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [pageFields, setPageFields] = useState(false);
  const dirty = Boolean(session && JSON.stringify(session.page) !== baseline);
  const allowed = pageId != null && can(access, "backend.login");
  const draftKey = `cms-page-draft:${access?.userId}:${pageId}`;

  useEffect(() => {
    if (pageFields)
      document
        .querySelector("[data-page-editor-header]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [pageFields]);

  useEffect(() => {
    if (!session || !allowed) return;
    try {
      if (dirty)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ page: session.page, revision: session.revision }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* Editing remains possible if browser storage is unavailable. */
    }
  }, [session, dirty, allowed, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const guardLink = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a[href]");
      if (link && link.getAttribute("target") !== "_blank") {
        event.preventDefault();
        event.stopPropagation();
        setMessage(
          "Bitte speichere oder verwirf deine Änderungen, bevor du die Seite verlässt.",
        );
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  async function load(restore = true) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/cms/pages/${pageId}/editor`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBaseline(JSON.stringify(data.page));
      setConflict(false);
      setDiscard(false);
      let draft = null;
      try {
        draft = restore
          ? JSON.parse(sessionStorage.getItem(draftKey) || "null")
          : null;
        if (!restore) sessionStorage.removeItem(draftKey);
      } catch {
        /* No recoverable draft. */
      }
      if (draft?.page && draft?.revision) {
        setSession({ ...data, ...draft });
        setConflict(data.revision !== draft.revision);
        setMessage(
          data.revision !== draft.revision
            ? "Deine Änderungen wurden wiederhergestellt. Die Seite hat inzwischen einen neueren Stand; bitte gleiche die Änderungen ab."
            : "Ungespeicherte Änderungen wiederhergestellt.",
        );
      } else setSession(data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Seite konnte nicht geladen werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!session || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/cms/pages/${pageId}/editor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: session.page,
          revision: session.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(data.error);
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* Storage may be unavailable. */
      }
      setSession(null);
      setBaseline("");
      setMessage("Gespeichert und veröffentlicht.");
      setPageFields(false);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Speichern fehlgeschlagen. Deine Änderungen bleiben erhalten.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorContext.Provider
      value={{
        session: allowed ? session : null,
        baseline,
        saving: busy,
        update: (page) =>
          setSession((current) => (current ? { ...current, page } : null)),
      }}
    >
      {allowed && session && pageFields && (
        <section
          className="cms-page-fields"
          data-page-editor-controls
          data-page-editor-header
        >
          <h2>Titel und Einstieg</h2>
          <fieldset disabled={busy} inert={busy}>
            <Fields
              value={{
                title: session.page.title,
                hero: session.page.hero,
                meta: session.page.meta,
              }}
              library={session}
              onChange={(next) =>
                setSession({ ...session, page: { ...session.page, ...next } })
              }
            />
          </fieldset>
        </section>
      )}
      <div className={allowed && session ? "cms-page-editing" : undefined}>
        {children}
      </div>
      {allowed && (
        <div
          className="cms-editor-bar"
          data-page-editor-controls
          aria-label="Seiteneditor"
        >
          {session ? (
            <>
              <span>
                {dirty
                  ? "Ungespeicherte Änderungen"
                  : "Text anklicken und bearbeiten"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPageFields(!pageFields)}
              >
                Titel und Einstieg
              </button>
              <button
                className="cms-save"
                type="button"
                disabled={busy || !dirty || conflict}
                onClick={save}
              >
                {busy ? "Wird gespeichert …" : "Speichern & veröffentlichen"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => (dirty ? setDiscard(true) : setSession(null))}
              >
                Beenden
              </button>
            </>
          ) : (
            <button
              className="cms-save"
              type="button"
              disabled={busy}
              onClick={() => load()}
            >
              {busy ? "Editor wird geladen …" : "Seite bearbeiten"}
            </button>
          )}
          {message && <p role="status">{message}</p>}
          {session?.cmsEditUrl && (
            <a href={session.cmsEditUrl} target="_blank" rel="noreferrer">
              Erweiterter Editor ↗
            </a>
          )}
          {conflict && (
            <button type="button" onClick={() => setDiscard(true)}>
              Aktuellen Stand laden
            </button>
          )}
          {discard && (
            <div role="alert">
              <p>Ungespeicherte Änderungen verwerfen?</p>
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(draftKey);
                  } catch {
                    /* Storage may be unavailable. */
                  }
                  if (conflict) void load(false);
                  else {
                    setSession(null);
                    setDiscard(false);
                    setMessage("");
                  }
                }}
              >
                Änderungen verwerfen
              </button>
              <button type="button" onClick={() => setDiscard(false)}>
                Weiter bearbeiten
              </button>
            </div>
          )}
        </div>
      )}
    </EditorContext.Provider>
  );
}

export function EditableBlocks({
  items,
  area,
  blockGroup,
}: {
  items: { id: string; node: ReactNode }[];
  area: "layout" | "sidebarLayout";
  blockGroup?: WerkbereichBlockGroup;
}) {
  const context = useContext(EditorContext);
  const [open, setOpen] = useState<string | null>(null);
  if (!context?.session)
    return (
      <div>
        {items.map((item) => (
          <Fragment key={item.id}>{item.node}</Fragment>
        ))}
      </div>
    );
  const { session, update, saving } = context;
  const allBlocks = session.page[area];
  const blocks = allBlocks.filter((block) =>
    matchesWerkbereichBlockGroup(block, blockGroup),
  );
  const originalBlocks =
    (JSON.parse(context.baseline || "{}") as Document)[area] ?? [];
  return (
    <div className="cms-editable-blocks">
      {blocks.map((block, index) => {
        const id = String(block.id ?? index);
        const original = items.find((item) => item.id === id)?.node;
        const changed =
          JSON.stringify(block) !==
          JSON.stringify(originalBlocks.find((b) => String(b.id) === id));
        const title = String(block.heading || block.blockName || "Abschnitt");
        const inline = supportsInlineText(block);
        const updateBlock = (next: Json) =>
          updateBlocks(blocks.map((b, i) => (i === index ? next : b)));
        const updateBlocks = (next: Json[]) => {
          let cursor = 0;
          update({
            ...session.page,
            [area]: allBlocks.map((block) =>
              matchesWerkbereichBlockGroup(block, blockGroup)
                ? next[cursor++]
                : block,
            ),
          });
        };
        return (
          <section
            className="cms-editable-block"
            key={`${session.revision}:${id}`}
            data-page-editor-controls
          >
            <div className="cms-block-tools">
              <button
                type="button"
                disabled={saving}
                aria-expanded={open === id}
                onClick={() => setOpen(open === id ? null : id)}
              >
                {inline
                  ? open === id
                    ? "Einstellungen schließen"
                    : "Einstellungen"
                  : `${open === id ? "Schließen" : "Bearbeiten"}: ${title}`}
              </button>
              <button
                type="button"
                aria-label={`${title} nach oben`}
                disabled={saving || index === 0}
                onClick={() => {
                  const next = [...blocks];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  updateBlocks(next);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${title} nach unten`}
                disabled={saving || index === blocks.length - 1}
                onClick={() => {
                  const next = [...blocks];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  updateBlocks(next);
                }}
              >
                ↓
              </button>
            </div>
            {changed && !inline && open !== id && (
              <p className="cms-pending-note">
                Änderungen vorgemerkt. Die Seitenansicht wird nach dem Speichern
                aktualisiert.
              </p>
            )}
            {inline && (
              <div inert={saving}>
                <InlineBlock
                  block={block}
                  onChange={updateBlock}
                  onSettings={() => setOpen(id)}
                />
              </div>
            )}
            {open === id ? (
              <fieldset
                className="cms-block-settings"
                disabled={saving}
                inert={saving}
              >
                <Fields
                  value={block}
                  library={session}
                  settingsOnly={inline}
                  path={`${area}.${id}`}
                  onChange={updateBlock}
                />
              </fieldset>
            ) : (
              !inline && original
            )}
          </section>
        );
      })}
    </div>
  );
}
