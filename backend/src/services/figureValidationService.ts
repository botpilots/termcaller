import type { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';
import { extractPageData } from './pdfParser.js';
import { openPdfDocument } from '../utils/pdfjsLoad.js';
import {
  validatePageFiguresWithGemini,
  type CalloutValidationResult,
  type FigureValidationInput,
  type PageValidateMode,
} from './geminiValidationService.js';
import type { ExtractedCallout } from './geminiService.js';
import { buildAdjacentImages } from '../utils/adjacentImages.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { upsertIllustration } from './illustrationUpsert.js';
import { saveFigureValidation } from './figureValidationPersist.js';
import { sendSSEEvent } from './processingService.js';

export type IllustrationWithCallouts = Prisma.IllustrationGetPayload<{
  include: { callouts: { include: { concept: true } } };
}>;

type CalloutWithConcept = IllustrationWithCallouts['callouts'][number];

const EMPTY_VALIDATION: CalloutValidationResult = {
  unreferencedCallouts: [],
  uncalledReferences: [],
  labelMismatches: [],
};

export function buildExtractedConceptsFromCallouts(
  illustration: { figureNumber: string | null },
  callouts: CalloutWithConcept[]
): ExtractedCallout[] {
  const grouped = new Map<string, { concept: CalloutWithConcept['concept']; identifiers: string[]; sourceTerm: string }>();

  for (const callout of callouts) {
    const key = callout.conceptId ?? callout.sourceTerm;
    const existing = grouped.get(key);
    if (existing) {
      existing.identifiers.push(callout.identifier);
    } else {
      grouped.set(key, {
        concept: callout.concept,
        identifiers: [callout.identifier],
        sourceTerm: callout.sourceTerm,
      });
    }
  }

  return Array.from(grouped.values()).map(({ concept, identifiers, sourceTerm }) => ({
    calloutIdentifiers: identifiers,
    figureNumber: illustration.figureNumber ?? '',
    sourceTerm: concept?.candidateConceptName ?? sourceTerm,
    functionalDescription: concept?.definitionText ?? '',
  }));
}

function compareFigureNumber(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

function sortIllustrationsByFigureNumber(
  illustrations: IllustrationWithCallouts[]
): IllustrationWithCallouts[] {
  return [...illustrations].sort((a, b) =>
    compareFigureNumber(a.figureNumber ?? '1', b.figureNumber ?? '1')
  );
}

function buildKnownFigures(illustrations: IllustrationWithCallouts[]): FigureValidationInput[] {
  return sortIllustrationsByFigureNumber(illustrations).map(illustration => ({
    figureNumber: illustration.figureNumber ?? '1',
    extractedConcepts: buildExtractedConceptsFromCallouts(illustration, illustration.callouts),
  }));
}

export function mapPageValidationToFigures(
  knownFigures: FigureValidationInput[],
  discoveredFigures: Array<CalloutValidationResult & { figureNumber: string }>
): Array<{ figureNumber: string; validation: CalloutValidationResult }> {
  if (knownFigures.length === 0) {
    return discoveredFigures.map(figure => ({
      figureNumber: figure.figureNumber,
      validation: {
        unreferencedCallouts: figure.unreferencedCallouts,
        uncalledReferences: figure.uncalledReferences,
        labelMismatches: figure.labelMismatches,
      },
    }));
  }

  return knownFigures.map((known, index) => {
    const discovered = discoveredFigures[index];
    return {
      figureNumber: known.figureNumber,
      validation: discovered
        ? {
            unreferencedCallouts: discovered.unreferencedCallouts,
            uncalledReferences: discovered.uncalledReferences,
            labelMismatches: discovered.labelMismatches,
          }
        : EMPTY_VALIDATION,
    };
  });
}

async function loadIllustrationsForPage(
  prisma: PrismaClient,
  projectId: string,
  pageNumber: number
): Promise<IllustrationWithCallouts[]> {
  return prisma.illustration.findMany({
    where: { projectId, pageNumber },
    include: { callouts: { include: { concept: true } } },
    orderBy: { figureNumber: 'asc' },
  });
}

async function validateSinglePage(
  pdfPath: string,
  pageNumber: number,
  totalPages: number,
  illustrations: IllustrationWithCallouts[],
  pageImageBase64?: string,
  pageText?: string
): Promise<Array<{ figureNumber: string; validation: CalloutValidationResult }>> {
  const pageData = pageImageBase64
    ? { imageBase64: pageImageBase64, text: pageText ?? '' }
    : await extractPageData(pdfPath, pageNumber);
  const knownFigures = buildKnownFigures(illustrations);

  const result = await validatePageFiguresWithGemini(
    pageData.imageBase64,
    knownFigures,
    async () => {
      const [prevPage, nextPage] = await Promise.all([
        pageNumber > 1 ? extractPageData(pdfPath, pageNumber - 1) : null,
        pageNumber < totalPages ? extractPageData(pdfPath, pageNumber + 1) : null,
      ]);
      return buildAdjacentImages(prevPage, nextPage);
    },
    pageData.text
  );

  return mapPageValidationToFigures(knownFigures, result.discoveredFigures);
}

export async function validateProjectFigure(
  pdfPath: string,
  pageNumber: number,
  totalPages: number,
  illustration: IllustrationWithCallouts,
  pageIllustrations?: IllustrationWithCallouts[]
): Promise<{ extractedConcepts: ExtractedCallout[]; validation: CalloutValidationResult; mode: PageValidateMode }> {
  const illustrations = sortIllustrationsByFigureNumber(
    pageIllustrations && pageIllustrations.length > 0 ? pageIllustrations : [illustration]
  );
  const pageResults = await validateSinglePage(pdfPath, pageNumber, totalPages, illustrations);
  const match =
    pageResults.find(result => result.figureNumber === (illustration.figureNumber ?? '1')) ??
    pageResults[0];

  return {
    extractedConcepts: buildExtractedConceptsFromCallouts(illustration, illustration.callouts),
    validation: match?.validation ?? EMPTY_VALIDATION,
    mode: 'pageValidate',
  };
}

export interface FigureValidationItemResult {
  pageNumber: number;
  figureNumber: string;
  calloutCount: number;
  mode: PageValidateMode;
  validation?: CalloutValidationResult;
  error?: string;
}

export async function validateAllProjectFigures(
  prisma: PrismaClient,
  projectId: string,
  pdfPath: string,
  concurrency = 6
): Promise<FigureValidationItemResult[]> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdfDocument = await openPdfDocument(data);
  const totalPages = pdfDocument.numPages;
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  console.log(`[Validation] Scanning ${totalPages} page(s) for project ${projectId}`);

  let completedPages = 0;
  sendSSEEvent(projectId, 'validation_progress', { current: 0, total: totalPages });

  const rawResults = await mapWithConcurrency(pageNumbers, concurrency, async pageNumber => {
    try {
      const pageData = await extractPageData(pdfPath, pageNumber);
      if (!pageData.hasIllustrations) {
        return null;
      }

      const illustrations = await loadIllustrationsForPage(prisma, projectId, pageNumber);
      const figureResults = await validateSinglePage(
        pdfPath,
        pageNumber,
        totalPages,
        illustrations,
        pageData.imageBase64,
        pageData.text
      );

      const pageResults: FigureValidationItemResult[] = [];

      if (illustrations.length === 0) {
        const figuresToUpsert =
          figureResults.length > 0
            ? figureResults
            : [{ figureNumber: '1', validation: EMPTY_VALIDATION }];

        for (const discovered of figuresToUpsert) {
          const upserted = await upsertIllustration(
            prisma,
            projectId,
            pageNumber,
            discovered.figureNumber
          );

          await saveFigureValidation(
            prisma,
            projectId,
            pageNumber,
            upserted.figureNumber,
            discovered.validation
          );

          pageResults.push({
            pageNumber,
            figureNumber: upserted.figureNumber,
            calloutCount: 0,
            mode: 'pageValidate',
            validation: discovered.validation,
          });
        }

        return pageResults;
      }

      const illustrationByFigure = new Map(
        illustrations.map(illustration => [illustration.figureNumber ?? '1', illustration])
      );

      for (const figureResult of figureResults) {
        const illustration = illustrationByFigure.get(figureResult.figureNumber);
        await saveFigureValidation(
          prisma,
          projectId,
          pageNumber,
          figureResult.figureNumber,
          figureResult.validation
        );

        pageResults.push({
          pageNumber,
          figureNumber: figureResult.figureNumber,
          calloutCount: illustration?.callouts.length ?? 0,
          mode: 'pageValidate',
          validation: figureResult.validation,
        });
      }

      return pageResults;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      console.error(`[Validation] Page ${pageNumber} failed:`, error);

      const illustrations = await loadIllustrationsForPage(prisma, projectId, pageNumber);
      if (illustrations.length === 0) {
        return null;
      }

      return illustrations.map(illustration => ({
        pageNumber,
        figureNumber: illustration.figureNumber ?? '1',
        calloutCount: illustration.callouts.length,
        mode: 'pageValidate' as const,
        error: message,
      }));
    } finally {
      completedPages += 1;
      sendSSEEvent(projectId, 'validation_progress', {
        current: completedPages,
        total: totalPages,
        pageNumber,
      });
    }
  });

  const results: FigureValidationItemResult[] = [];
  for (const item of rawResults) {
    if (item === null) continue;
    if (Array.isArray(item)) {
      results.push(...item);
    } else {
      results.push(item);
    }
  }
  return results;
}

/** @deprecated Use validateProjectFigure */
export async function validateFigurePage(
  pdfPath: string,
  pageNumber: number,
  illustration: IllustrationWithCallouts,
  callouts: CalloutWithConcept[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<{ extractedConcepts: ExtractedCallout[]; validation: CalloutValidationResult }> {
  const extractedConcepts = buildExtractedConceptsFromCallouts(illustration, callouts);
  const result = await validatePageFiguresWithGemini(
    (await extractPageData(pdfPath, pageNumber)).imageBase64,
    [{ figureNumber: illustration.figureNumber ?? '1', extractedConcepts }],
    fetchAdjacentImages
  );

  const first = result.discoveredFigures[0];
  return {
    extractedConcepts,
    validation: first ?? EMPTY_VALIDATION,
  };
}
