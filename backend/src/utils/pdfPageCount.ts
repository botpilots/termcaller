import fs from 'fs';
import { loadPdfDocument } from './pdfjsLoad.js';

/** Open a PDF on disk and return its page count. */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = loadPdfDocument(data);
  try {
    const pdfDocument = await loadingTask.promise;
    return pdfDocument.numPages;
  } finally {
    await loadingTask.destroy();
  }
}
