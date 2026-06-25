import { describe, it, expect } from 'vitest';
import { extractPageData } from '../src/services/pdfParser';
import { analyzePageWithGemini } from '../src/services/geminiService';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Opt-in only: skipped in CI/automation to avoid live Gemini API calls.
// Run locally with: RUN_GEMINI_TESTS=1 npm test
const runGeminiTests = process.env.RUN_GEMINI_TESTS === '1';

describe.skipIf(!runGeminiTests)('Gemini Extraction Service (Multi-Turn Chat)', () => {
  const fixturePath = path.resolve(__dirname, '../../Instructionbook_10081322_BioDrill500.pdf');

  it('should extract callouts and handle missing context via chat chaining', async () => {
    // We will test page 14
    const pageNum = 14;
    
    console.log(`Extracting text for pages ${pageNum-1}, ${pageNum}, ${pageNum+1}...`);
    const [prevPage, currPage, nextPage] = await Promise.all([
      extractPageData(fixturePath, pageNum - 1),
      extractPageData(fixturePath, pageNum),
      extractPageData(fixturePath, pageNum + 1)
    ]);

    // Define the callback that Gemini will trigger if it needs more context
    const fetchAdjacentImages = async () => {
      console.log('--- FETCHING ADJACENT IMAGES FOR TURN 2 ---');
      return {
        prevImageBase64: prevPage.imageBase64,
        nextImageBase64: nextPage.imageBase64
      };
    };

    console.log(`Page ${pageNum} has illustrations: ${currPage.hasIllustrations}`);
    
    if (!currPage.hasIllustrations) {
      console.log('Skipping Gemini analysis because page has no illustrations.');
      return;
    }

    console.log('Starting Gemini Chat Session...');
    const result = await analyzePageWithGemini(
      currPage.imageBase64,
      fetchAdjacentImages
    );

    console.log('\n=== FINAL GEMINI EXTRACTION RESULTS ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('=======================================\n');

    expect(result).toHaveProperty('extractedConcepts');
    expect(result).toHaveProperty('unreferencedCallouts');
    expect(Array.isArray(result.extractedConcepts)).toBe(true);
    
    // Check if it found the Dial (A) and Hatch (B) from page 14
    const foundA = result.extractedConcepts.some(c => c.calloutIdentifiers?.includes('A'));
    const foundB = result.extractedConcepts.some(c => c.calloutIdentifiers?.includes('B'));
    
    expect(foundA || foundB).toBe(true);
  }, 120000); // 2 minute timeout for potential multi-turn API calls
});
