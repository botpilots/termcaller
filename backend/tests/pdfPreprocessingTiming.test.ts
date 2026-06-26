import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PdfSession } from '../src/services/pdfParser.js';
import { scanPdfPages } from '../src/utils/pdfPageScan.js';
import { PDF_PAGE_CONCURRENCY, PDF_RENDER_DENSITY } from '../src/constants/pdfProcessing.js';
import { loadPdfDocument } from '../src/utils/pdfjsLoad.js';
import { joinPdfTextItems } from '../src/utils/joinPdfTextItems.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const BIODRILL_PDF = path.resolve(REPO_ROOT, 'test_data/Instructionbook_10081322_BioDrill500.pdf');
const PLANMED_PDF = path.resolve(REPO_ROOT, 'service_manuals/Planmed_Sophie_Spare_Parts_Manual.pdf');

// Opt-in: renders every page — can take minutes. No Gemini calls.
// RUN_TIMING_TESTS=1 npm test -- pdfPreprocessingTiming
const runTimingTests = process.env.RUN_TIMING_TESTS === '1';

interface TimingStats {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
}

interface PageTiming {
  pageNumber: number;
  textChars: number;
  imageKb: number;
}

function summarizeTimings(valuesMs: number[]): TimingStats {
  const sorted = [...valuesMs].sort((a, b) => a - b);
  const count = sorted.length;
  const totalMs = sorted.reduce((sum, value) => sum + value, 0);
  const mid = Math.floor(count / 2);

  return {
    count,
    totalMs,
    avgMs: count === 0 ? 0 : Math.round(totalMs / count),
    minMs: sorted[0] ?? 0,
    maxMs: sorted[count - 1] ?? 0,
    medianMs: count === 0 ? 0 : count % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!,
  };
}

function approxImageKb(base64: string): number {
  return Math.round((base64.length * 3) / 4 / 1024);
}

async function measurePdfJsTextMs(pdfPath: string, pageNumber: number): Promise<number> {
  const started = performance.now();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const task = loadPdfDocument(data);
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    joinPdfTextItems(textContent.items);
  } finally {
    await task.destroy();
  }
  return Math.round(performance.now() - started);
}

function logTimingBlock(title: string, payload: Record<string, unknown>) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function measureSequentialPages(pdfPath: string): Promise<{
  totalPages: number;
  perPageMs: number[];
  pageTimings: PageTiming[];
  stats: TimingStats;
}> {
  const session = await PdfSession.open(pdfPath);
  const perPageMs: number[] = [];
  const pageTimings: PageTiming[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= session.totalPages; pageNumber++) {
      const started = performance.now();
      const page = await session.extractPageData(pageNumber);
      perPageMs.push(Math.round(performance.now() - started));
      pageTimings.push({
        pageNumber,
        textChars: page.text.length,
        imageKb: approxImageKb(page.imageBase64),
      });
    }
  } finally {
    await session.close();
  }

  return {
    totalPages: pageTimings.length,
    perPageMs,
    pageTimings,
    stats: summarizeTimings(perPageMs),
  };
}

describe.skipIf(!runTimingTests)('PDF preprocessing timing (pre-Gemini)', () => {
  it('reports single-page breakdown on BioDrill page 14', async () => {
    const pageNumber = 14;

    const sessionOpenStarted = performance.now();
    const session = await PdfSession.open(BIODRILL_PDF);
    const sessionOpenMs = Math.round(performance.now() - sessionOpenStarted);

    const textOnlyMs = await measurePdfJsTextMs(BIODRILL_PDF, pageNumber);

    const pageStarted = performance.now();
    const page = await session.extractPageData(pageNumber);
    const extractPageMs = Math.round(performance.now() - pageStarted);

    await session.close();

    logTimingBlock('Single-page preprocessing (BioDrill p14)', {
      pdf: path.basename(BIODRILL_PDF),
      pageNumber,
      renderDensity: PDF_RENDER_DENSITY,
      sessionOpenMs,
      pdfJsTextOnlyMs: textOnlyMs,
      extractPageDataMs: extractPageMs,
      estimatedImageMagickMs: Math.max(0, extractPageMs - textOnlyMs),
      textChars: page.text.length,
      imageKb: approxImageKb(page.imageBase64),
    });

    expect(page.text.length).toBeGreaterThan(0);
    expect(page.imageBase64.length).toBeGreaterThan(1000);
    expect(extractPageMs).toBeGreaterThan(0);
  }, 60000);

  it('reports full-document preprocessing timing on BioDrill', async () => {
    const sequentialStarted = performance.now();
    const sequential = await measureSequentialPages(BIODRILL_PDF);
    const sequentialTotalMs = Math.round(performance.now() - sequentialStarted);

    const concurrentStarted = performance.now();
    const concurrentPages: PageTiming[] = [];
    await scanPdfPages(BIODRILL_PDF, {
      concurrency: PDF_PAGE_CONCURRENCY,
      onPage: async ({ pageNumber, pageData }) => {
        concurrentPages.push({
          pageNumber,
          textChars: pageData.text.length,
          imageKb: approxImageKb(pageData.imageBase64),
        });
        return null;
      },
    });
    const concurrentWallMs = Math.round(performance.now() - concurrentStarted);

    logTimingBlock('Full-document preprocessing (BioDrill)', {
      pdf: path.basename(BIODRILL_PDF),
      totalPages: sequential.totalPages,
      concurrency: PDF_PAGE_CONCURRENCY,
      sequentialTotalMs,
      sequentialAvgMsPerPage: sequential.stats.avgMs,
      sequentialMinMs: sequential.stats.minMs,
      sequentialMaxMs: sequential.stats.maxMs,
      sequentialMedianMs: sequential.stats.medianMs,
      scanPdfPagesWallMs: concurrentWallMs,
      scanPdfPagesAvgMsPerPage: Math.round(concurrentWallMs / sequential.totalPages),
      avgTextChars: Math.round(
        sequential.pageTimings.reduce((sum, page) => sum + page.textChars, 0) /
          sequential.pageTimings.length
      ),
      avgImageKb: Math.round(
        sequential.pageTimings.reduce((sum, page) => sum + page.imageKb, 0) /
          sequential.pageTimings.length
      ),
    });

    expect(concurrentPages).toHaveLength(sequential.totalPages);
    expect(sequential.stats.totalMs).toBeGreaterThan(0);
  }, 600000);

  it.skipIf(!fs.existsSync(PLANMED_PDF))(
    'reports full-document preprocessing timing on Planmed Sophie',
    async () => {
      const sequentialStarted = performance.now();
      const sequential = await measureSequentialPages(PLANMED_PDF);
      const sequentialTotalMs = Math.round(performance.now() - sequentialStarted);

      const concurrentStarted = performance.now();
      await scanPdfPages(PLANMED_PDF, {
        concurrency: PDF_PAGE_CONCURRENCY,
        onPage: async () => null,
      });
      const concurrentWallMs = Math.round(performance.now() - concurrentStarted);

      logTimingBlock('Full-document preprocessing (Planmed Sophie)', {
        pdf: path.basename(PLANMED_PDF),
        totalPages: sequential.totalPages,
        concurrency: PDF_PAGE_CONCURRENCY,
        sequentialTotalMs,
        sequentialAvgMsPerPage: sequential.stats.avgMs,
        sequentialMinMs: sequential.stats.minMs,
        sequentialMaxMs: sequential.stats.maxMs,
        sequentialMedianMs: sequential.stats.medianMs,
        scanPdfPagesWallMs: concurrentWallMs,
        scanPdfPagesAvgMsPerPage: Math.round(concurrentWallMs / sequential.totalPages),
      });

      expect(sequential.perPageMs).toHaveLength(sequential.totalPages);
    },
    900000
  );
});
