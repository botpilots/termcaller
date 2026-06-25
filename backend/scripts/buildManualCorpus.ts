/**
 * Build service-manual domain corpus from PDFs and plain-text manuals.
 *
 * Outputs:
 *   backend/data/service-manual-corpus/words.txt     — all tokens, space-separated
 *   backend/data/service-manual-corpus/word-rank.json — vocab + parallel frequency arrays
 *   backend/data/service-manual-corpus/build-manifest.json — per-source checksums for incremental rebuild
 *   backend/data/service-manual-corpus/cache/*.tokens.txt — per-source token cache
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checksumsMatch,
  loadManifest,
  pruneStaleCache,
  pruneStaleManifest,
  readCachedTokens,
  saveManifest,
  sourceChecksums,
  writeCachedTokens,
  type ManifestSourceEntry,
} from '../src/utils/corpusBuildCache.js';
import { parseOcrSidecarId, resolvePdfCorpusText } from '../src/utils/corpusSourceText.js';
import { tokenizeCorpusText } from '../src/utils/corpusTokenize.js';
import { joinPdfTextItems } from '../src/utils/joinPdfTextItems.js';
import { loadPdfDocument } from '../src/utils/pdfjsLoad.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '../..');
const MANUALS_DIR = path.join(REPO_ROOT, 'service_manuals');
const OUTPUT_DIR = path.join(REPO_ROOT, 'backend/data/service-manual-corpus');
const CACHE_DIR = path.join(OUTPUT_DIR, 'cache');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'build-manifest.json');

interface SourceDocument {
  id: string;
  path: string;
  type: 'pdf' | 'txt' | 'ocr-sidecar';
}

interface WordRankFile {
  v: string[];
  f: number[];
  d: number[];
  n: number;
  docs: number;
  sources: string[];
}

interface ProcessedSource {
  tokens: string[];
  manifestEntry: ManifestSourceEntry;
  cached: boolean;
}

async function extractPdfText(pdfPath: string): Promise<{ text: string; pages: number }> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = loadPdfDocument(data);
  const doc = await loadingTask.promise;
  const parts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      parts.push(joinPdfTextItems(textContent.items));

      if (pageNumber % 100 === 0 || pageNumber === doc.numPages) {
        console.log(`    page ${pageNumber}/${doc.numPages}`);
      }
    }
    return { text: parts.join('\n'), pages: doc.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

function listSourceDocuments(): SourceDocument[] {
  const entries = fs.readdirSync(MANUALS_DIR, { withFileTypes: true });
  const sources: SourceDocument[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const fullPath = path.join(MANUALS_DIR, entry.name);

    const sidecarId = parseOcrSidecarId(entry.name);
    if (sidecarId) {
      const pdfPath = path.join(MANUALS_DIR, `${sidecarId}.pdf`);
      if (!fs.existsSync(pdfPath)) {
        sources.push({ id: sidecarId, path: fullPath, type: 'ocr-sidecar' });
      }
      continue;
    }

    if (ext !== '.pdf' && ext !== '.txt') continue;

    const id = path.basename(entry.name, ext);
    sources.push({
      id,
      path: fullPath,
      type: ext === '.pdf' ? 'pdf' : 'txt',
    });
  }

  return sources.sort((a, b) => a.id.localeCompare(b.id));
}

async function processSource(source: SourceDocument, manifest: ReturnType<typeof loadManifest>): Promise<ProcessedSource> {
  const checksums = sourceChecksums(source.path, source.type);
  const prior = manifest.sources[source.id];

  if (prior && checksumsMatch(prior, checksums)) {
    const cached = readCachedTokens(CACHE_DIR, source.id);
    if (cached) {
      console.log(`  (unchanged — ${cached.length.toLocaleString()} tokens from cache)`);
      return { tokens: cached, manifestEntry: prior, cached: true };
    }
  }

  let tokens: string[];
  let manifestEntry: ManifestSourceEntry;

  if (source.type === 'txt') {
    const text = fs.readFileSync(source.path, 'utf8');
    tokens = tokenizeCorpusText(text);
    manifestEntry = {
      checksum: checksums.checksum,
      sidecarChecksum: null,
      method: 'txt',
      tokenCount: tokens.length,
      uniqueCount: new Set(tokens).size,
      lowYield: false,
    };
  } else if (source.type === 'ocr-sidecar') {
    const text = fs.readFileSync(source.path, 'utf8');
    tokens = tokenizeCorpusText(text);
    manifestEntry = {
      checksum: checksums.checksum,
      sidecarChecksum: null,
      method: 'ocr-sidecar',
      tokenCount: tokens.length,
      uniqueCount: new Set(tokens).size,
      lowYield: false,
    };
  } else {
    const { text: extracted, pages } = await extractPdfText(source.path);
    const resolved = resolvePdfCorpusText(extracted, pages, source.path);
    tokens = tokenizeCorpusText(resolved.text);
    manifestEntry = {
      checksum: checksums.checksum,
      sidecarChecksum: checksums.sidecarChecksum,
      method: resolved.method,
      tokenCount: tokens.length,
      uniqueCount: new Set(tokens).size,
      pages: resolved.pages,
      charsPerPage: resolved.charsPerPage,
      lowYield: resolved.lowYield,
    };
  }

  writeCachedTokens(CACHE_DIR, source.id, tokens);
  console.log(
    `  ${tokens.length.toLocaleString()} tokens, ${manifestEntry.uniqueCount.toLocaleString()} unique` +
      (manifestEntry.method === 'ocr-sidecar' ? ' (OCR sidecar)' : '')
  );

  return { tokens, manifestEntry, cached: false };
}

async function main() {
  if (!fs.existsSync(MANUALS_DIR)) {
    throw new Error(`Manuals directory not found: ${MANUALS_DIR}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sources = listSourceDocuments();
  console.log(`Found ${sources.length} source document(s) in ${MANUALS_DIR}`);

  const activeIds = new Set(sources.map((s) => s.id));
  const manifest = loadManifest(MANIFEST_PATH);
  pruneStaleManifest(manifest, activeIds);
  pruneStaleCache(CACHE_DIR, activeIds);

  const wordsPath = path.join(OUTPUT_DIR, 'words.txt');
  const wordsStream = fs.createWriteStream(wordsPath, { encoding: 'utf8' });

  const termFreq = new Map<string, number>();
  const termDocFreq = new Map<string, number>();
  let totalTokens = 0;
  let firstToken = true;
  let skippedCount = 0;

  for (const source of sources) {
    console.log(`\n[${source.type}] ${source.id}`);
    const { tokens, manifestEntry, cached } = await processSource(source, manifest);
    if (cached) skippedCount++;

    manifest.sources[source.id] = manifestEntry;
    const uniqueInDoc = new Set(tokens);

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

  saveManifest(MANIFEST_PATH, manifest);

  console.log(`\nWrote ${totalTokens.toLocaleString()} tokens to ${wordsPath}`);
  if (skippedCount > 0) {
    console.log(`Skipped extraction for ${skippedCount}/${sources.length} unchanged source(s)`);
  }

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
