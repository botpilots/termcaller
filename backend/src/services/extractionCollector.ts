import crypto from 'crypto';
import { analyzePageWithGemini } from './geminiService.js';
import { normalizeSourceTerm } from '../utils/normalizeSourceTerm.js';
import { scanPdfPages } from '../utils/pdfPageScan.js';
import { TimeoutError } from '../utils/withTimeout.js';

export interface ExtractionSnapshot {
  sourceTerms: string[];
  keywordCalloutCounts: Record<string, number>;
  counts: {
    uniqueKeywords: number;
    concepts: number;
    illustrations: number;
    callouts: number;
    pagesWithIllustrations: number;
    pagesErrored: number;
    pagesTimedOut: number;
  };
}

/** Run full-document extraction in memory (no DB) for regression tests. */
export async function collectExtractionFromPdf(pdfPath: string): Promise<ExtractionSnapshot> {
  const sourceTerms = new Set<string>();
  const keywordCalloutCounts = new Map<string, number>();
  const definitionHashes = new Set<string>();
  const illustrationKeys = new Set<string>();
  let calloutCount = 0;
  let pagesWithIllustrations = 0;
  let pagesErrored = 0;
  let pagesTimedOut = 0;

  await scanPdfPages(pdfPath, {
    filter: 'all',
    onPage: async ({ pageNumber, pageData, fetchAdjacentImages }) => {
      if (!pageData.hasIllustrations) {
        return null;
      }

      pagesWithIllustrations++;

      try {
        const result = await analyzePageWithGemini(pageData.imageBase64, fetchAdjacentImages);

        for (const concept of result.extractedConcepts) {
          const identifiers = concept.calloutIdentifiers ?? [];
          if (identifiers.length === 0) continue;
          if (!concept.sourceTerm?.trim()) continue;

          const sourceTerm = normalizeSourceTerm(concept.sourceTerm);
          if (!sourceTerm) continue;

          sourceTerms.add(sourceTerm);

          const definitionHash = crypto
            .createHash('md5')
            .update(concept.functionalDescription + sourceTerm)
            .digest('hex');
          definitionHashes.add(definitionHash);

          const figureNumber = concept.figureNumber?.trim() || '1';
          illustrationKeys.add(`${pageNumber}:${figureNumber}`);

          for (const identifier of identifiers) {
            if (!identifier) continue;
            calloutCount++;
            keywordCalloutCounts.set(sourceTerm, (keywordCalloutCounts.get(sourceTerm) ?? 0) + 1);
          }
        }
      } catch (error) {
        pagesErrored++;
        if (error instanceof TimeoutError) {
          pagesTimedOut++;
        }
      }

      return null;
    },
  });

  const sortedTerms = [...sourceTerms].sort();

  return {
    sourceTerms: sortedTerms,
    keywordCalloutCounts: Object.fromEntries(
      sortedTerms.map(term => [term, keywordCalloutCounts.get(term) ?? 0])
    ),
    counts: {
      uniqueKeywords: sortedTerms.length,
      concepts: definitionHashes.size,
      illustrations: illustrationKeys.size,
      callouts: calloutCount,
      pagesWithIllustrations,
      pagesErrored,
      pagesTimedOut,
    },
  };
}
