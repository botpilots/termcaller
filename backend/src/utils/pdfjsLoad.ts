import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

const PDFJS_PKG_ROOT = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));

export type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

/** pdf.js needs bundled font/CMap assets for many embedded PDF fonts. */
export function pdfjsDocumentOptions(
  data: Uint8Array,
  extra: Record<string, unknown> = {}
): Parameters<typeof pdfjsLib.getDocument>[0] {
  return {
    data,
    standardFontDataUrl: path.join(PDFJS_PKG_ROOT, 'standard_fonts/') + '/',
    cMapUrl: path.join(PDFJS_PKG_ROOT, 'cmaps/') + '/',
    cMapPacked: true,
    ...extra,
  };
}

export function loadPdfDocument(
  data: Uint8Array,
  extra: Record<string, unknown> = {}
): ReturnType<typeof pdfjsLib.getDocument> {
  return pdfjsLib.getDocument(pdfjsDocumentOptions(data, extra));
}

export async function openPdfDocument(
  data: Uint8Array,
  extra: Record<string, unknown> = {}
): Promise<PdfDocument> {
  return loadPdfDocument(data, extra).promise;
}
