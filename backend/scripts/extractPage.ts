import { extractPageData } from '../src/services/pdfParser.js';
import { analyzePageWithGemini } from '../src/services/geminiService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfPath = process.argv[2]
  ?? path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');
const pageNumber = Number(process.argv[3] ?? '26');
const runGemini = process.argv.includes('--gemini');

async function main() {
  console.log(`PDF: ${pdfPath}`);
  console.log(`Page: ${pageNumber}`);

  const t0 = Date.now();
  const page = await extractPageData(pdfPath, pageNumber);
  const extractMs = Date.now() - t0;
  const imageBytes = Math.round((page.imageBase64.length * 3) / 4);

  console.log('\n--- Page render ---');
  console.log({
    imageMimeType: page.imageMimeType,
    hasIllustrations: page.hasIllustrations,
    textChars: page.text.length,
    approxImageKB: Math.round(imageBytes / 1024),
    base64Chars: page.imageBase64.length,
    extractMs,
  });
  console.log('Text preview:', page.text.slice(0, 300).replace(/\s+/g, ' '));

  if (!runGemini) {
    console.log('\nAdd --gemini to call the live API.');
    return;
  }

  if (!page.hasIllustrations) {
    console.log('\nPage has no illustrations — skipping Gemini.');
    return;
  }

  const fetchAdjacentImages = async () => {
    const tAdj = Date.now();
    const [prevPage, nextPage] = await Promise.all([
      pageNumber > 1 ? extractPageData(pdfPath, pageNumber - 1) : null,
      extractPageData(pdfPath, pageNumber + 1),
    ]);
    console.log(`\nAdjacent pages loaded in ${Date.now() - tAdj}ms`);
    return {
      prevImageBase64: prevPage?.imageBase64,
      nextImageBase64: nextPage?.imageBase64,
    };
  };

  console.log('\n--- Gemini extraction ---');
  const tGemini = Date.now();
  const result = await analyzePageWithGemini(page.imageBase64, fetchAdjacentImages);
  console.log(`Gemini finished in ${Date.now() - tGemini}ms`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
