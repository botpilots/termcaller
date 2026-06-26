import { Eye } from 'lucide-react';
import type { CalloutRow } from './OccurrencesTable';

export type OccurrenceDraftFields = Pick<CalloutRow, 'identifier' | 'definitionText' | 'sourceTerm'>;

interface OccurrenceFormProps {
  selectedRow: CalloutRow | null;
  draft: OccurrenceDraftFields | null;
  mode: 'keyword' | 'figure';
  onDraftChange: (patch: Partial<OccurrenceDraftFields>) => void;
  onHighlightPulseHover?: (pageNumber: number | null) => void;
  compact?: boolean;
  emptyMessage?: string;
}

export function OccurrenceForm({
  selectedRow,
  draft,
  mode,
  onDraftChange,
  onHighlightPulseHover,
  compact = false,
  emptyMessage,
}: OccurrenceFormProps) {
  const pad = compact ? 'p-3' : 'p-5';
  const labelClass = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5';
  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  if (!selectedRow || !draft) {
    return (
      <div className={`flex-1 flex items-center justify-center text-sm text-gray-500 ${pad}`}>
        {emptyMessage ?? 'Select an occurrence.'}
      </div>
    );
  }

  return (
    <div className={`flex-1 min-w-0 overflow-y-auto ${pad}`}>
      <div className="space-y-4">
        {mode === 'keyword' && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>
              Page {selectedRow.pageNumber} · Figure {selectedRow.figureNumber ?? '1'}
            </span>
            {onHighlightPulseHover && (
              <button
                type="button"
                title="Preview highlight pulse"
                aria-label={`Pulse highlight on page ${selectedRow.pageNumber}`}
                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                onMouseEnter={() => onHighlightPulseHover(selectedRow.pageNumber)}
                onMouseLeave={() => onHighlightPulseHover(null)}
              >
                <Eye size={16} />
              </button>
            )}
          </div>
        )}

        <div>
          <label htmlFor="occurrence-callout" className={labelClass}>
            Callout
          </label>
          <input
            id="occurrence-callout"
            type="text"
            value={draft.identifier}
            onChange={event => onDraftChange({ identifier: event.target.value })}
            className={inputClass}
          />
        </div>

        {mode === 'figure' && (
          <div>
            <label htmlFor="occurrence-term" className={labelClass}>
              Term
            </label>
            <input
              id="occurrence-term"
              type="text"
              value={draft.sourceTerm ?? ''}
              onChange={event => onDraftChange({ sourceTerm: event.target.value })}
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="occurrence-definition" className={labelClass}>
            Definition
          </label>
          <textarea
            id="occurrence-definition"
            rows={compact ? 3 : 5}
            value={draft.definitionText ?? ''}
            onChange={event => onDraftChange({ definitionText: event.target.value })}
            className={`${inputClass} resize-y min-h-[4.5rem]`}
          />
        </div>

        {mode === 'figure' && selectedRow.anomaly && (
          <div>
            <span className={labelClass}>Anomaly</span>
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {selectedRow.anomaly}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
