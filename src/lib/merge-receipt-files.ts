import { PDFDocument } from "pdf-lib";

const isPdf = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const isPng = (file: File) =>
  file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

/**
 * Bundles multiple receipt files (PDFs and/or JPG/PNG images) into a single
 * PDF document. PDF pages are copied as-is, images are placed on a page sized
 * to the image. Runs entirely in the browser.
 */
export async function mergeReceiptFilesToPdf(
  files: File[],
  fileName = "beleg.pdf",
): Promise<File> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (isPdf(file)) {
      const source = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      continue;
    }

    const image = isPng(file)
      ? await merged.embedPng(bytes)
      : await merged.embedJpg(bytes);
    const page = merged.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const output = await merged.save();
  return new File([output as BlobPart], fileName, {
    type: "application/pdf",
  });
}

/**
 * Returns the single receipt file to upload: a single selected file is passed
 * through unchanged, multiple files are bundled into one PDF. Returns null
 * when nothing is selected.
 */
export async function buildReceiptFile(
  files: File[],
): Promise<File | null> {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];
  return mergeReceiptFilesToPdf(files);
}
