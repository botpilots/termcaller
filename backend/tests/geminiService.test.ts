import { describe, it, expect } from 'vitest';
import { extractPageData } from '../src/services/pdfParser.js';
import { analyzePageWithGemini, type ExtractedCallout } from '../src/services/geminiService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Opt-in only: skipped in CI/automation to avoid live Gemini API calls.
// Run locally with: RUN_GEMINI_TESTS=1 npm test
const runGeminiTests = process.env.RUN_GEMINI_TESTS === '1';

describe.skipIf(!runGeminiTests)('Gemini Extraction Service', () => {
  const fixturePath = path.resolve(__dirname, '../../Instructionbook_10081322_BioDrill500.pdf');

  it('should extract grouped callouts and follow up when sourceTerm is empty', async () => {
    const pageNum = 14;

    const [prevPage, currPage, nextPage] = await Promise.all([
      extractPageData(fixturePath, pageNum - 1),
      extractPageData(fixturePath, pageNum),
      extractPageData(fixturePath, pageNum + 1),
    ]);

    console.log(`Extracting page ${pageNum} for Gemini test`);

    const fetchAdjacentImages = async () => ({
      prevImageBase64: prevPage.imageBase64,
      nextImageBase64: nextPage.imageBase64,
    });

    const result = await analyzePageWithGemini(currPage.imageBase64, fetchAdjacentImages);

    console.log('\n=== GEMINI EXTRACTION RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=================================\n');

    expect(result).toHaveProperty('extractedConcepts');
    expect(Array.isArray(result.extractedConcepts)).toBe(true);
    expect(result).not.toHaveProperty('unreferencedCallouts');

    const foundA = result.extractedConcepts.some((c: ExtractedCallout) => c.calloutIdentifiers?.includes('A'));
    const foundB = result.extractedConcepts.some((c: ExtractedCallout) => c.calloutIdentifiers?.includes('B'));

    expect(foundA || foundB).toBe(true);
  }, 180000);
});
