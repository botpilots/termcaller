import { describe, expect, it } from 'vitest';
import { joinPdfTextItems } from '../src/utils/joinPdfTextItems.js';

describe('joinPdfTextItems', () => {
  it('concatenates line-wrapped word fragments without a space', () => {
    const text = joinPdfTextItems([
      { str: 'CONTR' },
      { str: 'OL', hasEOL: true },
      { str: 'diagram' },
    ]);
    expect(text).toBe('CONTROL diagram');
  });

  it('preserves spaces embedded in text runs', () => {
    const text = joinPdfTextItems([
      { str: 'Remove the ' },
      { str: 'bolt', hasEOL: true },
    ]);
    expect(text).toBe('Remove the bolt ');
  });
});
