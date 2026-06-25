import { describe, expect, it } from 'vitest';
import { countFiguresPerKeyword } from '../src/utils/countFiguresPerKeyword.js';

describe('countFiguresPerKeyword', () => {
  it('counts distinct illustrations, not individual callouts', () => {
    const keywords = [
      { id: 'kw1', concepts: [{ id: 'c1' }, { id: 'c2' }] },
      { id: 'kw2', concepts: [{ id: 'c3' }] },
    ];
    const illustrations = [
      {
        callouts: [
          { conceptId: 'c1' },
          { conceptId: 'c1' },
          { conceptId: 'c3' },
          { conceptId: null },
        ],
      },
      {
        callouts: [{ conceptId: 'c1' }],
      },
    ];

    const counts = countFiguresPerKeyword(keywords, illustrations);
    expect(counts.get('kw1')).toBe(2);
    expect(counts.get('kw2')).toBe(1);
  });
});
