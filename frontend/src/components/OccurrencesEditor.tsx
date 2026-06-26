import type { CalloutRow } from './OccurrencesTable';
import { OccurrenceForm } from './OccurrenceForm';
import { OccurrenceRail } from './OccurrenceRail';
import { useOccurrenceEditorState } from '../hooks/useOccurrenceEditorState';

interface OccurrencesEditorProps {
  rows: CalloutRow[];
  mode: 'keyword' | 'figure';
  emptyMessage: string;
  selectedKey?: string | null;
  onSelect?: (row: CalloutRow) => void;
  onHighlightPulseHover?: (pageNumber: number | null) => void;
  compact?: boolean;
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
  const { activeKey, selectedRow, draft, updateDraft, selectRow } = useOccurrenceEditorState(
    rows,
    mode,
    selectedKey
  );

  if (rows.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden min-h-48 bg-white">
      <OccurrenceRail
        rows={rows}
        mode={mode}
        activeKey={activeKey}
        onSelect={row => onSelect?.(selectRow(row))}
        compact={compact}
      />
      <OccurrenceForm
        selectedRow={selectedRow}
        draft={draft}
        mode={mode}
        onDraftChange={updateDraft}
        onHighlightPulseHover={onHighlightPulseHover}
        compact={compact}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
