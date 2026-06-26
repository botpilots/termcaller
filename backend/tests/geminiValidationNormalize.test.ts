import { describe, expect, it } from 'vitest';
import {
  isPlausibleCalloutLabel,
  normalizeDiscoveredFigures,
  sanitizeValidationResult,
  textAssignsCalloutToPart,
  filterLabelMismatchesAgainstPageText,
} from '../src/services/geminiValidationService.js';

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

describe('isPlausibleCalloutLabel', () => {
  it('accepts typical callout leader labels', () => {
    expect(isPlausibleCalloutLabel('1')).toBe(true);
    expect(isPlausibleCalloutLabel('12')).toBe(true);
    expect(isPlausibleCalloutLabel('A')).toBe(true);
    expect(isPlausibleCalloutLabel('(3)')).toBe(true);
  });

  it('rejects long numeric serial-style values', () => {
    expect(isPlausibleCalloutLabel('10081322')).toBe(false);
    expect(isPlausibleCalloutLabel('1234')).toBe(false);
  });
});

describe('sanitizeValidationResult', () => {
  it('filters implausible callout identifiers', () => {
    const result = sanitizeValidationResult({
      unreferencedCallouts: ['7', '10081322'],
      uncalledReferences: ['12345'],
      labelMismatches: [
        {
          textIdentifier: '1',
          imageIdentifier: '10081322',
          sourceTerm: 'bolt',
        },
      ],
    });

    expect(result.unreferencedCallouts).toEqual(['7']);
    expect(result.uncalledReferences).toEqual([]);
    expect(result.labelMismatches).toEqual([]);
  });

  it('drops label mismatches where textIdentifier does not appear next to the part name', () => {
    const pageText =
      'Figure 8.6 1. Loosen the locking pin (B) and pull out the cotter pin (B). 2. Pull the plug out.';

    const result = sanitizeValidationResult(
      {
        unreferencedCallouts: [],
        uncalledReferences: [],
        labelMismatches: [
          {
            textIdentifier: 'A',
            imageIdentifier: 'B',
            sourceTerm: 'cotter pin',
          },
          {
            textIdentifier: 'B',
            imageIdentifier: 'A',
            sourceTerm: 'cotter pin',
          },
        ],
      },
      pageText
    );

    expect(result.labelMismatches).toEqual([
      {
        textIdentifier: 'B',
        imageIdentifier: 'A',
        sourceTerm: 'cotter pin',
      },
    ]);
  });
});

describe('textAssignsCalloutToPart', () => {
  const pageText =
    'Figure 8.6 1. Loosen the locking pin (B) and pull out the cotter pin (B). 2. Pull the plug out.';

  it('matches explicit part-to-label assignments in text', () => {
    expect(textAssignsCalloutToPart(pageText, 'locking pin', 'B')).toBe(true);
    expect(textAssignsCalloutToPart(pageText, 'cotter pin', 'B')).toBe(true);
    expect(textAssignsCalloutToPart(pageText, 'cotter pin', 'A')).toBe(false);
    expect(textAssignsCalloutToPart(pageText, 'locking pin', 'A')).toBe(false);
  });
});

describe('filterLabelMismatchesAgainstPageText', () => {
  it('removes invented text identifiers', () => {
    const pageText = 'pull out the cotter pin (B).';
    const filtered = filterLabelMismatchesAgainstPageText(pageText, [
      { textIdentifier: 'A', imageIdentifier: 'B', sourceTerm: 'cotter pin' },
      { textIdentifier: 'B', imageIdentifier: 'A', sourceTerm: 'cotter pin' },
    ]);

    expect(filtered).toEqual([
      { textIdentifier: 'B', imageIdentifier: 'A', sourceTerm: 'cotter pin' },
    ]);
  });
});
