import { describe, expect, it } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  adjacentPageSearchOrder,
  findTermBoxes,
  locateOnPdfPage,
  locateOnPdfPageWithAdjacent,
  pickNearestPage,
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

describe('findTermBoxes', () => {
  it('matches a phrase split across lines in reading order', () => {
    const runs = [
      { str: 'sealing', x: 100, y: 200, width: 50, height: 12 },
      { str: 'cover', x: 100, y: 220, width: 40, height: 12 },
    ];

    const boxes = findTermBoxes(runs, 'sealing cover');
    expect(boxes).toHaveLength(2);
    expect(boxes.map(box => box.y)).toEqual([200, 220]);
  });

  it('falls back to individual tokens when words are separated by other text', () => {
    const runs = [
      { str: 'sealing', x: 100, y: 200, width: 50, height: 12 },
      { str: 'plate', x: 100, y: 210, width: 40, height: 12 },
      { str: 'cover', x: 100, y: 220, width: 40, height: 12 },
    ];

    const boxes = findTermBoxes(runs, 'sealing cover');
    expect(boxes).toHaveLength(2);
    expect(boxes.map(box => box.y)).toEqual([200, 220]);
  });

  it('returns empty when not all tokens are present', () => {
    const runs = [{ str: 'sealing', x: 100, y: 200, width: 50, height: 12 }];

    expect(findTermBoxes(runs, 'sealing cover')).toHaveLength(0);
  });
});

describe('pickNearestPage', () => {
  it('picks the page closest to the reference', () => {
    expect(pickNearestPage([14, 16], 15)).toBe(14);
    expect(pickNearestPage([14, 16], 16)).toBe(16);
    expect(pickNearestPage([14, 16], 17)).toBe(16);
  });

  it('breaks ties toward the lower page number', () => {
    expect(pickNearestPage([14, 16], 15)).toBe(14);
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
    expect(result.boxes.every(box => box.matchType === 'term')).toBe(true);
  }, 30000);

  it('searches adjacent pages for the term even when a callout label exists on the figure page', async () => {
    const result = await locateOnPdfPageWithAdjacent(fixturePath, 15, {
      term: 'BioDrill',
      callout: '1',
    });
    expect(result.matchedPage).toBe(14);
    expect(result.boxes.length).toBeGreaterThan(0);
    expect(result.boxes.every(box => box.matchType === 'term')).toBe(true);
  }, 30000);

  it('prefers the requested page over an adjacent page when both match', async () => {
    const result = await locateOnPdfPageWithAdjacent(fixturePath, 14, { term: 'BioDrill' });
    expect(result.matchedPage).toBe(14);
    expect(result.boxes.length).toBeGreaterThan(0);
  }, 30000);

  it('uses referencePage to choose among adjacent hits', async () => {
    const onPage = await locateOnPdfPage(fixturePath, 15, { term: 'BioDrill' });
    expect(onPage.boxes).toHaveLength(0);

    const onNeighbor = await locateOnPdfPage(fixturePath, 14, { term: 'BioDrill' });
    expect(onNeighbor.boxes.length).toBeGreaterThan(0);

    const withRefNearNeighbor = await locateOnPdfPageWithAdjacent(
      fixturePath,
      15,
      { term: 'BioDrill' },
      undefined,
      14
    );
    expect(withRefNearNeighbor.matchedPage).toBe(14);

    const withRefFarFromNeighbor = await locateOnPdfPageWithAdjacent(
      fixturePath,
      15,
      { term: 'BioDrill' },
      undefined,
      20
    );
    expect(withRefFarFromNeighbor.matchedPage).toBe(14);
  }, 30000);
});
