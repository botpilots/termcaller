import { describe, expect, it } from 'vitest';
import { mapPageValidationToFigures } from '../src/services/figureValidationService.js';
import type { FigureValidationInput } from '../src/services/geminiValidationService.js';

describe('figureValidationService page mapping', () => {
  it('maps discovered figures back to known figure numbers by index', () => {
    const knownFigures: FigureValidationInput[] = [
      { figureNumber: '1', extractedConcepts: [] },
      { figureNumber: '2', extractedConcepts: [] },
    ];

    const mapped = mapPageValidationToFigures(knownFigures, [
      {
        figureNumber: '1',
        unreferencedCallouts: ['3'],
        uncalledReferences: [],
        labelMismatches: [],
      },
      {
        figureNumber: '2',
        unreferencedCallouts: [],
        uncalledReferences: ['4'],
        labelMismatches: [],
      },
    ]);

    expect(mapped).toEqual([
      {
        figureNumber: '1',
        validation: {
          unreferencedCallouts: ['3'],
          uncalledReferences: [],
          labelMismatches: [],
        },
      },
      {
        figureNumber: '2',
        validation: {
          unreferencedCallouts: [],
          uncalledReferences: ['4'],
          labelMismatches: [],
        },
      },
    ]);
  });
});
