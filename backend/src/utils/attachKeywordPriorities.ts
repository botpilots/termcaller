import { rankKeywords, type KeywordPriority } from '../services/termPriorityService.js';
import { countFiguresPerKeyword } from './countFiguresPerKeyword.js';

interface KeywordWithConcepts {
  id: string;
  sourceTerm: string;
  concepts: { id: string }[];
}

interface IllustrationWithCallouts {
  callouts: { conceptId: string | null }[];
}

export function attachKeywordPriorities<
  T extends KeywordWithConcepts,
  I extends IllustrationWithCallouts,
>(keywords: T[], illustrations: I[]): (T & { priority: KeywordPriority })[] {
  const figureCounts = countFiguresPerKeyword(keywords, illustrations);

  return rankKeywords(
    keywords.map((keyword) => ({
      ...keyword,
      figureCount: figureCounts.get(keyword.id) ?? 0,
    }))
  ).map(({ figureCount: _ignored, ...keyword }) => keyword);
}
