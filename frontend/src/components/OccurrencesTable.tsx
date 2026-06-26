import { Eye } from 'lucide-react';

export interface CalloutRow {
  identifier: string;
  figureNumber?: string;
  pageNumber: number;
  sourceTerm?: string;
  definitionText?: string;
  anomaly?: string;
}

interface OccurrencesTableProps {
  rows: CalloutRow[];
  mode: 'keyword' | 'figure';
  emptyMessage: string;
  selectedRowKey?: string | null;
  onRowClick?: (row: CalloutRow) => void;
  onHighlightPulseHover?: (pageNumber: number | null) => void;
  compact?: boolean;
}

export function OccurrencesTable({
  rows,
  mode,
  emptyMessage,
  selectedRowKey,
  onRowClick,
  onHighlightPulseHover,
  compact = false,
}: OccurrencesTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
        {emptyMessage}
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) =>
    mode === 'keyword'
      ? a.pageNumber - b.pageNumber || a.identifier.localeCompare(b.identifier)
      : a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
  );

  const cellPad = compact ? 'px-3 py-2' : 'px-6 py-4';
  const headPad = compact ? 'px-3 py-2' : 'px-6 py-3';

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {mode === 'keyword' && (
              <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                Page
              </th>
            )}
            {mode === 'keyword' && (
              <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                Figure
              </th>
            )}
            <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
              Callout
            </th>
            {mode === 'figure' && (
              <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                Term
              </th>
            )}
            <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
              Definition
            </th>
            {mode === 'figure' && (
              <th scope="col" className={`${headPad} text-left text-xs font-medium text-gray-500 uppercase tracking-wider`}>
                Anomaly
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sorted.map((row, idx) => {
            const rowKey = `${row.pageNumber}:${row.figureNumber ?? ''}:${row.identifier}`;
            const isSelected = selectedRowKey === rowKey;
            const isClickable = Boolean(onRowClick);

            return (
            <tr
              key={`${row.pageNumber}-${row.identifier}-${idx}`}
              onClick={isClickable ? () => onRowClick!(row) : undefined}
              className={
                isSelected
                  ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                  : row.anomaly
                    ? 'bg-amber-50 hover:bg-amber-100/60'
                    : isClickable
                      ? 'hover:bg-gray-50 cursor-pointer'
                      : 'hover:bg-gray-50'
              }
            >
              {mode === 'keyword' && (
                <td className={`${cellPad} whitespace-nowrap text-sm text-gray-500`}>
                  <span className="inline-flex items-center gap-1">
                    <span className="tabular-nums">{row.pageNumber}</span>
                    {onHighlightPulseHover && (
                      <button
                        type="button"
                        title="Preview highlight pulse"
                        aria-label={`Pulse highlight on page ${row.pageNumber}`}
                        className="p-0.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        onClick={event => event.stopPropagation()}
                        onMouseEnter={event => {
                          event.stopPropagation();
                          onHighlightPulseHover(row.pageNumber);
                        }}
                        onMouseLeave={event => {
                          event.stopPropagation();
                          onHighlightPulseHover(null);
                        }}
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </span>
                </td>
              )}
              {mode === 'keyword' && (
                <td className={`${cellPad} whitespace-nowrap text-sm text-gray-500`}>{row.figureNumber || '—'}</td>
              )}
              <td className={`${cellPad} whitespace-nowrap text-sm font-medium text-gray-900`}>{row.identifier}</td>
              {mode === 'figure' && (
                <td className={`${cellPad} whitespace-nowrap text-sm text-gray-700`}>{row.sourceTerm || '—'}</td>
              )}
              <td className={`${cellPad} text-sm text-gray-700`} title={row.definitionText}>
                {compact && row.definitionText && row.definitionText.length > 48
                  ? `${row.definitionText.slice(0, 48)}…`
                  : row.definitionText || '—'}
              </td>
              {mode === 'figure' && (
                <td className={`${cellPad} text-sm text-amber-800`}>{row.anomaly || '—'}</td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
