const IRREGULAR_PLURALS: Record<string, string> = {
  mice: 'mouse',
  teeth: 'tooth',
  feet: 'foot',
  leaves: 'leaf',
  knives: 'knife',
  wives: 'wife',
  lives: 'life',
  children: 'child',
  men: 'man',
  women: 'woman',
};

function collapseWhitespace(term: string): string {
  return term.trim().replace(/\s+/g, ' ');
}

function singularize(word: string): string {
  if (!word) return word;

  if (IRREGULAR_PLURALS[word]) {
    return IRREGULAR_PLURALS[word];
  }

  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }

  if (/(xes|zes|ches|shes|sses)$/.test(word) && word.length > 3) {
    return word.slice(0, -2);
  }

  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is') && word.length > 3) {
    return word.slice(0, -1);
  }

  return word;
}

function singularizePreservingCase(word: string): string {
  const lower = word.toLowerCase();
  const singularLower = singularize(lower);
  if (singularLower === lower) return word;
  if (word.endsWith('s') || word.endsWith('S')) {
    return word.slice(0, -1);
  }
  if (word === lower) return singularLower;
  if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
    return singularLower[0].toUpperCase() + singularLower.slice(1);
  }
  return singularLower;
}

function singularizeLastToken(phrase: string, preserveCase: boolean): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const last = words.length - 1;
  words[last] = preserveCase
    ? singularizePreservingCase(words[last])
    : singularize(words[last].toLowerCase());
  return words.join(' ');
}

/** Lowercase singular form for corpus lookup and dedup keys. */
export function sourceTermLookupKey(term: string): string {
  return singularizeLastToken(collapseWhitespace(term).toLowerCase(), false);
}

/** Display/storage form: trim, singularize last word, preserve manual casing. */
export function canonicalSourceTerm(term: string): string {
  return singularizeLastToken(collapseWhitespace(term), true);
}

/** @deprecated Use sourceTermLookupKey for corpus/dedup or canonicalSourceTerm for display. */
export function normalizeSourceTerm(term: string): string {
  return sourceTermLookupKey(term);
}

export function sourceTermsMatch(a: string, b: string): boolean {
  return sourceTermLookupKey(a) === sourceTermLookupKey(b);
}

export function findKeywordByLookupKey<T extends { sourceTerm: string }>(
  keywords: T[],
  term: string
): T | undefined {
  const key = sourceTermLookupKey(term);
  return keywords.find((keyword) => sourceTermLookupKey(keyword.sourceTerm) === key);
}
