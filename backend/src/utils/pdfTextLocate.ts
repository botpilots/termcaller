import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDF_RENDER_DENSITY } from '../constants/pdfProcessing.js';
import { loadPdfDocument } from './pdfjsLoad.js';

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  matchType: 'term' | 'callout';
}

interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is { str: string; transform: number[]; width: number } {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as { str: unknown }).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as { transform: unknown }).transform)
  );
}

async function textRunsFromPage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfDocument>['promise']>['getPage']>>,
  viewport: ReturnType<typeof page.getViewport>
): Promise<TextRun[]> {
  const textContent = await page.getTextContent();
  const runs: TextRun[] = [];

  for (const item of textContent.items) {
    if (!isTextItem(item) || !item.str.trim()) continue;

    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(transform[2], transform[3]);
    const width = item.width * viewport.scale;
    const height = fontHeight > 0 ? fontHeight : viewport.scale * 10;
    const x = transform[4];
    const y = transform[5] - height;

    runs.push({ str: item.str, x, y, width, height });
  }

  return runs;
}

function normalizeBox(
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  matchType: 'term' | 'callout'
): NormalizedBox {
  return {
    x: box.x / viewport.width,
    y: box.y / viewport.height,
    width: box.width / viewport.width,
    height: box.height / viewport.height,
    matchType,
  };
}

function findSubstringBoxes(runs: TextRun[], query: string): Array<{ x: number; y: number; width: number; height: number }> {
  if (!query.trim()) return [];

  const needle = query.trim().toLowerCase();
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (const run of runs) {
    const haystack = run.str.toLowerCase();
    let start = 0;
    let index = haystack.indexOf(needle, start);
    while (index !== -1) {
      const fractionStart = needle.length > 0 ? index / run.str.length : 0;
      const fractionWidth = needle.length / run.str.length;
      boxes.push({
        x: run.x + run.width * fractionStart,
        y: run.y,
        width: Math.max(run.width * fractionWidth, 2),
        height: run.height,
      });
      start = index + needle.length;
      index = haystack.indexOf(needle, start);
    }
  }

  return boxes;
}

function findCalloutBoxes(
  runs: TextRun[],
  callout: string
): Array<{ x: number; y: number; width: number; height: number }> {
  const id = callout.trim();
  if (!id) return [];

  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (const run of runs) {
    const trimmed = run.str.trim();
    if (trimmed === id) {
      boxes.push({ x: run.x, y: run.y, width: run.width, height: run.height });
    }
  }

  return boxes;
}

export async function locateOnPdfPage(
  pdfPath: string,
  pageNumber: number,
  options: { term?: string; callout?: string }
): Promise<{ boxes: NormalizedBox[]; imageWidth: number; imageHeight: number }> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = loadPdfDocument(data);
  const pdfDocument = await loadingTask.promise;

  try {
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(`Invalid page number ${pageNumber}`);
    }

    const page = await pdfDocument.getPage(pageNumber);
    const scale = PDF_RENDER_DENSITY / 72;
    const viewport = page.getViewport({ scale });
    const runs = await textRunsFromPage(page, viewport);

    const termBoxes = findSubstringBoxes(runs, options.term ?? '');
    const calloutBoxes =
      termBoxes.length > 0 ? [] : findCalloutBoxes(runs, options.callout ?? '');

    const rawBoxes = termBoxes.length > 0 ? termBoxes : calloutBoxes;
    const matchType: 'term' | 'callout' = termBoxes.length > 0 ? 'term' : 'callout';

    return {
      boxes: rawBoxes.map(box => normalizeBox(box, viewport, matchType)),
      imageWidth: Math.round(viewport.width),
      imageHeight: Math.round(viewport.height),
    };
  } finally {
    await loadingTask.destroy();
  }
}
