import { describe, expect, it } from 'vitest';
import { normalizeExtractionResult } from '../src/services/geminiService.js';

describe('extraction normalization', () => {
  it('returns empty array when no illustrations', () => {
    expect(normalizeExtractionResult({ figures: [] })).toEqual({
      extractedConcepts: [],
    });
  });

  it('auto-numbers figures and drops parts without callout identifiers', () => {
    const result = normalizeExtractionResult({
      figures: [
        {
          parts: [
            { calloutIdentifiers: ['1'], sourceTerm: 'bolt', functionalDescription: 'fastener' },
            { calloutIdentifiers: [], sourceTerm: 'nut', functionalDescription: 'fastener' },
          ],
        },
        {
          parts: [
            { calloutIdentifiers: ['2'], sourceTerm: 'washer', functionalDescription: 'spacer' },
          ],
        },
      ],
    });

    expect(result.extractedConcepts).toHaveLength(2);
    expect(result.extractedConcepts[0]).toMatchObject({
      figureNumber: '1',
      calloutIdentifiers: ['1'],
      sourceTerm: 'bolt',
    });
    expect(result.extractedConcepts[1]).toMatchObject({
      figureNumber: '2',
      calloutIdentifiers: ['2'],
      sourceTerm: 'washer',
    });
  });

  it('skips empty figure containers without affecting numbering', () => {
    const result = normalizeExtractionResult({
      figures: [
        { parts: [] },
        {
          parts: [
            { calloutIdentifiers: ['3'], sourceTerm: 'plug', functionalDescription: 'connector' },
          ],
        },
      ],
    });

    expect(result.extractedConcepts).toHaveLength(1);
    expect(result.extractedConcepts[0]?.figureNumber).toBe('1');
  });

  it('numbers multiple parts on the same figure with the same figureNumber', () => {
    const result = normalizeExtractionResult({
      figures: [
        {
          parts: [
            { calloutIdentifiers: ['1'], sourceTerm: 'bolt', functionalDescription: 'fastener' },
            { calloutIdentifiers: ['2'], sourceTerm: 'nut', functionalDescription: 'fastener' },
          ],
        },
      ],
    });

    expect(result.extractedConcepts).toHaveLength(2);
    expect(result.extractedConcepts.every((concept) => concept.figureNumber === '1')).toBe(true);
  });
});
