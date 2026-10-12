import {
  Fragment,
  createElement,
  type ReactNode,
} from "react";

import {
  resolvePayloadLinkHref,
  resolvePayloadMediaUrl,
  type PayloadLink,
  type PayloadMedia,
  type PayloadRecord,
  type PayloadRichText,
  type PayloadRichTextNode,
} from "@/lib/payload-cms";

const isRecord = (value: unknown): value is PayloadRecord =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const renderChildren = (
  node: PayloadRichTextNode,
  keyPrefix: string,
): ReactNode =>
  (node.children ?? []).map((child, index) => (
    <PayloadRichTextNodeView
      key={`${keyPrefix}-${index}`}
      node={child}
      nodeKey={`${keyPrefix}-${index}`}
    />
  ));

const getMediaFromNode = (node: PayloadRichTextNode): PayloadMedia | null => {
  if (isRecord(node.value)) return node.value as PayloadMedia;
  if (isRecord(node.fields?.value)) return node.fields?.value as PayloadMedia;
  return null;
};

const getLinkFromNode = (node: PayloadRichTextNode): PayloadLink => {
  const fields = node.fields ?? {};
  const doc = isRecord(fields.doc) ? fields.doc : null;
  return {
    type:
      fields.linkType === "internal" || doc
        ? "reference"
        : "custom",
    url: typeof fields.url === "string" ? fields.url : null,
    newTab: Boolean(fields.newTab),
    reference: doc
      ? {
          relationTo:
            doc.relationTo === "posts" || doc.relationTo === "pages"
              ? doc.relationTo
              : null,
          value:
            typeof doc.value === "object" ||
            typeof doc.value === "string" ||
            typeof doc.value === "number"
              ? (doc.value as PayloadRecord | string | number)
              : null,
        }
      : null,
  };
};

function PayloadText({ node }: { node: PayloadRichTextNode }) {
  let content: ReactNode = node.text ?? "";
  const format = typeof node.format === "number" ? node.format : 0;

  // Lexical speichert Textauszeichnungen als Bitmaske.
  if (format & 1) content = <strong>{content}</strong>;
  if (format & 2) content = <em>{content}</em>;
  if (format & 4) content = <s>{content}</s>;
  if (format & 8) content = <u>{content}</u>;
  if (format & 16) {
    content = <code className="bg-muted px-1 py-0.5 font-mono text-[0.92em]">{content}</code>;
  }
  if (format & 32) content = <sub>{content}</sub>;
  if (format & 64) content = <sup>{content}</sup>;

  return content;
}

function PayloadRichTextNodeView({
  node,
  nodeKey,
}: {
  node: PayloadRichTextNode;
  nodeKey: string;
}) {
  if (node.type === "text") return <PayloadText node={node} />;
  if (node.type === "linebreak") return <br />;

  if (node.type === "heading") {
    const tag = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tag ?? "")
      ? node.tag!
      : "h2";
    const className =
      tag === "h1"
        ? "mb-4 mt-1 text-[length:var(--ui-size-title)] leading-[var(--ui-line-title)]"
        : tag === "h2"
        ? "mb-3 mt-1 text-[length:var(--ui-size-section)]"
        : tag === "h3"
          ? "mb-2 mt-1 text-xl"
          : "mb-2 mt-1 text-lg";
    return createElement(
      tag,
      { className },
      renderChildren(node, nodeKey),
    );
  }

  if (node.type === "paragraph") {
    return (
      <p className="mb-3 last:mb-0">
        {node.children?.length ? renderChildren(node, nodeKey) : <br />}
      </p>
    );
  }

  if (node.type === "quote") {
    return (
      <blockquote className="my-4 border-l-4 border-primary pl-4 text-muted-foreground">
        {renderChildren(node, nodeKey)}
      </blockquote>
    );
  }

  if (node.type === "list") {
    const listType = node.listType ?? node.tag;
    const Tag = listType === "number" || listType === "ol" ? "ol" : "ul";
    return (
      <Tag
        className={`mb-3 space-y-1 pl-6 ${Tag === "ol" ? "list-decimal" : "list-disc"}`}
      >
        {renderChildren(node, nodeKey)}
      </Tag>
    );
  }

  if (node.type === "listitem") {
    return <li>{renderChildren(node, nodeKey)}</li>;
  }

  if (node.type === "link" || node.type === "autolink") {
    const link = getLinkFromNode(node);
    const href = resolvePayloadLinkHref(link);
    if (!href) return <>{renderChildren(node, nodeKey)}</>;
    return (
      <a
        href={href}
        target={link.newTab ? "_blank" : undefined}
        rel={link.newTab ? "noreferrer" : undefined}
        className="font-bold text-primary underline decoration-1 underline-offset-2 hover:text-[var(--ui-action-hover)]"
      >
        {renderChildren(node, nodeKey)}
      </a>
    );
  }

  if (node.type === "upload") {
    const media = getMediaFromNode(node);
    const src = resolvePayloadMediaUrl(media?.url);
    if (!src) return null;
    if (media?.mimeType?.startsWith("video/")) {
      return (
        <video controls className="my-4 w-full knglmrt-border" src={src}>
          <track kind="captions" />
        </video>
      );
    }
    return (
      <figure className="my-4">
        {/* Payload liefert Breite und Höhe nicht für jede Storage-Variante. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={media?.alt ?? ""}
          loading="lazy"
          className="h-auto w-full knglmrt-border"
        />
      </figure>
    );
  }

  if (node.type === "horizontalrule") {
    return <hr className="my-6 border-border" />;
  }

  return <Fragment>{renderChildren(node, nodeKey)}</Fragment>;
}

export default function PayloadRichText({
  data,
  className,
}: {
  data?: PayloadRichText | null;
  className?: string;
}) {
  if (!data?.root) return null;
  return (
    <div className={className}>
      {renderChildren(data.root, "payload-richtext")}
    </div>
  );
}
