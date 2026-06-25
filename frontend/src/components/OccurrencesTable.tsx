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
}

export function OccurrencesTable({ rows, mode, emptyMessage }: OccurrencesTableProps) {
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

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {mode === 'keyword' && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Page
              </th>
            )}
            {mode === 'keyword' && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Figure
              </th>
            )}
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Callout
            </th>
            {mode === 'figure' && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Term
              </th>
            )}
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Definition
            </th>
            {mode === 'figure' && (
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Anomaly
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sorted.map((row, idx) => (
            <tr
              key={`${row.pageNumber}-${row.identifier}-${idx}`}
              className={row.anomaly ? 'bg-amber-50 hover:bg-amber-100/60' : 'hover:bg-gray-50'}
            >
              {mode === 'keyword' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.pageNumber}</td>
              )}
              {mode === 'keyword' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.figureNumber || '—'}</td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.identifier}</td>
              {mode === 'figure' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{row.sourceTerm || '—'}</td>
              )}
              <td className="px-6 py-4 text-sm text-gray-700" title={row.definitionText}>
                {row.definitionText || '—'}
              </td>
              {mode === 'figure' && (
                <td className="px-6 py-4 text-sm text-amber-800">{row.anomaly || '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
