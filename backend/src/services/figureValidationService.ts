import type { Callout, Concept, Illustration } from '@prisma/client';
import { extractPageData } from './pdfParser.js';
import {
  validatePageCalloutsWithGemini,
  type CalloutValidationResult,
} from './geminiValidationService.js';
import type { ExtractedCallout } from './geminiService.js';

type CalloutWithConcept = Callout & { concept: Concept | null };

export function buildExtractedConceptsFromCallouts(
  illustration: Illustration,
  callouts: CalloutWithConcept[]
): ExtractedCallout[] {
  const grouped = new Map<string, { concept: Concept | null; identifiers: string[]; sourceTerm: string }>();

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

export async function validateFigurePage(
  pdfPath: string,
  pageNumber: number,
  illustration: Illustration,
  callouts: CalloutWithConcept[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<{ extractedConcepts: ExtractedCallout[]; validation: CalloutValidationResult }> {
  const pageData = await extractPageData(pdfPath, pageNumber);
  const extractedConcepts = buildExtractedConceptsFromCallouts(illustration, callouts);

  const validation = await validatePageCalloutsWithGemini(
    pageData.imageBase64,
    extractedConcepts,
    fetchAdjacentImages
  );

  return { extractedConcepts, validation };
}
