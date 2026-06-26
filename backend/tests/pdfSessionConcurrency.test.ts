import { describe, it, expect } from 'vitest';
import { PdfSession } from '../src/services/pdfParser.js';
import { mapWithConcurrency } from '../src/utils/mapWithConcurrency.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');

describe('PdfSession concurrent page reads', () => {
  it('does not destroy pdf.js transport when pages are read in parallel', async () => {
    const session = await PdfSession.open(fixturePath);
    try {
      const pageNumbers = [1, 2, 3, 4, 5, 6];
      const results = await mapWithConcurrency(pageNumbers, 6, pageNumber =>
        session.extractPageData(pageNumber)
      );

      expect(results).toHaveLength(6);
      for (let i = 0; i < pageNumbers.length; i++) {
        expect(results[i]?.pageNumber).toBe(pageNumbers[i]);
        expect(results[i]?.text.length).toBeGreaterThan(0);
        expect(results[i]?.imageBase64.length).toBeGreaterThan(100);
      }
    } finally {
      await session.close();
    }
  }, 60000);
});
