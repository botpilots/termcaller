import fs from 'fs';
import path from 'path';
import gm from 'gm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfPath = process.argv[2]
  ?? path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');
const pageNumber = Number(process.argv[3] ?? '18');
const dpis = (process.argv[4] ?? '100,150,200,250,300').split(',').map(Number);

const outDir = path.resolve(__dirname, `../../output/dpi-comparison/page-${pageNumber}`);

function renderPage(dpi: number): Promise<{ width: number; height: number; bytes: number }> {
  const imageMagick = gm.subClass({ imageMagick: true });
  const outPath = path.join(outDir, `page${pageNumber}_${dpi}dpi.png`);

  return new Promise((resolve, reject) => {
    imageMagick(`${pdfPath}[${pageNumber - 1}]`)
      .density(dpi, dpi)
      .background('white')
      .flatten()
      .write(outPath, err => {
        if (err) return reject(err);

        imageMagick(outPath).size((sizeErr, size) => {
          if (sizeErr) return reject(sizeErr);
          const bytes = fs.statSync(outPath).size;
          resolve({ width: size.width ?? 0, height: size.height ?? 0, bytes });
        });
      });
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`PDF: ${pdfPath}`);
  console.log(`Page: ${pageNumber}`);
  console.log(`Output: ${outDir}\n`);

  const rows: Array<{ dpi: number; width: number; height: number; kb: number; file: string }> = [];

  for (const dpi of dpis) {
    const { width, height, bytes } = await renderPage(dpi);
    const file = `page${pageNumber}_${dpi}dpi.png`;
    rows.push({ dpi, width, height, kb: Math.round(bytes / 1024), file });
    console.log(`  ${dpi} dpi → ${width}×${height}px, ${Math.round(bytes / 1024)} KB`);
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Page ${pageNumber} DPI comparison</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }
    h1 { font-size: 1.25rem; }
    .grid { display: grid; gap: 24px; }
    figure { margin: 0; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 12px; }
    figcaption { margin-bottom: 8px; font-weight: 600; }
    img { max-width: 100%; height: auto; background: white; display: block; }
    .meta { color: #aaa; font-size: 0.875rem; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Page ${pageNumber} — DPI comparison</h1>
  <p class="meta">${path.basename(pdfPath)}</p>
  <div class="grid">
${rows
  .map(
    r => `    <figure>
      <figcaption>${r.dpi} DPI</figcaption>
      <div class="meta">${r.width}×${r.height}px · ${r.kb} KB</div>
      <img src="${r.file}" alt="${r.dpi} dpi" />
    </figure>`
  )
  .join('\n')}
  </div>
</body>
</html>`;

  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html);
  console.log(`\nOpen: file://${indexPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
