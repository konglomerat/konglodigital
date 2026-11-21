"use client";

import dynamic from "next/dynamic";
import type { Json } from "./Fields";

const TextEditor = dynamic(() => import("./LexicalInput"), {
  ssr: false,
  loading: () => <p>Text wird geladen …</p>,
});
const widths: Record<string, string> = {
  full: "lg:col-span-12",
  half: "lg:col-span-6",
  oneThird: "lg:col-span-4",
  twoThirds: "lg:col-span-8",
};

export function supportsInlineText(block: Json) {
  return block.blockType === "content" || block.blockType === "cta";
}

export default function InlineBlock({
  block,
  onChange,
  onSettings,
}: {
  block: Json;
  onChange: (block: Json) => void;
  onSettings: () => void;
}) {
  if (block.blockType === "content") {
    const columns = (block.columns ?? []) as Json[];
    return (
      <div className="cms-inline-columns grid grid-cols-1 gap-6 lg:grid-cols-12">
        {columns.map((column, index) => (
          <div
            className={widths[String(column.size)] || widths.full}
            key={String(column.id ?? index)}
          >
            <TextEditor
              inline
              label={
                columns.length > 1
                  ? `Textspalte ${index + 1} bearbeiten`
                  : "Text bearbeiten"
              }
              value={column.richText as Json | null}
              onChange={(richText) =>
                onChange({
                  ...block,
                  columns: columns.map((item, i) =>
                    i === index ? { ...item, richText } : item,
                  ),
                })
              }
            />
            {Boolean(column.enableLink) && (
              <button
                className="cms-inline-link"
                type="button"
                onClick={onSettings}
              >
                {String((column.link as Json)?.label || "Link bearbeiten")} ↗
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="cms-inline-cta">
      <TextEditor
        inline
        label="Text bearbeiten"
        value={block.richText as Json | null}
        onChange={(richText) => onChange({ ...block, richText })}
      />
      {Array.isArray(block.links) && block.links.length > 0 && (
        <div className="cms-inline-cta-links">
          {block.links.map((entry, index) => (
            <button type="button" key={index} onClick={onSettings}>
              {String(
                (entry as { link?: Json }).link?.label || "Link bearbeiten",
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
