import { describe, it, expect } from 'vitest';
import { scanPdfPages } from '../src/utils/pdfPageScan.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');

describe('scanPdfPages', () => {
  it('keeps the PDF session open until all page work finishes', async () => {
    const pageNumbers: number[] = [];

    await scanPdfPages(fixturePath, {
      concurrency: 6,
      onPage: async ({ pageNumber }) => {
        pageNumbers.push(pageNumber);
        return pageNumber;
      },
    });

    expect(pageNumbers).toHaveLength(34);
    expect(pageNumbers.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 34 }, (_, i) => i + 1)
    );
  }, 120000);
});
