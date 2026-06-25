import { describe, expect, it } from 'vitest';
import {
  countNonWhitespaceChars,
  isLowTextYield,
  LOW_TEXT_YIELD_CHARS_PER_PAGE,
  resolvePdfCorpusText,
} from '../src/utils/corpusSourceText.js';
import { checksumsMatch, type ManifestSourceEntry } from '../src/utils/corpusBuildCache.js';

describe('corpusSourceText', () => {
  it('flags low yield below chars/page threshold', () => {
    expect(isLowTextYield(100, 10)).toBe(true);
    expect(isLowTextYield(800, 10)).toBe(false);
    expect(LOW_TEXT_YIELD_CHARS_PER_PAGE).toBe(80);
  });

  it('uses normal PDF text when yield is good', () => {
    const longText = 'assembly remove bolt '.repeat(200);
    const result = resolvePdfCorpusText(longText, 10, '/tmp/manual.pdf', () => {});
    expect(result.method).toBe('pdf');
    expect(result.usedOcrSidecar).toBe(false);
    expect(result.lowYield).toBe(false);
  });

  it('warns on low yield without sidecar', () => {
    const logs: string[] = [];
    const result = resolvePdfCorpusText('NOTES', 155, '/tmp/missing-sidecar.pdf', (line) => logs.push(line));
    expect(result.method).toBe('pdf');
    expect(result.lowYield).toBe(true);
    expect(logs.some((line) => line.includes('WARN') && line.includes('ocr:pdf'))).toBe(true);
  });
});

describe('corpusBuildCache', () => {
  it('invalidates when sidecar checksum changes', () => {
    const entry: ManifestSourceEntry = {
      checksum: 'a',
      sidecarChecksum: null,
      method: 'pdf',
      tokenCount: 1,
      uniqueCount: 1,
    };
    expect(checksumsMatch(entry, { checksum: 'a', sidecarChecksum: null })).toBe(true);
    expect(checksumsMatch(entry, { checksum: 'a', sidecarChecksum: 'new' })).toBe(false);
  });

  it('counts non-whitespace chars', () => {
    expect(countNonWhitespaceChars('a b\n c')).toBe(3);
  });
});
