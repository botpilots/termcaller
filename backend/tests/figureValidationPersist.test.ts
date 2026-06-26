import { describe, expect, it } from 'vitest';
import {
  parseValidationResult,
  serializeValidationResult,
  withParsedValidation,
} from '../src/services/figureValidationPersist.js';

describe('figureValidationPersist', () => {
  it('round-trips validation JSON', () => {
    const validation = {
      unreferencedCallouts: ['3'],
      uncalledReferences: ['4'],
      labelMismatches: [
        { textIdentifier: 'B', imageIdentifier: 'A', sourceTerm: 'cotter pin' },
      ],
    };

    const parsed = parseValidationResult(serializeValidationResult(validation));
    expect(parsed).toEqual(validation);
  });

  it('returns null for invalid JSON', () => {
    expect(parseValidationResult('not-json')).toBeNull();
    expect(parseValidationResult(null)).toBeNull();
  });

  it('maps illustration rows to parsed validation', () => {
    const mapped = withParsedValidation({
      id: 'fig-1',
      validationResult: serializeValidationResult({
        unreferencedCallouts: ['1'],
        uncalledReferences: [],
        labelMismatches: [],
      }),
    });

    expect(mapped).toEqual({
      id: 'fig-1',
      validation: {
        unreferencedCallouts: ['1'],
        uncalledReferences: [],
        labelMismatches: [],
      },
    });
  });
});
