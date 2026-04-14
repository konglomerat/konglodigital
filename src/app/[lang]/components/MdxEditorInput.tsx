"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";

import { getSupabaseRenderedImageUrl, isImageUrl } from "@/lib/resource-media";

type MdxEditorInputProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  readOnly?: boolean;
  availableImageUrls?: string[];
  embedButtonLabel?: string;
  emptyImageMessage?: string;
};

const getImageLabelFromUrl = (url: string, fallbackIndex: number) => {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split("/").filter(Boolean).at(-1);
    if (fileName) {
      return decodeURIComponent(fileName);
    }
  } catch {
    const fileName = url.split("/").filter(Boolean).at(-1);
    if (fileName) {
      return fileName;
    }
  }

  return `image-${fallbackIndex + 1}.jpg`;
};

const getImageAltText = (value: string) =>
  value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Bild";

export default function MdxEditorInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  readOnly = false,
  availableImageUrls = [],
  embedButtonLabel = "Vorhandenes Bild einbetten",
  emptyImageMessage = "Noch keine hochgeladenen Bilder verfugbar.",
}: MdxEditorInputProps) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const lastMarkdownRef = useRef(value);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);

  const imageOptions = useMemo(
    () =>
      Array.from(
        new Set(availableImageUrls.filter((imageUrl) => isImageUrl(imageUrl))),
      ).map((imageUrl, index) => ({
        url: imageUrl,
        label: getImageLabelFromUrl(imageUrl, index),
        thumbnailUrl: getSupabaseRenderedImageUrl(imageUrl, {
          width: 240,
          height: 180,
          resize: "cover",
        }),
      })),
    [availableImageUrls],
  );

  useEffect(() => {
    const nextValue = value ?? "";
    if (!editorRef.current || nextValue === lastMarkdownRef.current) {
      return;
    }

    if (editorRef.current.getMarkdown() !== nextValue) {
      editorRef.current.setMarkdown(nextValue);
    }
    lastMarkdownRef.current = nextValue;
  }, [value]);

  const handleInsertImage = (imageUrl: string, label: string) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus(undefined, {
      defaultSelection: "rootEnd",
      preventScroll: true,
    });
    editorRef.current.insertMarkdown(
      `\n![${getImageAltText(label)}](${imageUrl})\n`,
    );
    setIsImagePickerOpen(false);
  };

  const imagePickerButtonLabel = isImagePickerOpen
    ? "Bildauswahl schliessen"
    : embedButtonLabel;

  return (
    <div className="mdx-editor-input overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <MDXEditor
        ref={editorRef}
        markdown={value}
        readOnly={readOnly}
        spellCheck
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="mdx-editor-input__root"
        contentEditableClassName="mdx-editor-input__content"
        onChange={(nextMarkdown) => {
          lastMarkdownRef.current = nextMarkdown;
          onChange(nextMarkdown);
        }}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          linkPlugin(),
          quotePlugin(),
          markdownShortcutPlugin(),
          imagePlugin({
            imageAutocompleteSuggestions: imageOptions.map(
              (image) => image.url,
            ),
          }),
          toolbarPlugin({
            toolbarClassName: "mdx-editor-input__toolbar",
            toolbarContents: () => (
              <>
                <UndoRedo />
                <Separator />
                <BlockTypeSelect />
                <Separator />
                <BoldItalicUnderlineToggles />
                <Separator />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <button
                  type="button"
                  onClick={() => setIsImagePickerOpen((current) => !current)}
                  disabled={readOnly || imageOptions.length === 0}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                  title={imagePickerButtonLabel}
                  aria-label={imagePickerButtonLabel}
                >
                  Bild
                </button>
              </>
            ),
          }),
        ]}
      />

      <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsImagePickerOpen((current) => !current)}
            disabled={readOnly || imageOptions.length === 0}
            className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
          >
            {imagePickerButtonLabel}
          </button>
          <p className="text-xs text-zinc-500">
            {imageOptions.length > 0
              ? `${imageOptions.length} verfugbare Bilder`
              : emptyImageMessage}
          </p>
        </div>

        {isImagePickerOpen ? (
          imageOptions.length > 0 ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {imageOptions.map((image) => (
                <button
                  key={image.url}
                  type="button"
                  onClick={() => handleInsertImage(image.url, image.label)}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:border-blue-300 hover:shadow-sm"
                >
                  <img
                    src={image.thumbnailUrl}
                    alt={image.label}
                    className="h-28 w-full object-cover"
                  />
                  <span className="block px-3 py-2 text-xs font-medium text-zinc-700">
                    {image.label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">{emptyImageMessage}</p>
          )
        ) : null}
      </div>
    </div>
  );
}
