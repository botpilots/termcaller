import { describe, expect, it } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  adjacentPageSearchOrder,
  locateOnPdfPage,
  locateOnPdfPageWithAdjacent,
} from '../src/utils/pdfTextLocate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');

describe('adjacentPageSearchOrder', () => {
  it('searches N, then N−1, then N+1 within bounds', () => {
    expect(adjacentPageSearchOrder(5, 10)).toEqual([5, 4, 6]);
    expect(adjacentPageSearchOrder(1, 10)).toEqual([1, 2]);
    expect(adjacentPageSearchOrder(10, 10)).toEqual([10, 9]);
    expect(adjacentPageSearchOrder(1, 1)).toEqual([1]);
  });
});

describe('locateOnPdfPageWithAdjacent', () => {
  it('returns boxes on the requested page when the term is present there', async () => {
    const onPage = await locateOnPdfPage(fixturePath, 14, { term: 'BioDrill' });
    expect(onPage.boxes.length).toBeGreaterThan(0);

    const result = await locateOnPdfPageWithAdjacent(fixturePath, 14, { term: 'BioDrill' });
    expect(result.matchedPage).toBe(14);
    expect(result.boxes.length).toBeGreaterThan(0);
    expect(result.boxes.every(box => box.pageNumber === 14)).toBe(true);
  }, 30000);

  it('falls back to an adjacent page when the term is missing on the requested page', async () => {
    const onPage = await locateOnPdfPage(fixturePath, 15, { term: 'BioDrill' });
    expect(onPage.boxes).toHaveLength(0);

    const onNeighbor = await locateOnPdfPage(fixturePath, 14, { term: 'BioDrill' });
    expect(onNeighbor.boxes.length).toBeGreaterThan(0);

    const result = await locateOnPdfPageWithAdjacent(fixturePath, 15, { term: 'BioDrill' });
    expect(result.matchedPage).toBe(14);
    expect(result.boxes.length).toBeGreaterThan(0);
    expect(result.boxes.every(box => box.pageNumber === 14)).toBe(true);
  }, 30000);

  it('prefers the requested page over an adjacent page when both match', async () => {
    const result = await locateOnPdfPageWithAdjacent(fixturePath, 14, { term: 'BioDrill' });
    expect(result.matchedPage).toBe(14);
    expect(result.boxes.length).toBeGreaterThan(0);
  }, 30000);
});
