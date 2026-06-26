import { countFiguresForKeyword } from './figureOccurrences';

export type KeywordSortMode = 'frequency' | 'both' | 'rarity';

/** Sub-linear exponent for figure count; between log (~0) and linear (1). */
export const PRIORITY_FIGURE_EXPONENT = 0.75;

export interface CorpusTermScore {
  corpusRarity: number;
  inCorpus: boolean;
}

export interface KeywordPriority {
  score: number;
  figureCount: number;
  corpusRarity: number;
  inCorpus: boolean;
  rank: number;
}

function compareBySortMode(
  a: { sourceTerm: string; priority: KeywordPriority },
  b: { sourceTerm: string; priority: KeywordPriority },
  sortMode: KeywordSortMode
): number {
  const tie = a.sourceTerm.localeCompare(b.sourceTerm);
  switch (sortMode) {
    case 'frequency':
      return b.priority.figureCount - a.priority.figureCount || tie;
    case 'rarity':
      return b.priority.corpusRarity - a.priority.corpusRarity || tie;
    case 'both':
    default:
      return b.priority.score - a.priority.score || tie;
  }
}

export function rankKeywords<T extends { id: string; sourceTerm: string; callouts?: unknown[] }>(
  keywords: T[],
  corpusScores: Record<string, CorpusTermScore> | null,
  sortMode: KeywordSortMode = 'both'
): (T & { priority: KeywordPriority })[] {
  const scored = keywords.map((keyword) => {
    const figureCount = countFiguresForKeyword(keyword.callouts as { pageNumber?: number }[] | undefined);
    const corpus = corpusScores?.[keyword.id];
    const corpusRarity = corpus?.corpusRarity ?? 0;
    const inCorpus = corpus?.inCorpus ?? false;
    const projectTf =
      figureCount > 0 ? Math.pow(figureCount, PRIORITY_FIGURE_EXPONENT) : 0;
    const score = projectTf * corpusRarity;

    return {
      ...keyword,
      priority: { score, figureCount, corpusRarity, inCorpus, rank: 0 },
    };
  });

  scored.sort((a, b) => compareBySortMode(a, b, sortMode));

  scored.forEach((entry, index) => {
    entry.priority.rank = index + 1;
  });

  return scored;
}
