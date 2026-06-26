import { useMemo } from 'react';
import type { CalloutRow } from './OccurrencesTable';
import { CohesionBadge } from './CohesionBadge';
import { formatPageFigureId, occurrenceEditorKey } from '../utils/figureOccurrences';

interface OccurrenceRailProps {
  rows: CalloutRow[];
  mode: 'keyword' | 'figure';
  activeKey: string | null;
  onSelect: (row: CalloutRow) => void;
  compact?: boolean;
  className?: string;
}

export function OccurrenceRail({
  rows,
  mode,
  activeKey,
  onSelect,
  compact = false,
  className = '',
}: OccurrenceRailProps) {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        mode === 'keyword'
          ? a.pageNumber - b.pageNumber ||
            (a.figureNumber ?? '').localeCompare(b.figureNumber ?? '', undefined, { numeric: true })
          : a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
      ),
    [rows, mode]
  );

  const railWidth = compact ? 'w-[3.75rem]' : 'w-[4.5rem]';
  const buttonSize =
    mode === 'keyword'
      ? compact
        ? 'w-[3.25rem] h-[4rem] text-xs'
        : 'w-16 h-[4.5rem] text-sm'
      : compact
        ? 'w-[3.25rem] h-[3.25rem] text-xs'
        : 'w-16 h-16 text-sm';
  const railPadding = compact ? 'py-2 gap-1.5 px-1' : 'py-3 gap-2 px-1.5';

  return (
    <div
      className={`flex flex-col shrink-0 border-r border-gray-200 bg-white overflow-y-auto ${railWidth} ${railPadding} ${className}`}
      role="tablist"
      aria-label="Occurrences"
    >
      {sorted.map(row => {
        const key = occurrenceEditorKey(row, mode);
        const isSelected = activeKey === key;
        const label =
          mode === 'keyword' ? formatPageFigureId(row.pageNumber, row.figureNumber) : row.identifier;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            title={
              mode === 'keyword'
                ? `Page ${row.pageNumber}, figure ${row.figureNumber ?? '1'}`
                : `Callout ${row.identifier}`
            }
            onClick={() => onSelect(row)}
            className={`relative flex flex-col items-center justify-center font-semibold tabular-nums transition-colors border-l-[3px] rounded-sm mx-auto ${buttonSize} ${
              isSelected
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : row.anomaly
                  ? 'border-transparent bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <span className="leading-tight text-center px-1">{label}</span>
            {mode === 'keyword' && row.cohesionRating && (
              <CohesionBadge rating={row.cohesionRating} compact className="mt-0.5" />
            )}
          </button>
        );
      })}
    </div>
  );
}
