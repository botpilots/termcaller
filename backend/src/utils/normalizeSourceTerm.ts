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

export function normalizeSourceTerm(term: string): string {
  const lower = term.trim().toLowerCase().replace(/\s+/g, ' ');
  return singularize(lower);
}
