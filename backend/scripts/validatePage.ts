import { extractPageData } from '../src/services/pdfParser.js';
import { validatePageFiguresWithGemini } from '../src/services/geminiValidationService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pdfPath =
  process.argv[2] ??
  path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');
const pageNumber = Number(process.argv[3] ?? '21');

async function main() {
  console.log(`PDF: ${pdfPath}`);
  console.log(`Page: ${pageNumber}`);

  const page = await extractPageData(pdfPath, pageNumber);
  console.log('\n--- Page text ---');
  console.log(page.text);
  console.log('\nhasIllustrations:', page.hasIllustrations);

  if (!page.hasIllustrations) {
    console.log('No illustrations — skipping validation.');
    return;
  }

  const result = await validatePageFiguresWithGemini(page.imageBase64, [], undefined, page.text);
  console.log('\n--- Validation result ---');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
