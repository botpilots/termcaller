/**
 * OCR a scanned PDF with Tesseract + pdftoppm (poppler).
 *
 * Writes `{basename}_hocr_searchtext.txt` next to the PDF for corpus ingestion.
 *
 * Requires: tesseract, pdftoppm (brew install tesseract poppler)
 */
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mapWithConcurrency } from '../src/utils/mapWithConcurrency.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANUALS_DIR = path.join(REPO_ROOT, 'service_manuals');

const DPI = Number(process.env.OCR_DPI ?? 200);
const CONCURRENCY = Number(process.env.OCR_CONCURRENCY ?? Math.max(2, os.cpus().length - 1));
const LANG = process.env.OCR_LANG ?? 'eng';

function requireTool(name: string): void {
  const result = spawnSync('which', [name], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Missing required tool "${name}". Install with: brew install ${name === 'pdftoppm' ? 'poppler' : name}`);
  }
}

function sidecarPathFor(pdfPath: string): string {
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(path.dirname(pdfPath), `${base}_hocr_searchtext.txt`);
}

function listPageImages(imageDir: string, prefix: string): string[] {
  return fs
    .readdirSync(imageDir)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.png'))
    .sort((a, b) => {
      const pageA = Number(a.slice(prefix.length + 1, -4));
      const pageB = Number(b.slice(prefix.length + 1, -4));
      return pageA - pageB;
    })
    .map((name) => path.join(imageDir, name));
}

function ocrImage(imagePath: string): string {
  return execFileSync('tesseract', [imagePath, 'stdout', '-l', LANG], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

export async function ocrPdfToSidecar(pdfPath: string): Promise<{ pages: number; chars: number; outputPath: string }> {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const outputPath = sidecarPathFor(pdfPath);
  const imageDir = fs.mkdtempSync(path.join(REPO_ROOT, 'backend/.ocr-tmp-'));
  const prefix = 'page';

  try {
    console.log(`Rendering ${path.basename(pdfPath)} at ${DPI} DPI...`);
    execFileSync('pdftoppm', ['-png', '-r', String(DPI), pdfPath, path.join(imageDir, prefix)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    const images = listPageImages(imageDir, prefix);
    if (images.length === 0) {
      throw new Error(`No page images rendered from ${pdfPath}`);
    }

    console.log(`OCR ${images.length} page(s) with Tesseract (${LANG}, concurrency ${CONCURRENCY})...`);

    const pageTexts = await mapWithConcurrency(images, CONCURRENCY, async (imagePath, index) => {
      const text = ocrImage(imagePath).trim();
      if ((index + 1) % 25 === 0 || index + 1 === images.length) {
        console.log(`  page ${index + 1}/${images.length}`);
      }
      return text;
    });

    const documentText = pageTexts
      .map((text, index) => (text ? text : ''))
      .join('\n\n')
      .trim();

    fs.writeFileSync(outputPath, documentText.length > 0 ? `${documentText}\n` : '', 'utf8');

    return {
      pages: images.length,
      chars: documentText.replace(/\s+/g, '').length,
      outputPath,
    };
  } finally {
    fs.rmSync(imageDir, { recursive: true, force: true });
  }
}

async function main() {
  requireTool('tesseract');
  requireTool('pdftoppm');

  const args = process.argv.slice(2);
  const pdfPaths =
    args.length > 0
      ? args.map((arg) => (path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg)))
      : [
          path.join(DEFAULT_MANUALS_DIR, '551827.pdf'),
          path.join(DEFAULT_MANUALS_DIR, 'Nissan Skyline R33 Engine Service Manual.pdf'),
        ];

  for (const pdfPath of pdfPaths) {
    console.log(`\n=== ${path.basename(pdfPath)} ===`);
    const result = await ocrPdfToSidecar(pdfPath);
    console.log(`Wrote ${result.chars.toLocaleString()} chars to ${result.outputPath}`);
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
