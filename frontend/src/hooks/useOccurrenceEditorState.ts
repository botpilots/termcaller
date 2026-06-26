import { useEffect, useMemo, useState } from 'react';
import type { CalloutRow } from '../components/OccurrencesTable';
import type { OccurrenceDraftFields } from '../components/OccurrenceForm';
import { occurrenceEditorKey } from '../utils/figureOccurrences';

function draftFromRow(row: CalloutRow, defaultSourceTerm?: string): OccurrenceDraftFields {
  return {
    identifier: row.identifier ?? '',
    definitionText: row.definitionText ?? '',
    sourceTerm: row.sourceTerm ?? defaultSourceTerm ?? '',
  };
}

function buildDraftMap(
  sorted: CalloutRow[],
  mode: 'keyword' | 'figure',
  defaultSourceTerm?: string
): Record<string, OccurrenceDraftFields> {
  const next: Record<string, OccurrenceDraftFields> = {};
  for (const row of sorted) {
    const key = occurrenceEditorKey(row, mode);
    next[key] = draftFromRow(row, defaultSourceTerm);
  }
  return next;
}

export function useOccurrenceEditorState(
  rows: CalloutRow[],
  mode: 'keyword' | 'figure',
  selectedKey?: string | null,
  defaultSourceTerm?: string
) {
  const [drafts, setDrafts] = useState<Record<string, OccurrenceDraftFields>>({});
  const [originalDrafts, setOriginalDrafts] = useState<Record<string, OccurrenceDraftFields>>({});

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
    const baseline = buildDraftMap(sorted, mode, defaultSourceTerm);
    setOriginalDrafts(baseline);
    setDrafts(baseline);
  }, [rows, mode, defaultSourceTerm, sorted]);

  const draft = activeKey
    ? (drafts[activeKey] ?? (selectedRow ? draftFromRow(selectedRow, defaultSourceTerm) : null))
    : null;

  const originalDraft = activeKey ? originalDrafts[activeKey] : null;

  const updateDraft = (patch: Partial<OccurrenceDraftFields>) => {
    if (!activeKey) return;
    setDrafts(prev => ({
      ...prev,
      [activeKey]: { ...(prev[activeKey] ?? draftFromRow(selectedRow!, defaultSourceTerm)), ...patch },
    }));
  };

  const selectRow = (row: CalloutRow) => {
    const key = occurrenceEditorKey(row, mode);
    if (!isControlled) {
      setInternalKey(key);
    }
    return row;
  };

  const isTermChanged = (key: string = activeKey ?? ''): boolean => {
    if (!key) return false;
    const current = drafts[key];
    const original = originalDrafts[key];
    if (!current || !original) return false;
    return current.sourceTerm.trim() !== original.sourceTerm.trim();
  };

  const markDraftSaved = (key: string = activeKey ?? '') => {
    if (!key || !drafts[key]) return;
    setOriginalDrafts(prev => ({
      ...prev,
      [key]: { ...drafts[key]! },
    }));
  };

  return {
    sorted,
    activeKey,
    selectedRow,
    draft,
    originalDraft,
    updateDraft,
    selectRow,
    isTermChanged,
    markDraftSaved,
  };
}
