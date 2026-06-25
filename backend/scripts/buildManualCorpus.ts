/**
 * Build service-manual domain corpus from PDFs and plain-text manuals.
 *
 * Outputs:
 *   backend/data/service-manual-corpus/words.txt     — all tokens, space-separated
 *   backend/data/service-manual-corpus/word-rank.json — vocab + parallel frequency arrays
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { tokenizeCorpusText } from '../src/utils/corpusTokenize.js';
import { joinPdfTextItems } from '../src/utils/joinPdfTextItems.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '../..');
const MANUALS_DIR = path.join(REPO_ROOT, 'service_manuals');
const OUTPUT_DIR = path.join(REPO_ROOT, 'backend/data/service-manual-corpus');

interface SourceDocument {
  id: string;
  path: string;
  type: 'pdf' | 'txt';
}

interface WordRankFile {
  /** Vocabulary sorted by descending corpus frequency. */
  v: string[];
  /** Term frequency per vocab index (parallel to v). */
  f: number[];
  /** Document frequency: how many source manuals contain the term. */
  d: number[];
  /** Total token count across corpus. */
  n: number;
  /** Number of source documents. */
  docs: number;
  /** Source document ids included. */
  sources: string[];
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;
  const parts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = joinPdfTextItems(textContent.items);
      parts.push(pageText);

      if (pageNumber % 100 === 0 || pageNumber === doc.numPages) {
        console.log(`    page ${pageNumber}/${doc.numPages}`);
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return parts.join('\n');
}

function listSourceDocuments(): SourceDocument[] {
  const entries = fs.readdirSync(MANUALS_DIR, { withFileTypes: true });
  const sources: SourceDocument[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== '.pdf' && ext !== '.txt') continue;

    const id = path.basename(entry.name, ext);
    if (/hocr/i.test(entry.name)) {
      console.log(`  (skip OCR dump: ${entry.name})`);
      continue;
    }

    sources.push({
      id,
      path: path.join(MANUALS_DIR, entry.name),
      type: ext === '.pdf' ? 'pdf' : 'txt',
    });
  }

  return sources.sort((a, b) => a.id.localeCompare(b.id));
}

async function readDocumentText(source: SourceDocument): Promise<string> {
  if (source.type === 'txt') {
    return fs.readFileSync(source.path, 'utf8');
  }
  return extractPdfText(source.path);
}

async function main() {
  if (!fs.existsSync(MANUALS_DIR)) {
    throw new Error(`Manuals directory not found: ${MANUALS_DIR}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sources = listSourceDocuments();
  console.log(`Found ${sources.length} source document(s) in ${MANUALS_DIR}`);

  const wordsPath = path.join(OUTPUT_DIR, 'words.txt');
  const wordsStream = fs.createWriteStream(wordsPath, { encoding: 'utf8' });

  const termFreq = new Map<string, number>();
  const termDocFreq = new Map<string, number>();
  let totalTokens = 0;
  let firstToken = true;

  for (const source of sources) {
    console.log(`\n[${source.type}] ${source.id}`);
    const text = await readDocumentText(source);
    const tokens = tokenizeCorpusText(text);
    const uniqueInDoc = new Set(tokens);

    console.log(`  ${tokens.length.toLocaleString()} tokens, ${uniqueInDoc.size.toLocaleString()} unique`);

    for (const token of tokens) {
      if (!firstToken) wordsStream.write(' ');
      wordsStream.write(token);
      firstToken = false;
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
      totalTokens++;
    }

    for (const token of uniqueInDoc) {
      termDocFreq.set(token, (termDocFreq.get(token) ?? 0) + 1);
    }
  }

  await new Promise<void>((resolve, reject) => {
    wordsStream.end(() => resolve());
    wordsStream.on('error', reject);
  });

  console.log(`\nWrote ${totalTokens.toLocaleString()} tokens to ${wordsPath}`);

  const ranked = [...termFreq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const wordRank: WordRankFile = {
    v: ranked.map(([word]) => word),
    f: ranked.map(([, count]) => count),
    d: ranked.map(([word]) => termDocFreq.get(word) ?? 0),
    n: totalTokens,
    docs: sources.length,
    sources: sources.map((s) => s.id),
  };

  const rankPath = path.join(OUTPUT_DIR, 'word-rank.json');
  console.log(`Writing ${wordRank.v.length.toLocaleString()} ranked terms to ${rankPath}`);
  fs.writeFileSync(rankPath, JSON.stringify(wordRank));

  const wordsBytes = fs.statSync(wordsPath).size;
  const rankBytes = fs.statSync(rankPath).size;
  console.log(
    `\nDone. words.txt: ${(wordsBytes / 1024 / 1024).toFixed(2)} MB, word-rank.json: ${(rankBytes / 1024).toFixed(1)} KB (${((1 - rankBytes / wordsBytes) * 100).toFixed(1)}% smaller)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
