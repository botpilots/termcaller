import { describe, it, expect } from 'vitest';
import {
  COHESION_CLOSE_MIN,
  pickCanonicalConceptForKeyword,
  ratingFromSimilarity,
  splitCurationState,
  type CurationConceptInput,
} from '../src/services/keywordCurationService.js';
import { cosineSimilarity } from '../src/utils/vectorMath.js';

function concept(
  id: string,
  vector: number[],
  definitionText: string,
  figures: CurationConceptInput['figures'] = []
): CurationConceptInput {
  return {
    id,
    definitionText,
    vector,
    figures,
  };
}

describe('pickCanonicalConceptForKeyword', () => {
  it('returns null for empty input', () => {
    expect(pickCanonicalConceptForKeyword([])).toBeNull();
  });

  it('chooses the concept closest to the group centroid', () => {
    const canonical = pickCanonicalConceptForKeyword([
      { id: 'near', definitionText: 'near centroid', vector: [1, 0, 0] },
      { id: 'far', definitionText: 'far from centroid', vector: [0.95, 0.05, 0] },
    ]);

    expect(canonical?.id).toBe('near');
  });
});

describe('ratingFromSimilarity', () => {
  it('marks >= 0.9 as CLOSE', () => {
    expect(ratingFromSimilarity(COHESION_CLOSE_MIN)).toBe('CLOSE');
    expect(ratingFromSimilarity(0.95)).toBe('CLOSE');
  });

  it('marks definitions below CLOSE threshold as FAIR or POOR', () => {
    expect(ratingFromSimilarity(0.89)).toBe('FAIR');
    expect(ratingFromSimilarity(0.5)).toBe('POOR');
  });
});

describe('splitCurationState', () => {
  it('splits standard concept and per-figure definition warnings below CLOSE cohesion', () => {
    const concepts = [
      concept('canonical', [1, 0, 0], 'official definition', [
        { pageNumber: 10, figureNumber: '1', identifiers: '5' },
      ]),
      concept('outlier', [0, 1, 0], 'different meaning', [
        { pageNumber: 12, figureNumber: '2', identifiers: '8, 9' },
        { pageNumber: 14, figureNumber: '1', identifiers: '3' },
      ]),
    ];

    const centroidSimilarity = cosineSimilarity([0, 1, 0], [1, 0, 0]);
    expect(centroidSimilarity).toBeLessThan(COHESION_CLOSE_MIN);

    const split = splitCurationState(concepts);

    expect(split.concept?.id).toBe('canonical');
    expect(split.concept?.figures).toHaveLength(1);
    expect(split.definitionWarnings).toHaveLength(2);
    expect(split.definitionWarnings.every(warning => warning.conceptId === 'outlier')).toBe(true);
    expect(split.definitionWarnings.map(warning => warning.pageNumber)).toEqual([12, 14]);
    expect(split.hasDefinitionWarnings).toBe(true);
  });

  it('reports no definition warnings when all concepts are CLOSE to centroid', () => {
    const split = splitCurationState([
      concept('a', [1, 0, 0], 'one', [{ pageNumber: 1, figureNumber: '1', identifiers: '1' }]),
      concept('b', [0.99, 0.01, 0], 'two', [{ pageNumber: 2, figureNumber: '1', identifiers: '2' }]),
    ]);

    expect(split.definitionWarnings).toHaveLength(0);
    expect(split.hasDefinitionWarnings).toBe(false);
  });

  it('includes CLOSE non-canonical figures in concept provenance', () => {
    const split = splitCurationState([
      concept('canonical', [1, 0, 0], 'official definition', [
        { pageNumber: 10, figureNumber: '1', identifiers: '5' },
      ]),
      concept('aligned', [0.99, 0.01, 0], 'similar meaning', [
        { pageNumber: 12, figureNumber: '2', identifiers: '8' },
      ]),
    ]);

    expect(split.concept?.figures).toHaveLength(2);
    expect(split.definitionWarnings).toHaveLength(0);
  });
});

describe('branch validation rules', () => {
  it('requires a normalized term different from the current keyword', () => {
    const currentTerm = 'bracket';
    const sameTerm = 'Bracket';
    const newTerm = 'mounting bracket';

    const normalize = (term: string) => term.trim().toLowerCase();

    expect(normalize(sameTerm)).toBe(normalize(currentTerm));
    expect(normalize(newTerm)).not.toBe(normalize(currentTerm));
  });
});
