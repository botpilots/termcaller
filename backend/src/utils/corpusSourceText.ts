import fs from 'fs';
import path from 'path';

/** Below this chars/page average, PDF text extraction is treated as scanned/image-only. */
export const LOW_TEXT_YIELD_CHARS_PER_PAGE = 80;

export const OCR_SCRIPT_HINT = 'npm run ocr:pdf -- <path-to.pdf>';

export const OCR_SIDECAR_SUFFIX = '_hocr_searchtext.txt';

export function ocrSidecarPath(sourcePath: string): string {
  const ext = path.extname(sourcePath);
  return path.join(path.dirname(sourcePath), `${path.basename(sourcePath, ext)}${OCR_SIDECAR_SUFFIX}`);
}

export function parseOcrSidecarId(filename: string): string | null {
  if (!filename.endsWith(OCR_SIDECAR_SUFFIX)) return null;
  return filename.slice(0, -OCR_SIDECAR_SUFFIX.length);
}

export function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function isLowTextYield(nonWhitespaceChars: number, pageCount: number): boolean {
  if (pageCount <= 0) return nonWhitespaceChars === 0;
  return nonWhitespaceChars / pageCount < LOW_TEXT_YIELD_CHARS_PER_PAGE;
}

export function readOcrSidecarIfPresent(sourcePath: string): string | null {
  const sidecar = ocrSidecarPath(sourcePath);
  return fs.existsSync(sidecar) ? fs.readFileSync(sidecar, 'utf8') : null;
}

export type CorpusTextMethod = 'txt' | 'pdf' | 'ocr-sidecar';

export interface CorpusSourceText {
  text: string;
  method: CorpusTextMethod;
  pages?: number;
  charsPerPage: number;
  lowYield: boolean;
  usedOcrSidecar: boolean;
}

/**
 * Resolve corpus text for a PDF: normal extraction first; OCR sidecar only on low yield.
 */
export function resolvePdfCorpusText(
  extractedText: string,
  pageCount: number,
  sourcePath: string,
  log: (line: string) => void = console.log
): CorpusSourceText {
  const chars = countNonWhitespaceChars(extractedText);
  const charsPerPage = pageCount > 0 ? chars / pageCount : chars;
  const lowYield = isLowTextYield(chars, pageCount);

  if (!lowYield) {
    return {
      text: extractedText,
      method: 'pdf',
      pages: pageCount,
      charsPerPage,
      lowYield: false,
      usedOcrSidecar: false,
    };
  }

  const sidecarText = readOcrSidecarIfPresent(sourcePath);
  if (sidecarText !== null) {
    const sidecarChars = countNonWhitespaceChars(sidecarText);
    log(
      `  low PDF text yield (${charsPerPage.toFixed(0)} chars/page) — using OCR sidecar (${sidecarChars.toLocaleString()} chars)`
    );
    return {
      text: sidecarText,
      method: 'ocr-sidecar',
      pages: pageCount,
      charsPerPage: pageCount > 0 ? sidecarChars / pageCount : sidecarChars,
      lowYield: true,
      usedOcrSidecar: true,
    };
  }

  log(
    `  WARN: low PDF text yield (${charsPerPage.toFixed(0)} chars/page, ${chars.toLocaleString()} chars / ${pageCount} pages). ` +
      `Run OCR separately: ${OCR_SCRIPT_HINT}`
  );
  return {
    text: extractedText,
    method: 'pdf',
    pages: pageCount,
    charsPerPage,
    lowYield: true,
    usedOcrSidecar: false,
  };
}
