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

export interface NormalizedBoxWithPage extends NormalizedBox {
  pageNumber: number;
}

interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageLocateResult {
  boxes: NormalizedBox[];
  imageWidth: number;
  imageHeight: number;
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
  viewport: { width: number; height: number }
): NormalizedBox {
  return {
    x: box.x / viewport.width,
    y: box.y / viewport.height,
    width: box.width / viewport.width,
    height: box.height / viewport.height,
    matchType: 'term',
  };
}

interface RawBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextSegment {
  charStart: number;
  charEnd: number;
  run: TextRun;
}

function findInSingleRuns(runs: TextRun[], query: string): RawBox[] {
  if (!query.trim()) return [];

  const needle = query.trim().toLowerCase();
  const boxes: RawBox[] = [];

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

function buildReadingOrderText(runs: TextRun[]): { text: string; segments: TextSegment[] } {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  let text = '';
  const segments: TextSegment[] = [];

  for (const run of sorted) {
    if (text.length > 0) text += ' ';
    const charStart = text.length;
    text += run.str;
    segments.push({ charStart, charEnd: text.length, run });
  }

  return { text, segments };
}

function boxesForTextRange(segments: TextSegment[], matchStart: number, matchEnd: number): RawBox[] {
  const boxes: RawBox[] = [];

  for (const segment of segments) {
    const overlapStart = Math.max(matchStart, segment.charStart);
    const overlapEnd = Math.min(matchEnd, segment.charEnd);
    if (overlapStart >= overlapEnd) continue;

    const run = segment.run;
    const runOffsetStart = overlapStart - segment.charStart;
    const runOffsetEnd = overlapEnd - segment.charStart;
    const fractionStart = runOffsetStart / run.str.length;
    const fractionWidth = (runOffsetEnd - runOffsetStart) / run.str.length;

    boxes.push({
      x: run.x + run.width * fractionStart,
      y: run.y,
      width: Math.max(run.width * fractionWidth, 2),
      height: run.height,
    });
  }

  return boxes;
}

function findInReadingOrder(runs: TextRun[], query: string): RawBox[] {
  if (!query.trim() || runs.length === 0) return [];

  const needle = query.trim().toLowerCase();
  const { text, segments } = buildReadingOrderText(runs);
  const haystack = text.toLowerCase();
  const boxes: RawBox[] = [];

  let start = 0;
  let index = haystack.indexOf(needle, start);
  while (index !== -1) {
    boxes.push(...boxesForTextRange(segments, index, index + needle.length));
    start = index + needle.length;
    index = haystack.indexOf(needle, start);
  }

  return boxes;
}

/** Locate term text: full phrase in a run, then across runs, then each token individually. */
export function findTermBoxes(runs: TextRun[], query: string): RawBox[] {
  const phrase = query.trim();
  if (!phrase) return [];

  const inSingleRun = findInSingleRuns(runs, phrase);
  if (inSingleRun.length > 0) return inSingleRun;

  const acrossRuns = findInReadingOrder(runs, phrase);
  if (acrossRuns.length > 0) return acrossRuns;

  const tokens = phrase.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return [];

  const perToken: RawBox[][] = [];
  for (const token of tokens) {
    const tokenBoxes = findInSingleRuns(runs, token);
    if (tokenBoxes.length === 0) return [];
    perToken.push(tokenBoxes);
  }

  return perToken.flat();
}

function findSubstringBoxes(runs: TextRun[], query: string): RawBox[] {
  return findTermBoxes(runs, query);
}

/** Page numbers to scan when the occurrence page has no match. */
export function adjacentPageSearchOrder(pageNumber: number, totalPages: number): number[] {
  const order = [pageNumber];
  if (pageNumber > 1) order.push(pageNumber - 1);
  if (pageNumber < totalPages) order.push(pageNumber + 1);
  return order;
}

/** Pick the candidate page closest to the viewport / scroll reference. */
export function pickNearestPage(candidates: number[], referencePage: number): number {
  if (candidates.length === 0) {
    throw new Error('pickNearestPage requires at least one candidate');
  }

  return candidates.reduce((best, page) => {
    const dist = Math.abs(page - referencePage);
    const bestDist = Math.abs(best - referencePage);
    if (dist < bestDist) return page;
    if (dist > bestDist) return best;
    return Math.min(page, best);
  });
}

async function locateOnPdfPageInternal(
  pdfDocument: Awaited<ReturnType<typeof loadPdfDocument>['promise']>,
  pageNumber: number,
  options: { term?: string; callout?: string }
): Promise<PageLocateResult> {
  const page = await pdfDocument.getPage(pageNumber);
  const scale = PDF_RENDER_DENSITY / 72;
  const viewport = page.getViewport({ scale });
  const runs = await textRunsFromPage(page, viewport);
  const termBoxes = findSubstringBoxes(runs, options.term ?? '');

  return {
    boxes: termBoxes.map(box => normalizeBox(box, viewport)),
    imageWidth: Math.round(viewport.width),
    imageHeight: Math.round(viewport.height),
  };
}

export async function locateOnPdfPage(
  pdfPath: string,
  pageNumber: number,
  options: { term?: string; callout?: string }
): Promise<PageLocateResult> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = loadPdfDocument(data);
  const pdfDocument = await loadingTask.promise;

  try {
    if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
      throw new Error(`Invalid page number ${pageNumber}`);
    }

    return await locateOnPdfPageInternal(pdfDocument, pageNumber, options);
  } finally {
    await loadingTask.destroy();
  }
}

export async function locateOnPdfPageWithAdjacent(
  pdfPath: string,
  pageNumber: number,
  options: { term?: string; callout?: string },
  totalPages?: number,
  referencePage?: number
): Promise<{
  boxes: NormalizedBoxWithPage[];
  matchedPage: number | null;
  imageWidth: number;
  imageHeight: number;
}> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = loadPdfDocument(data);
  const pdfDocument = await loadingTask.promise;

  try {
    const numPages = totalPages ?? pdfDocument.numPages;
    if (pageNumber < 1 || pageNumber > numPages) {
      throw new Error(`Invalid page number ${pageNumber}`);
    }

    const refPage = referencePage ?? pageNumber;
    const onOccurrencePage = await locateOnPdfPageInternal(pdfDocument, pageNumber, options);

    if (onOccurrencePage.boxes.length > 0) {
      return {
        boxes: onOccurrencePage.boxes.map(box => ({ ...box, pageNumber })),
        matchedPage: pageNumber,
        imageWidth: onOccurrencePage.imageWidth,
        imageHeight: onOccurrencePage.imageHeight,
      };
    }

    const adjacentHits: Array<{ page: number; result: PageLocateResult }> = [];

    for (const candidate of adjacentPageSearchOrder(pageNumber, numPages)) {
      if (candidate === pageNumber) continue;
      const result = await locateOnPdfPageInternal(pdfDocument, candidate, options);
      if (result.boxes.length > 0) {
        adjacentHits.push({ page: candidate, result });
      }
    }

    if (adjacentHits.length > 0) {
      const matchedPage = pickNearestPage(
        adjacentHits.map(hit => hit.page),
        refPage
      );
      const hit = adjacentHits.find(entry => entry.page === matchedPage)!;
      return {
        boxes: hit.result.boxes.map(box => ({ ...box, pageNumber: matchedPage })),
        matchedPage,
        imageWidth: hit.result.imageWidth,
        imageHeight: hit.result.imageHeight,
      };
    }

    return {
      boxes: [],
      matchedPage: null,
      imageWidth: onOccurrencePage.imageWidth,
      imageHeight: onOccurrencePage.imageHeight,
    };
  } finally {
    await loadingTask.destroy();
  }
}
