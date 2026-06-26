import { describe, expect, it } from 'vitest';
import { normalizeDiscoveredFigures } from '../src/services/geminiValidationService.js';

describe('discovered figure normalization', () => {
  it('auto-numbers figures in reading order', () => {
    const result = normalizeDiscoveredFigures({
      figures: [
        {
          unreferencedCallouts: ['1'],
          uncalledReferences: [],
          labelMismatches: [],
        },
        {
          unreferencedCallouts: [],
          uncalledReferences: ['2'],
          labelMismatches: [],
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.figureNumber).toBe('1');
    expect(result[1]?.figureNumber).toBe('2');
  });

  it('keeps clean figures with no validation anomalies', () => {
    const result = normalizeDiscoveredFigures({
      figures: [
        {
          unreferencedCallouts: [],
          uncalledReferences: [],
          labelMismatches: [],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.figureNumber).toBe('1');
  });
});
