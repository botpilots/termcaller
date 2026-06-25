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
}

/** One row per figure; callout labels comma-separated when multiple. */
export function groupCalloutsByFigure(
  callouts: Array<{
    identifier: string;
    pageNumber?: number;
    figureNumber?: string;
    concept?: { definitionText?: string };
  }>,
  fallbackDefinition?: string
): FigureOccurrenceRow[] {
  const byFigure = new Map<string, FigureOccurrenceRow & { identifiers: string[] }>();

  for (const callout of callouts) {
    const pageNumber = callout.pageNumber ?? 0;
    const key = `${pageNumber}:${callout.figureNumber ?? ''}`;
    const definitionText = callout.concept?.definitionText ?? fallbackDefinition;

    const existing = byFigure.get(key);
    if (existing) {
      existing.identifiers.push(callout.identifier);
      if (!existing.definitionText && definitionText) {
        existing.definitionText = definitionText;
      }
    } else {
      byFigure.set(key, {
        identifiers: [callout.identifier],
        identifier: callout.identifier,
        pageNumber,
        figureNumber: callout.figureNumber,
        definitionText,
      });
    }
  }

  return [...byFigure.values()].map(({ identifiers, ...row }) => ({
    ...row,
    identifier: identifiers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '),
  }));
}
