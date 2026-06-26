import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { collectExtractionFromPdf } from '../src/services/extractionCollector.js';
import {
  computeSemanticOverlapEmbedded,
  formatSemanticOverlapReport,
} from '../src/utils/semanticKeywordOverlap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../test_data/fixtures/biodrill500-thinking-extraction.json'
);
const PDF_PATH = path.resolve(
  __dirname,
  '../../test_data/Instructionbook_10081322_BioDrill500.pdf'
);

interface ExtractionFixture {
  keywords: Array<{ sourceTerm: string }>;
  counts: { uniqueKeywords: number };
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as ExtractionFixture;
  const baseline = fixture.keywords.map(k => k.sourceTerm).sort();

  console.log('Running full extraction with thinkingLevel=LOW…');
  const t0 = Date.now();
  const snapshot = await collectExtractionFromPdf(PDF_PATH);
  const elapsedSec = Math.round((Date.now() - t0) / 1000);

  console.log(`Done in ${elapsedSec}s`);
  console.log('Image format: WebP lossless @ 300 DPI');
  console.log('Counts:', snapshot.counts);
  console.log('Keywords:', snapshot.sourceTerms.join(', '));

  const exact = baseline.filter(t => snapshot.sourceTerms.includes(t));
  console.log(`\nExact overlap: ${exact.length}/${baseline.length}`);

  const semantic = await computeSemanticOverlapEmbedded(baseline, snapshot.sourceTerms);
  console.log(
    '\n' + formatSemanticOverlapReport(semantic, 'Semantic overlap (LOW thinking vs thinking baseline)')
  );

  if (process.argv.includes('--thresholds')) {
    console.log('\n--- Threshold sweep ---');
    for (const threshold of [0.85, 0.9, 0.92]) {
      const r = await computeSemanticOverlapEmbedded(baseline, snapshot.sourceTerms, threshold);
      console.log(
        `${threshold}: ${r.coveredBaseline.length}/${r.baselineCount} gaps=[${r.gapBaseline.join(', ')}] extra=[${r.extraCurrent.join(', ')}]`
      );
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
