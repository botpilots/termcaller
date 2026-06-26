interface CalloutWithPage {
  pageNumber?: number;
}

/** Count distinct pages (figures) containing callouts for a keyword. */
export function countFiguresForKeyword(callouts: CalloutWithPage[] | undefined): number {
  if (!callouts?.length) return 0;
  return new Set(callouts.map((c) => c.pageNumber).filter((p) => p !== undefined)).size;
}

export interface FigureOccurrenceRow {
  identifier: string;
  pageNumber: number;
  figureNumber?: string;
  definitionText?: string;
  conceptId?: string;
}

/** Display label for a page.figure occurrence, e.g. `25.1`. */
export function formatPageFigureId(pageNumber: number, figureNumber?: string): string {
  return `${pageNumber}.${figureNumber?.trim() || '1'}`;
}

/** Stable key for a figure-level occurrence (one per page.figure). */
export function figureOccurrenceKey(row: { pageNumber: number; figureNumber?: string }): string {
  return `${row.pageNumber}:${row.figureNumber ?? ''}`;
}

/** Stable key for selecting an occurrence in the editor. */
export function occurrenceEditorKey(
  row: { pageNumber: number; figureNumber?: string; identifier: string },
  mode: 'keyword' | 'figure'
): string {
  return mode === 'keyword' ? figureOccurrenceKey(row) : `${row.pageNumber}:${row.identifier}`;
}

/** One row per figure; callout labels comma-separated when multiple. */
export function groupCalloutsByFigure(
  callouts: Array<{
    identifier: string;
    pageNumber?: number;
    figureNumber?: string;
    concept?: { id?: string; definitionText?: string };
  }>,
  fallbackDefinition?: string
): FigureOccurrenceRow[] {
  const byFigure = new Map<string, FigureOccurrenceRow & { identifiers: string[] }>();

  for (const callout of callouts) {
    const pageNumber = callout.pageNumber ?? 0;
    const key = `${pageNumber}:${callout.figureNumber ?? ''}`;
    const definitionText = callout.concept?.definitionText ?? fallbackDefinition;
    const conceptId = callout.concept?.id;

    const existing = byFigure.get(key);
    if (existing) {
      existing.identifiers.push(callout.identifier);
      if (!existing.definitionText && definitionText) {
        existing.definitionText = definitionText;
      }
      if (!existing.conceptId && conceptId) {
        existing.conceptId = conceptId;
      }
    } else {
      byFigure.set(key, {
        identifiers: [callout.identifier],
        identifier: callout.identifier,
        pageNumber,
        figureNumber: callout.figureNumber,
        definitionText,
        conceptId,
      });
    }
  }

  return [...byFigure.values()].map(({ identifiers, ...row }) => ({
    ...row,
    identifier: identifiers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '),
  }));
}
