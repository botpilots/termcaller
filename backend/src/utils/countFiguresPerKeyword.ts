interface KeywordWithConcepts {
  id: string;
  concepts: { id: string }[];
}

interface IllustrationWithCallouts {
  id?: string;
  callouts: { conceptId: string | null }[];
}

/** Count distinct illustrations containing at least one callout linked to each keyword. */
export function countFiguresPerKeyword(
  keywords: KeywordWithConcepts[],
  illustrations: IllustrationWithCallouts[]
): Map<string, number> {
  const conceptToKeyword = new Map<string, string>();

  for (const keyword of keywords) {
    for (const concept of keyword.concepts) {
      conceptToKeyword.set(concept.id, keyword.id);
    }
  }

  const counts = new Map<string, number>();
  for (const keyword of keywords) {
    counts.set(keyword.id, 0);
  }

  for (const illustration of illustrations) {
    const keywordIdsInFigure = new Set<string>();
    for (const callout of illustration.callouts) {
      if (!callout.conceptId) continue;
      const keywordId = conceptToKeyword.get(callout.conceptId);
      if (keywordId) keywordIdsInFigure.add(keywordId);
    }
    for (const keywordId of keywordIdsInFigure) {
      counts.set(keywordId, (counts.get(keywordId) ?? 0) + 1);
    }
  }

  return counts;
}
