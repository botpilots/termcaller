import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { getPdfPageCount } from '../src/utils/pdfPageCount.js';

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test_data/Instructionbook_10081322_BioDrill500.pdf'
);

describe('getPdfPageCount', () => {
  it('returns the page count for a known fixture PDF', async () => {
    await expect(getPdfPageCount(fixturePath)).resolves.toBe(34);
  });
});
