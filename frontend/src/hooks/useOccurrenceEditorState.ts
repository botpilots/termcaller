import { useEffect, useMemo, useState } from 'react';
import type { CalloutRow } from '../components/OccurrencesTable';
import type { OccurrenceDraftFields } from '../components/OccurrenceForm';
import { occurrenceEditorKey } from '../utils/figureOccurrences';

function draftFromRow(row: CalloutRow): OccurrenceDraftFields {
  return {
    identifier: row.identifier ?? '',
    definitionText: row.definitionText ?? '',
    sourceTerm: row.sourceTerm ?? '',
  };
}

export function useOccurrenceEditorState(
  rows: CalloutRow[],
  mode: 'keyword' | 'figure',
  selectedKey?: string | null
) {
  const [drafts, setDrafts] = useState<Record<string, OccurrenceDraftFields>>({});

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
  }, [sorted, mode]);

  useEffect(() => {
    setDrafts({});
  }, [rows]);

  const draft = activeKey
    ? (drafts[activeKey] ?? (selectedRow ? draftFromRow(selectedRow) : null))
    : null;

  const updateDraft = (patch: Partial<OccurrenceDraftFields>) => {
    if (!activeKey) return;
    setDrafts(prev => ({
      ...prev,
      [activeKey]: { ...prev[activeKey]!, ...patch },
    }));
  };

  const selectRow = (row: CalloutRow) => {
    const key = occurrenceEditorKey(row, mode);
    if (!isControlled) {
      setInternalKey(key);
    }
    return row;
  };

  return {
    sorted,
    activeKey,
    selectedRow,
    draft,
    updateDraft,
    selectRow,
  };
}
