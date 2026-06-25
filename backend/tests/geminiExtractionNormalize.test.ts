import { describe, expect, it } from 'vitest';

/** Mirrors private normalizeExtractionResult in geminiService.ts */
function normalizeExtractionResult(result: {
  extractedConcepts?: Array<{
    calloutIdentifiers?: string[];
    figureNumber?: string;
    sourceTerm?: string;
    functionalDescription?: string;
  }>;
}) {
  const extractedConcepts = (result.extractedConcepts ?? [])
    .map((concept) => ({
      ...concept,
      figureNumber: String(concept.figureNumber ?? '').trim(),
      calloutIdentifiers: (concept.calloutIdentifiers ?? []).filter(Boolean),
      sourceTerm: concept.sourceTerm ?? '',
      functionalDescription: concept.functionalDescription ?? '',
    }))
    .filter(
      (concept) => concept.calloutIdentifiers.length > 0 && concept.figureNumber.length > 0
    );

  return { extractedConcepts };
}

describe('extraction normalization', () => {
  it('returns empty array when no illustrations', () => {
    expect(normalizeExtractionResult({ extractedConcepts: [] })).toEqual({
      extractedConcepts: [],
    });
  });

  it('drops entries missing figureNumber or callout identifiers', () => {
    const result = normalizeExtractionResult({
      extractedConcepts: [
        { calloutIdentifiers: ['1'], figureNumber: '1', sourceTerm: 'bolt', functionalDescription: 'fastener' },
        { calloutIdentifiers: ['2'], figureNumber: '', sourceTerm: 'nut', functionalDescription: 'fastener' },
        { calloutIdentifiers: [], figureNumber: '2', sourceTerm: 'washer', functionalDescription: 'spacer' },
      ],
    });

    expect(result.extractedConcepts).toHaveLength(1);
    expect(result.extractedConcepts[0].figureNumber).toBe('1');
  });
});
