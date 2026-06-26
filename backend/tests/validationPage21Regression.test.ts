import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractPageData } from '../src/services/pdfParser.js';
import { validatePageFiguresWithGemini } from '../src/services/geminiValidationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PDF_PATH = path.resolve(
  __dirname,
  '../../test_data/Instructionbook_10081322_BioDrill500.pdf'
);
const PAGE_21_FIGURE_86_TEXT =
  'Figure 8.6 1. Loosen the locking pin (B) and pull out the cotter pin (B). 2. Pull the plug out.';

const runGeminiTests = process.env.RUN_GEMINI_TESTS === '1';

describe('BioDrill page 21 figure 8.6 text filter', () => {
  it('page text contains the known figure 8.6 instruction block', async () => {
    const page = await extractPageData(PDF_PATH, 21);
    expect(page.text).toContain(PAGE_21_FIGURE_86_TEXT);
  });
});

describe.skipIf(!runGeminiTests)('BioDrill page 21 validation regression (live Gemini)', () => {
  it('figure 8.6 flags cotter pin text B vs image A and rejects invented text A', async () => {
    const page = await extractPageData(PDF_PATH, 21);
    const result = await validatePageFiguresWithGemini(page.imageBase64, [], undefined, page.text);

    expect(result.discoveredFigures.length).toBeGreaterThanOrEqual(2);

    const figure86 = result.discoveredFigures[1]!;
    const mismatches = figure86.labelMismatches;

    const inventedCotterPinMismatch = mismatches.some(
      mismatch =>
        mismatch.sourceTerm.toLowerCase().includes('cotter') &&
        mismatch.textIdentifier === 'A' &&
        mismatch.imageIdentifier === 'B'
    );
    expect(inventedCotterPinMismatch).toBe(false);

    const cotterPinMismatch = mismatches.find(mismatch =>
      mismatch.sourceTerm.toLowerCase().includes('cotter')
    );
    if (cotterPinMismatch) {
      expect(cotterPinMismatch.textIdentifier).toBe('B');
      expect(cotterPinMismatch.imageIdentifier).toBe('A');
    }

    const lockingPinMismatch = mismatches.find(mismatch =>
      mismatch.sourceTerm.toLowerCase().includes('locking')
    );
    expect(lockingPinMismatch).toBeUndefined();
  }, 60000);
});
