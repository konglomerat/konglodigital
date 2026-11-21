"use client";

import { useEffect, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type NodeKey,
} from "lexical";
import {
  $createHeadingNode,
  HeadingNode,
  QuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  ListNode,
  ListItemNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  LinkNode,
  TOGGLE_LINK_COMMAND,
  type LinkAttributes,
  type SerializedLinkNode,
} from "@lexical/link";
import { $setBlocksType } from "@lexical/selection";

type Json = Record<string, unknown>;
class CmsLinkNode extends LinkNode {
  __fields: Json;
  static getType() {
    return "cms-link";
  }
  static clone(node: CmsLinkNode) {
    return new CmsLinkNode(
      node.__url,
      { target: node.__target, rel: node.__rel, title: node.__title },
      node.__fields,
      node.__key,
    );
  }
  constructor(
    url = "",
    attributes: LinkAttributes = {},
    fields: Json = {},
    key?: NodeKey,
  ) {
    super(url, attributes, key);
    this.__fields = fields;
  }
  static importJSON(node: SerializedLinkNode & { fields?: Json }) {
    return new CmsLinkNode(
      node.url,
      { target: node.target, rel: node.rel, title: node.title },
      node.fields,
    ).updateFromJSON(node);
  }
  exportJSON() {
    const node = this.getLatest();
    const originalUrl =
      typeof node.__fields.url === "string" ? node.__fields.url : "#";
    const fields =
      node.__fields.linkType === "internal" && node.getURL() === originalUrl
        ? node.__fields
        : {
            ...node.__fields,
            linkType: "custom",
            doc: undefined,
            url: node.getURL(),
            newTab: node.getTarget() === "_blank",
          };
    return { ...super.exportJSON(), type: "cms-link", fields };
  }
}

const supported = new Set([
  "root",
  "paragraph",
  "text",
  "linebreak",
  "heading",
  "quote",
  "list",
  "listitem",
  "link",
  "autolink",
]);
function unsupported(node: Json): boolean {
  return (
    !supported.has(String(node.type)) ||
    (Array.isArray(node.children) &&
      node.children.some((child) => unsupported(child as Json)))
  );
}
function convert(node: Json, intoEditor: boolean): Json {
  const result = { ...node };
  if (Array.isArray(node.children))
    result.children = node.children.map((child) =>
      convert(child as Json, intoEditor),
    );
  if (intoEditor && (node.type === "link" || node.type === "autolink")) {
    const fields = (node.fields ?? {}) as Json;
    Object.assign(result, {
      type: "cms-link",
      url: fields.url ?? node.url ?? "#",
      target: fields.newTab ? "_blank" : null,
    });
  } else if (!intoEditor && node.type === "cms-link") result.type = "link";
  return result;
}
const empty = {
  root: {
    type: "root",
    version: 1,
    children: [{ type: "paragraph", version: 1, children: [] }],
    direction: "ltr",
    format: "",
    indent: 0,
  },
};
const validUrl = (url: string) =>
  /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(url);

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            setFormats({
              bold: selection.hasFormat("bold"),
              italic: selection.hasFormat("italic"),
              underline: selection.hasFormat("underline"),
            });
        });
      }),
    [editor],
  );
  return (
    <div
      className="cms-rich-toolbar"
      role="toolbar"
      aria-label="Text formatieren"
    >
      <button
        type="button"
        title="Rückgängig"
        aria-label="Rückgängig"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        ↶
      </button>
      <button
        type="button"
        title="Wiederholen"
        aria-label="Wiederholen"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        ↷
      </button>
      <select
        aria-label="Textstil"
        defaultValue=""
        onChange={(event) => {
          const value = event.target.value;
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection))
              $setBlocksType(selection, () =>
                value === "p"
                  ? $createParagraphNode()
                  : $createHeadingNode(value as HeadingTagType),
              );
          });
          event.target.value = "";
        }}
      >
        <option value="" disabled>
          Textstil
        </option>
        <option value="p">Absatz</option>
        <option value="h2">Überschrift</option>
        <option value="h3">Zwischenüberschrift</option>
      </select>
      {(
        [
          ["bold", "Fett"],
          ["italic", "Kursiv"],
          ["underline", "Unterstrichen"],
        ] as const
      ).map(([format, label]) => (
        <button
          type="button"
          key={format}
          title={label}
          aria-label={label}
          aria-pressed={formats[format]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
        >
          {format === "bold" ? (
            <b>B</b>
          ) : format === "italic" ? (
            <i>I</i>
          ) : (
            <u>U</u>
          )}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      >
        • Liste
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      >
        1. Liste
      </button>
      <button type="button" onClick={() => setLinkOpen(!linkOpen)}>
        Link
      </button>
      {linkOpen && (
        <div className="cms-link-tools">
          <input
            aria-label="Link-Adresse"
            placeholder="https://… oder /seite"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            disabled={!validUrl(url)}
            onClick={() => {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
              setLinkOpen(false);
            }}
          >
            Verlinken
          </button>
          <button
            type="button"
            onClick={() => {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
              setLinkOpen(false);
            }}
          >
            Link entfernen
          </button>
        </div>
      )}
    </div>
  );
}

export default function LexicalInput({
  value,
  onChange,
  label,
  inline = false,
}: {
  value: Json | null;
  onChange: (value: Json) => void;
  label: string;
  inline?: boolean;
}) {
  const original = value?.root ? value : empty;
  const [initial] = useState(() =>
    JSON.stringify({ ...original, root: convert(original.root as Json, true) }),
  );
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inline) return;
    const container = containerRef.current;
    const toolbar = container?.querySelector<HTMLElement>(".cms-rich-toolbar");
    if (!container || !toolbar) return;
    // Wrapped controls and the link form need to stay below the site navigation.
    const observer = new ResizeObserver(() => {
      const height = toolbar.getBoundingClientRect().height;
      if (height)
        container.style.setProperty("--cms-toolbar-height", `${height}px`);
    });
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [inline, error]);
  if (unsupported(original.root as Json) || error)
    return (
      <p role="status">
        Dieser Text enthält spezielle Einbettungen. Er bleibt unverändert; nutze
        dafür den „Erweiterten Editor“ in der Bearbeitungsleiste.
      </p>
    );
  return (
    <div
      ref={containerRef}
      className={`cms-rich-editor${inline ? " cms-rich-editor-inline" : ""}`}
    >
      <LexicalComposer
        initialConfig={{
          namespace: label,
          editorState: initial,
          nodes: [
            HeadingNode,
            QuoteNode,
            ListNode,
            ListItemNode,
            LinkNode,
            CmsLinkNode,
            {
              replace: LinkNode,
              with: (node: LinkNode) =>
                new CmsLinkNode(node.getURL(), {
                  target: node.getTarget(),
                  rel: node.getRel(),
                  title: node.getTitle(),
                }),
              withKlass: CmsLinkNode,
            },
          ],
          theme: {
            text: {
              bold: "font-bold",
              italic: "italic",
              underline: "underline",
            },
            list: { ul: "list-disc pl-6", ol: "list-decimal pl-6" },
          },
          onError: () => setError(true),
        }}
      >
        <div className="cms-rich-toolbar-slot">
          <Toolbar />
        </div>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="cms-rich-content" aria-label={label} />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin validateUrl={validUrl} />
        <OnChangePlugin
          ignoreSelectionChange
          onChange={(state) => {
            const json = state.toJSON();
            onChange({
              ...json,
              root: convert(json.root as unknown as Json, false),
            });
          }}
        />
      </LexicalComposer>
    </div>
  );
}
