import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectExtractionFromPdf } from '../src/services/extractionCollector.js';
import {
  computeSemanticOverlapEmbedded,
  SEMANTIC_MATCH_THRESHOLD,
} from '../src/utils/semanticKeywordOverlap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BIODRILL_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../test_data/fixtures/biodrill500-thinking-extraction.json'
);
const PLANMED_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../test_data/fixtures/planmed-sophie-baseline.json'
);
const BIODRILL_PDF_PATH = path.resolve(
  __dirname,
  '../../test_data/Instructionbook_10081322_BioDrill500.pdf'
);
const PLANMED_PDF_PATH = path.resolve(
  __dirname,
  '../../service_manuals/Planmed_Sophie_Spare_Parts_Manual.pdf'
);

// Opt-in: full-document live Gemini run (~minutes). Compares no-thinking re-run to thinking baseline.
// RUN_GEMINI_TESTS=1 npm test -- extractionRegression.test.ts
const runGeminiTests = process.env.RUN_GEMINI_TESTS === '1';

interface ExtractionFixture {
  projectId: string;
  projectName: string;
  pdfFile: string;
  extractionMode: string;
  counts: {
    uniqueKeywords: number;
    concepts: number;
    illustrations: number;
    callouts: number;
  };
  keywords: Array<{ sourceTerm: string; calloutCount: number }>;
}

function loadFixture(path: string): ExtractionFixture {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as ExtractionFixture;
}

describe('BioDrill500 extraction fixture', () => {
  it('fixture file is present and well-formed', () => {
    const fixture = loadFixture(BIODRILL_FIXTURE_PATH);
    expect(fixture.pdfFile).toBe('Instructionbook_10081322_BioDrill500.pdf');
    expect(fixture.counts.uniqueKeywords).toBe(fixture.keywords.length);
    expect(fixture.counts.uniqueKeywords).toBeGreaterThan(0);
  });
});

describe.skipIf(!runGeminiTests)('BioDrill500 extraction regression (live Gemini)', () => {
  it('matches thinking-era fixture for unique keywords', async () => {
    const fixture = loadFixture(BIODRILL_FIXTURE_PATH);
    const baselineTerms = fixture.keywords.map(k => k.sourceTerm).sort();

    const snapshot = await collectExtractionFromPdf(BIODRILL_PDF_PATH);

    console.log('\n=== EXTRACTION REGRESSION ===');
    console.log('Baseline (with thinking):', fixture.counts);
    console.log('Current (no thinking):  ', snapshot.counts);

    const missing = baselineTerms.filter(t => !snapshot.sourceTerms.includes(t));
    const extra = snapshot.sourceTerms.filter(t => !baselineTerms.includes(t));
    const overlap = baselineTerms.filter(t => snapshot.sourceTerms.includes(t));
    const semantic = await computeSemanticOverlapEmbedded(baselineTerms, snapshot.sourceTerms);

    console.log(`Exact keyword overlap: ${overlap.length}/${baselineTerms.length}`);
    console.log(
      `Semantic coverage (≥${SEMANTIC_MATCH_THRESHOLD}): ${semantic.coveredBaseline.length}/${baselineTerms.length}`
    );
    if (semantic.gapBaseline.length > 0) console.log('Semantic gaps:', semantic.gapBaseline);
    if (semantic.extraCurrent.length > 0) console.log('Semantic extras:', semantic.extraCurrent);

    expect(snapshot.counts.pagesTimedOut).toBe(0);

    // Primary: most baseline concepts captured semantically (level guard has no callout — not required)
    expect(semantic.semanticCoverage).toBeGreaterThanOrEqual(0.9);

    // Secondary: exact unique keyword count within tolerance (LLM naming variance)
    const keywordDelta = Math.abs(snapshot.counts.uniqueKeywords - fixture.counts.uniqueKeywords);
    expect(keywordDelta).toBeLessThanOrEqual(5);
  }, 900_000);
});

describe.skipIf(!runGeminiTests)('Planmed Sophie extraction regression (live Gemini)', () => {
  it('skips generic hardware instructions via prompt updates', async () => {
    const fixture = loadFixture(PLANMED_FIXTURE_PATH);
    const baselineTerms = fixture.keywords.map(k => k.sourceTerm).sort();
    
    const isGenericRegex = /^(?:M\d+.*|DIN\s*\d+.*|ø\d+.*|screw|nut|washer)$/i;
    const genericBaseline = baselineTerms.filter(t => t.match(isGenericRegex));
    expect(genericBaseline.length).toBeGreaterThan(0);

    const snapshot = await collectExtractionFromPdf(PLANMED_PDF_PATH);

    console.log('\n=== PLANMED EXTRACTION REGRESSION ===');
    console.log('Baseline (old prompt):', fixture.counts);
    console.log('Current (new prompt): ', snapshot.counts);

    const genericCurrent = snapshot.sourceTerms.filter(t => t.match(isGenericRegex));
    console.log(`Generic hardware dropped: from ${genericBaseline.length} to ${genericCurrent.length}`);
    
    if (genericCurrent.length > 0) {
      console.log('Remaining generic items:', genericCurrent);
    }

    expect(snapshot.counts.pagesTimedOut).toBe(0);
    // Ensure that generic items were significantly reduced or eliminated
    expect(genericCurrent.length).toBeLessThan(genericBaseline.length);
    expect(genericCurrent.length).toBeLessThanOrEqual(5);

    // Ensure it didn't just fail or drop everything
    expect(snapshot.counts.uniqueKeywords).toBeGreaterThan(100);
  }, 900_000);
});
