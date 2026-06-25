import { describe, expect, it } from 'vitest';
import { collapseGluedToken, isCorpusToken, isPlausibleWord, tokenizeCorpusText } from '../src/utils/corpusTokenize.js';

describe('isPlausibleWord', () => {
  it('rejects OCR mashups and accepts normal technical terms', () => {
    expect(isPlausibleWord('dootaicssisiioinosienainasiaa')).toBe(false);
    expect(isPlausibleWord('specification')).toBe(true);
    expect(isPlausibleWord('reinitialisation')).toBe(true);
    expect(isPlausibleWord('transmission')).toBe(true);
  });
});

describe('collapseGluedToken', () => {
  it('collapses triple-glued PDF tokens to a single unit', () => {
    expect(collapseGluedToken('removeremoveremove')).toBe('remove');
    expect(collapseGluedToken('refitrefitrefit')).toBe('refit');
    expect(collapseGluedToken('windshieldwindshieldwindshield')).toBe('windshield');
    expect(collapseGluedToken('disassemblingdisassemblingdisassembling')).toBe('disassembling');
  });

  it('leaves normal words unchanged', () => {
    expect(collapseGluedToken('remove')).toBe('remove');
    expect(collapseGluedToken('bonbon')).toBe('bonbon');
  });
});

describe('isCorpusToken', () => {
  it('rejects single letters and tokens containing digits', () => {
    expect(isCorpusToken('a')).toBe(false);
    expect(isCorpusToken('bolt')).toBe(true);
    expect(isCorpusToken('m8')).toBe(false);
    expect(isCorpusToken('v6')).toBe(false);
  });

  it('rejects tokens longer than 30 characters', () => {
    expect(isCorpusToken('thequickbrownfoxjumpsoverlazy')).toBe(true);
    expect(isCorpusToken('thequickbrownfoxjumpsoverlazyxx')).toBe(false);
  });

  it('rejects tokens with three or more repeated characters in a row', () => {
    expect(isCorpusToken('tree')).toBe(true);
    expect(isCorpusToken('feee')).toBe(false);
    expect(isCorpusToken('scsss')).toBe(false);
  });
});

describe('tokenizeCorpusText', () => {
  it('lowercases, singularizes, and splits on punctuation', () => {
    const tokens = tokenizeCorpusText('Remove the Screws from the Bracket-plate.');
    expect(tokens).toEqual(['remove', 'the', 'screw', 'from', 'the', 'bracket', 'plate']);
  });

  it('drops single-letter tokens, digits, and glued triples from token stream', () => {
    const tokens = tokenizeCorpusText('A v6 bolt removeremoveremove refitrefitrefit panel 2.');
    expect(tokens).toEqual(['bolt', 'remove', 'refit', 'panel']);
  });
});
