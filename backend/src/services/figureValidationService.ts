import type { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageData } from './pdfParser.js';
import {
  pickValidateMode,
  validatePageWithGemini,
  type CalloutValidationResult,
  type PageValidateMode,
} from './geminiValidationService.js';
import type { ExtractedCallout } from './geminiService.js';
import { buildAdjacentImages } from '../utils/adjacentImages.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { upsertIllustration } from './illustrationUpsert.js';

export type IllustrationWithCallouts = Prisma.IllustrationGetPayload<{
  include: { callouts: { include: { concept: true } } };
}>;

type CalloutWithConcept = IllustrationWithCallouts['callouts'][number];

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

async function validatePageByMode(
  pdfPath: string,
  pageNumber: number,
  totalPages: number,
  mode: PageValidateMode,
  illustration: IllustrationWithCallouts | null,
  imageBase64?: string
): Promise<{ validation: CalloutValidationResult; figureNumber?: string }> {
  const pageImage = imageBase64 ?? (await extractPageData(pdfPath, pageNumber)).imageBase64;
  const extractedConcepts =
    mode === 'withConcepts' && illustration
      ? buildExtractedConceptsFromCallouts(illustration, illustration.callouts)
      : [];

  const validation = await validatePageWithGemini(
    pageImage,
    mode,
    extractedConcepts,
    async () => {
      const [prevPage, nextPage] = await Promise.all([
        pageNumber > 1 ? extractPageData(pdfPath, pageNumber - 1) : null,
        pageNumber < totalPages ? extractPageData(pdfPath, pageNumber + 1) : null,
      ]);
      return buildAdjacentImages(prevPage, nextPage);
    }
  );

  return {
    validation: {
      unreferencedCallouts: validation.unreferencedCallouts,
      uncalledReferences: validation.uncalledReferences,
      labelMismatches: validation.labelMismatches,
    },
    ...(validation.figureNumber !== undefined ? { figureNumber: validation.figureNumber } : {}),
  };
}

export async function validateProjectFigure(
  pdfPath: string,
  pageNumber: number,
  totalPages: number,
  illustration: IllustrationWithCallouts
): Promise<{ extractedConcepts: ExtractedCallout[]; validation: CalloutValidationResult; mode: PageValidateMode }> {
  const mode = pickValidateMode(illustration);
  const extractedConcepts = buildExtractedConceptsFromCallouts(illustration, illustration.callouts);
  const { validation } = await validatePageByMode(pdfPath, pageNumber, totalPages, mode, illustration);

  return { extractedConcepts, validation, mode };
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
  const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
  const totalPages = pdfDocument.numPages;
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  console.log(`[Validation] Scanning ${totalPages} page(s) for project ${projectId}`);

  const rawResults = await mapWithConcurrency(pageNumbers, concurrency, async pageNumber => {
    try {
      const pageData = await extractPageData(pdfPath, pageNumber);
      if (!pageData.hasIllustrations) {
        return null;
      }

      const illustrations = await loadIllustrationsForPage(prisma, projectId, pageNumber);
      const pageResults: FigureValidationItemResult[] = [];

      if (illustrations.length === 0) {
        const mode: PageValidateMode = 'discoverAndValidate';
        const { validation, figureNumber: discoveredFigureNumber } = await validatePageByMode(
          pdfPath,
          pageNumber,
          totalPages,
          mode,
          null,
          pageData.imageBase64
        );

        const upserted = await upsertIllustration(
          prisma,
          projectId,
          pageNumber,
          discoveredFigureNumber?.trim() || '1'
        );

        pageResults.push({
          pageNumber,
          figureNumber: upserted.figureNumber,
          calloutCount: 0,
          mode,
          validation,
        });
        return pageResults;
      }

      for (const illustration of illustrations) {
        const mode = pickValidateMode(illustration);
        const { validation } = await validatePageByMode(
          pdfPath,
          pageNumber,
          totalPages,
          mode,
          illustration,
          pageData.imageBase64
        );

        pageResults.push({
          pageNumber,
          figureNumber: illustration.figureNumber,
          calloutCount: illustration.callouts.length,
          mode,
          validation,
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

      return illustrations.map((illustration) => ({
        pageNumber,
        figureNumber: illustration.figureNumber,
        calloutCount: illustration.callouts.length,
        mode: pickValidateMode(illustration),
        error: message,
      }));
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
  const mode = pickValidateMode({ ...illustration, callouts });
  const extractedConcepts = buildExtractedConceptsFromCallouts(illustration, callouts);

  const validation = await validatePageWithGemini(
    (await extractPageData(pdfPath, pageNumber)).imageBase64,
    mode,
    extractedConcepts,
    fetchAdjacentImages
  );

  return {
    extractedConcepts,
    validation: {
      unreferencedCallouts: validation.unreferencedCallouts,
      uncalledReferences: validation.uncalledReferences,
      labelMismatches: validation.labelMismatches,
    },
  };
}
