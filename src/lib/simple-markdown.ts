const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:" &&
      parsed.protocol !== "mailto:"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const renderInline = (value: string) => {
  const escaped = escapeHtml(value);

  return escaped
    .replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
      const sanitized = sanitizeUrl(href);
      if (!sanitized) {
        return label;
      }

      const external =
        sanitized.startsWith("http://") || sanitized.startsWith("https://");

      return `<a href="${escapeHtml(sanitized)}"${
        external ? ' target="_blank" rel="noreferrer"' : ""
      }>${label}</a>`;
    });
};

const renderList = (lines: string[], ordered: boolean) => {
  const tag = ordered ? "ol" : "ul";
  const items = lines
    .map((line) =>
      ordered ? line.replace(/^\d+\.\s+/, "") : line.replace(/^[-*+]\s+/, ""),
    )
    .map((line) => `<li>${renderInline(line)}</li>`)
    .join("");

  return `<${tag}>${items}</${tag}>`;
};

export const renderSimpleMarkdown = (value: string) => {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)?.[0].length ?? 1;
      const content = trimmed.replace(/^#{1,6}\s+/, "");
      blocks.push(`<h${level}>${renderInline(content)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        listLines.push(lines[index].trim());
        index += 1;
      }
      blocks.push(renderList(listLines, false));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        listLines.push(lines[index].trim());
        index += 1;
      }
      blocks.push(renderList(listLines, true));
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, "").trim());
        index += 1;
      }
      blocks.push(
        `<blockquote><p>${renderInline(quoteLines.join(" "))}</p></blockquote>`,
      );
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraphLines.join("<br />"))}</p>`);
  }

  return blocks.join("\n");
};
