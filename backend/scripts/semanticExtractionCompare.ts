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
}

async function main() {
  const useCached = process.argv.includes('--cached');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as ExtractionFixture;
  const baselineTerms = fixture.keywords.map(k => k.sourceTerm).sort();

  let currentTerms: string[];

  if (useCached) {
    // Last no-thinking run (2026-06-25) — avoid re-calling Gemini
    currentTerms = [
      'arrow',
      'catch',
      'cotter pin',
      'dial',
      'distribution head',
      'distribution head outlet',
      'distributor head',
      'distributor outlet',
      'electrical screw',
      'flange',
      'hatch',
      'locking pin',
      'motor cable',
      'plug',
      'roller type a',
      'roller type b',
      'rubber lid',
      'screw',
      'sealing cover',
      'seed hose',
      'seed output roller',
      'sliding hatch',
      'tramlining motor',
      'wing nut',
    ].sort();
    console.log('Using cached no-thinking keyword list\n');
  } else {
    console.log('Running live extraction…');
    const snapshot = await collectExtractionFromPdf(PDF_PATH);
    currentTerms = snapshot.sourceTerms;
    console.log('Current keywords:', currentTerms.join(', '), '\n');
  }

  const exactOverlap = baselineTerms.filter(t => currentTerms.includes(t));
  console.log(`Exact string overlap: ${exactOverlap.length}/${baselineTerms.length}\n`);

  if (process.argv.includes('--thresholds')) {
    for (const threshold of [0.85, 0.9, 0.92]) {
      const r = await computeSemanticOverlapEmbedded(baselineTerms, currentTerms, threshold);
      console.log(
        `threshold ${threshold}: ${r.coveredBaseline.length}/${r.baselineCount} gaps=[${r.gapBaseline}] extra=[${r.extraCurrent}]`
      );
    }
    return;
  }

  const result = await computeSemanticOverlapEmbedded(baselineTerms, currentTerms);
  console.log(formatSemanticOverlapReport(result));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
