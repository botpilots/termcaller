import type { ParsedPage } from '../services/pdfParser.js';
import { PdfSession } from '../services/pdfParser.js';
import { PDF_PAGE_CONCURRENCY } from '../constants/pdfProcessing.js';
import { buildAdjacentImages } from './adjacentImages.js';
import { mapWithConcurrency } from './mapWithConcurrency.js';

export type AdjacentImages = { prevImageBase64?: string; nextImageBase64?: string };

export interface PageScanContext {
  session: PdfSession;
  pageNumber: number;
  pageData: ParsedPage;
  totalPages: number;
  fetchAdjacentImages: () => Promise<AdjacentImages>;
}

export type PageScanFilter = 'all' | 'illustrations-only';

export interface ScanPdfPagesOptions<T> {
  concurrency?: number;
  /** When 'illustrations-only', non-illustration pages are skipped (handler not called). */
  filter?: PageScanFilter;
  onPage: (ctx: PageScanContext) => Promise<T | null>;
}

/**
 * Open one PDF session and iterate pages concurrently.
 * Adjacent-page fetches reuse the same session (no re-parse per page).
 */
export async function scanPdfPages<T>(
  pdfPath: string,
  options: ScanPdfPagesOptions<T>
): Promise<(T | null)[]> {
  const session = await PdfSession.open(pdfPath);
  const filter = options.filter ?? 'all';
  const concurrency = options.concurrency ?? PDF_PAGE_CONCURRENCY;
  const totalPages = session.totalPages;
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  try {
    const results = await mapWithConcurrency(pageNumbers, concurrency, async pageNumber => {
      const pageData = await session.extractPageData(pageNumber);

      if (filter === 'illustrations-only' && !pageData.hasIllustrations) {
        return null;
      }

      const fetchAdjacentImages = async (): Promise<AdjacentImages> => {
        const [prevPage, nextPage] = await Promise.all([
          pageNumber > 1 ? session.extractPageData(pageNumber - 1) : null,
          pageNumber < totalPages ? session.extractPageData(pageNumber + 1) : null,
        ]);
        return buildAdjacentImages(prevPage, nextPage);
      };

      return options.onPage({
        session,
        pageNumber,
        pageData,
        totalPages,
        fetchAdjacentImages,
      });
    });
    return results;
  } finally {
    await session.close();
  }
}

/** Collect non-null scan results in page order. */
export function compactScanResults<T>(results: (T | null)[]): T[] {
  const compact: T[] = [];
  for (const item of results) {
    if (item !== null) {
      compact.push(item);
    }
  }
  return compact;
}
