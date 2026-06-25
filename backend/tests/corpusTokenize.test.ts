import { describe, expect, it } from 'vitest';
import { tokenizeCorpusText } from '../src/utils/corpusTokenize.js';

describe('tokenizeCorpusText', () => {
  it('lowercases, singularizes, and splits on punctuation', () => {
    const tokens = tokenizeCorpusText('Remove the Screws from the Bracket-plate.');
    expect(tokens).toEqual(['remove', 'the', 'screw', 'from', 'the', 'bracket', 'plate']);
  });
});
