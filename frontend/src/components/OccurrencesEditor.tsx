import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { CalloutRow } from './OccurrencesTable';
import { formatPageFigureId, occurrenceEditorKey } from '../utils/figureOccurrences';

interface OccurrencesEditorProps {
  rows: CalloutRow[];
  mode: 'keyword' | 'figure';
  emptyMessage: string;
  selectedKey?: string | null;
  onSelect?: (row: CalloutRow) => void;
  onHighlightPulseHover?: (pageNumber: number | null) => void;
  compact?: boolean;
}

type DraftFields = Pick<CalloutRow, 'identifier' | 'definitionText' | 'sourceTerm'>;

function draftFromRow(row: CalloutRow): DraftFields {
  return {
    identifier: row.identifier ?? '',
    definitionText: row.definitionText ?? '',
    sourceTerm: row.sourceTerm ?? '',
  };
}

export function OccurrencesEditor({
  rows,
  mode,
  emptyMessage,
  selectedKey,
  onSelect,
  onHighlightPulseHover,
  compact = false,
}: OccurrencesEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        mode === 'keyword'
          ? a.pageNumber - b.pageNumber || (a.figureNumber ?? '').localeCompare(b.figureNumber ?? '', undefined, { numeric: true })
          : a.identifier.localeCompare(b.identifier, undefined, { numeric: true })
      ),
    [rows, mode]
  );

  const firstKey = sorted[0] ? occurrenceEditorKey(sorted[0], mode) : null;
  const isControlled = selectedKey !== undefined;
  const [internalKey, setInternalKey] = useState<string | null>(firstKey);
  const activeKey = isControlled ? (selectedKey ?? firstKey) : internalKey;

  useEffect(() => {
    if (!isControlled) {
      setInternalKey(firstKey);
    }
  }, [isControlled, firstKey]);

  const selectedRow = sorted.find(row => occurrenceEditorKey(row, mode) === activeKey) ?? null;

  useEffect(() => {
    setDrafts(prev => {
      const next = { ...prev };
      for (const row of sorted) {
        const key = occurrenceEditorKey(row, mode);
        if (!next[key]) {
          next[key] = draftFromRow(row);
        }
      }
      return next;
    });
  }, [sorted]);

  useEffect(() => {
    setDrafts({});
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
        {emptyMessage}
      </div>
    );
  }

  const updateDraft = (key: string, patch: Partial<DraftFields>) => {
    setDrafts(prev => ({
      ...prev,
      [key]: { ...prev[key]!, ...patch },
    }));
  };

  const draft = activeKey ? drafts[activeKey] ?? (selectedRow ? draftFromRow(selectedRow) : null) : null;
  const pad = compact ? 'p-3' : 'p-5';
  const labelClass = 'block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5';
  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden min-h-[12rem] bg-white">
      <div
        className={`flex flex-col shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto ${
          compact ? 'py-1.5 px-1 gap-0.5' : 'py-2 px-1.5 gap-1'
        }`}
        role="tablist"
        aria-label="Occurrences"
      >
        {sorted.map(row => {
          const key = occurrenceEditorKey(row, mode);
          const isSelected = activeKey === key;
          const label =
            mode === 'keyword'
              ? formatPageFigureId(row.pageNumber, row.figureNumber)
              : row.identifier;

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              title={mode === 'keyword' ? `Page ${row.pageNumber}, figure ${row.figureNumber ?? '1'}` : `Callout ${row.identifier}`}
              onClick={() => {
                if (!isControlled) setInternalKey(key);
                onSelect?.(row);
              }}
              className={`relative flex items-center justify-center font-medium tabular-nums transition-colors border-l-[3px] ${
                compact ? 'w-10 h-10 text-[10px]' : 'w-12 h-12 text-xs'
              } ${
                isSelected
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : row.anomaly
                    ? 'border-transparent bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-transparent text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="leading-none text-center px-0.5">{label}</span>
            </button>
          );
        })}
      </div>

      <div className={`flex-1 min-w-0 overflow-y-auto ${pad}`}>
        {selectedRow && draft ? (
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
                onChange={event => updateDraft(activeKey!, { identifier: event.target.value })}
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
                  onChange={event => updateDraft(activeKey!, { sourceTerm: event.target.value })}
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
                onChange={event => updateDraft(activeKey!, { definitionText: event.target.value })}
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
        ) : null}
      </div>
    </div>
  );
}
