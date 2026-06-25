import { describe, expect, it } from 'vitest';
import { normalizeSourceTerm } from '../src/utils/normalizeSourceTerm.js';

describe('normalizeSourceTerm', () => {
  it('lowercases and trims terms', () => {
    expect(normalizeSourceTerm('  Screw  ')).toBe('screw');
    expect(normalizeSourceTerm('BRACKET')).toBe('bracket');
  });

  it('singularizes common plural forms', () => {
    expect(normalizeSourceTerm('screws')).toBe('screw');
    expect(normalizeSourceTerm('brackets')).toBe('bracket');
    expect(normalizeSourceTerm('valves')).toBe('valve');
    expect(normalizeSourceTerm('batteries')).toBe('battery');
    expect(normalizeSourceTerm('boxes')).toBe('box');
    expect(normalizeSourceTerm('switches')).toBe('switch');
  });

  it('leaves already-singular terms unchanged', () => {
    expect(normalizeSourceTerm('screw')).toBe('screw');
    expect(normalizeSourceTerm('glass')).toBe('glass');
    expect(normalizeSourceTerm('press')).toBe('press');
  });

  it('handles irregular plurals', () => {
    expect(normalizeSourceTerm('mice')).toBe('mouse');
    expect(normalizeSourceTerm('teeth')).toBe('tooth');
  });
});
