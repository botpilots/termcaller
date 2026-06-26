import { formatPageFigureId } from '../utils/figureOccurrences';
import type { CohesionRating } from '../utils/conceptCohesion';

export interface FigureProvenance {
  pageNumber: number;
  figureNumber: string;
  identifiers: string;
}

export interface KeywordCurationState {
  keywordId: string;
  sourceTerm: string;
  concept: {
    id: string;
    definitionText: string;
    cohesionRating: CohesionRating;
    figures: FigureProvenance[];
  } | null;
  definitionWarnings: Array<{
    conceptId: string;
    definitionText: string;
    cohesionRating: CohesionRating;
    pageNumber: number;
    figureNumber: string;
    identifiers: string;
  }>;
  hasDefinitionWarnings: boolean;
}

interface KeywordCurationPanelProps {
  sourceTerm: string;
  state: KeywordCurationState | null;
  isLoading: boolean;
  loadError: string | null;
  onWarningClick: (warning: KeywordCurationState['definitionWarnings'][number]) => void;
  compact?: boolean;
}

export function KeywordCurationPanel({
  sourceTerm,
  state,
  isLoading,
  loadError,
  onWarningClick,
  compact = false,
}: KeywordCurationPanelProps) {
  const pad = compact ? 'p-4' : 'p-8';

  if (isLoading) {
    return (
      <div className={`text-sm text-gray-500 text-center py-12 ${pad}`}>Loading curation state…</div>
    );
  }

  if (loadError) {
    return <div className={`text-sm text-red-600 text-center py-12 ${pad}`}>{loadError}</div>;
  }

  if (!state?.concept) {
    return (
      <div className={`text-sm text-gray-500 text-center py-12 ${pad}`}>
        No concepts extracted for this keyword yet.
      </div>
    );
  }

  const concept = state.concept;

  return (
    <div className={`flex-1 min-h-0 min-w-0 overflow-y-auto ${pad}`}>
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <span className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
            Definition
          </span>
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
            {concept.definitionText}
          </p>

          {concept.figures.length > 0 && (
            <div>
              <span className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                Provenance
              </span>
              <ul className="text-sm text-gray-600 space-y-1">
                {concept.figures.map(figure => (
                  <li key={`${figure.pageNumber}:${figure.figureNumber}`}>
                    <span className="font-semibold text-gray-800">
                      {formatPageFigureId(figure.pageNumber, figure.figureNumber)}
                    </span>
                    {' · '}
                    {figure.identifiers}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {state.definitionWarnings.length > 0 && (
          <div className="space-y-3">
            {state.definitionWarnings.map(warning => (
              <button
                key={`${warning.conceptId}:${warning.pageNumber}:${warning.figureNumber}`}
                type="button"
                onClick={() => onWarningClick(warning)}
                className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-2 hover:border-amber-300 transition-colors"
              >
                <span className="block text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  Terminology warning
                </span>
                <p className="text-sm font-medium text-gray-900">
                  {formatPageFigureId(warning.pageNumber, warning.figureNumber)} ·{' '}
                  {warning.identifiers}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                  &ldquo;{warning.definitionText}&rdquo;
                </p>
                <p className="text-sm text-amber-900/80 leading-relaxed">
                  This definition differs from the group. The source term &laquo;{sourceTerm}&raquo;
                  may not apply here — consider a more specific term for this figure.
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
