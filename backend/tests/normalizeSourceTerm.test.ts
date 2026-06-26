import { describe, expect, it } from 'vitest';
import {
  canonicalSourceTerm,
  normalizeSourceTerm,
  sourceTermLookupKey,
  sourceTermsMatch,
} from '../src/utils/normalizeSourceTerm.js';

describe('sourceTermLookupKey', () => {
  it('lowercases and singularizes for dedup/corpus', () => {
    expect(sourceTermLookupKey('  Screw  ')).toBe('screw');
    expect(sourceTermLookupKey('BRACKET')).toBe('bracket');
    expect(sourceTermLookupKey('screws')).toBe('screw');
    expect(sourceTermLookupKey('O-ring')).toBe('o-ring');
    expect(sourceTermLookupKey('R needle')).toBe('r needle');
  });

  it('handles irregular plurals', () => {
    expect(sourceTermLookupKey('mice')).toBe('mouse');
    expect(sourceTermLookupKey('teeth')).toBe('tooth');
  });
});

describe('canonicalSourceTerm', () => {
  it('preserves manual casing', () => {
    expect(canonicalSourceTerm('R needle')).toBe('R needle');
    expect(canonicalSourceTerm('O-ring')).toBe('O-ring');
    expect(canonicalSourceTerm('  O-ring  ')).toBe('O-ring');
  });

  it('singularizes while preserving casing', () => {
    expect(canonicalSourceTerm('O-rings')).toBe('O-ring');
    expect(canonicalSourceTerm('Screws')).toBe('Screw');
    expect(canonicalSourceTerm('screws')).toBe('screw');
  });
});

describe('sourceTermsMatch', () => {
  it('matches terms that differ only by case or plural', () => {
    expect(sourceTermsMatch('Screw', 'screws')).toBe(true);
    expect(sourceTermsMatch('O-ring', 'o-rings')).toBe(true);
    expect(sourceTermsMatch('terminal', 'Terminal')).toBe(true);
    expect(sourceTermsMatch('nut', 'bolt')).toBe(false);
  });
});

describe('normalizeSourceTerm (alias)', () => {
  it('delegates to sourceTermLookupKey', () => {
    expect(normalizeSourceTerm('Screws')).toBe(sourceTermLookupKey('Screws'));
  });
});
