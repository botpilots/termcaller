import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { DocumentPreview, type DocumentPreviewHandle } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import {
  KeywordCurationPanel,
  type KeywordCurationState,
} from './KeywordCurationPanel';
import type { HighlightBox, TermDocumentMatch, TermDocumentMatchesResult } from '../types/documentPreview';

interface KeywordDocumentViewProps {
  projectId: string;
  keywordId: string;
  pageCount: number | null | undefined;
  sourceTerm: string;
  figureCount: number;
}

function pickInitialMatchIndex(matches: TermDocumentMatch[], hintPages: number[]): number {
  if (matches.length === 0) return 0;
  if (hintPages.length === 0) return 0;

  for (const page of hintPages) {
    const index = matches.findIndex(match => match.pageNumber === page);
    if (index >= 0) return index;
  }

  const referencePage = hintPages[0]!;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < matches.length; index++) {
    const distance = Math.abs(matches[index]!.pageNumber - referencePage);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function matchesToHighlightsByPage(
  matches: TermDocumentMatch[],
  activeMatchIndex: number | null
): Record<number, HighlightBox[]> {
  const byPage: Record<number, HighlightBox[]> = {};

  matches.forEach((match, index) => {
    const isActive = activeMatchIndex === index;
    for (const box of match.boxes) {
      const entry: HighlightBox = {
        ...box,
        pageNumber: match.pageNumber,
        matchType: 'term',
      };
      if (!byPage[match.pageNumber]) {
        byPage[match.pageNumber] = [];
      }
      byPage[match.pageNumber]!.push(entry);
      // Dim non-active matches via opacity handled in overlay later - for now show all
      void isActive;
    }
  });

  return byPage;
}

export function KeywordDocumentView({
  projectId,
  keywordId,
  pageCount,
  sourceTerm,
  figureCount,
}: KeywordDocumentViewProps) {
  const [curationState, setCurationState] = useState<KeywordCurationState | null>(null);
  const [isLoadingCuration, setIsLoadingCuration] = useState(true);
  const [curationLoadError, setCurationLoadError] = useState<string | null>(null);

  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [documentMatches, setDocumentMatches] = useState<TermDocumentMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);
  const [locateStatus, setLocateStatus] = useState<'idle' | 'loading' | 'hit' | 'miss'>('idle');
  const [locateHint, setLocateHint] = useState<string | null>(null);
  const [autoPulsePage, setAutoPulsePage] = useState<number | null>(null);
  const [autoPulseGeneration, setAutoPulseGeneration] = useState(0);
  const scrollSettledPageRef = useRef<number | null>(null);
  const locateReadyPageRef = useRef<number | null>(null);
  const pulseGenerationRef = useRef(0);
  const autoPulseConsumedRef = useRef(false);
  const previewRef = useRef<DocumentPreviewHandle>(null);

  const triggerAutoPulse = useCallback((pageNumber: number) => {
    pulseGenerationRef.current += 1;
    setAutoPulsePage(pageNumber);
    setAutoPulseGeneration(pulseGenerationRef.current);
  }, []);

  const maybeStartAutoPulse = useCallback(
    (pageNumber: number) => {
      if (autoPulseConsumedRef.current) return;
      if (locateReadyPageRef.current !== pageNumber) return;

      const scrollReady =
        scrollSettledPageRef.current === pageNumber ||
        previewRef.current?.getViewportCenterPage() === pageNumber;
      if (!scrollReady) return;

      autoPulseConsumedRef.current = true;
      triggerAutoPulse(pageNumber);
    },
    [triggerAutoPulse]
  );

  const handleScrollSettled = useCallback(
    (pageNumber: number) => {
      scrollSettledPageRef.current = pageNumber;
      maybeStartAutoPulse(pageNumber);
    },
    [maybeStartAutoPulse]
  );

  const fetchCurationState = useCallback(async () => {
    setIsLoadingCuration(true);
    setCurationLoadError(null);

    try {
      const response = await axios.get<KeywordCurationState>(
        `/api/keywords/${keywordId}/curation`
      );
      setCurationState(response.data);
      return response.data;
    } catch {
      setCurationLoadError('Failed to load keyword curation state.');
      setCurationState(null);
      return null;
    } finally {
      setIsLoadingCuration(false);
    }
  }, [keywordId]);

  useEffect(() => {
    void fetchCurationState();
  }, [fetchCurationState]);

  const hintPages = useMemo(() => {
    const pages = new Set<number>();
    for (const figure of curationState?.concept?.figures ?? []) {
      pages.add(figure.pageNumber);
    }
    return [...pages].sort((a, b) => a - b);
  }, [curationState]);

  const locateAllTermMatches = useCallback(
    async (term: string, pages: number[]) => {
      setLocateStatus('loading');
      setLocateHint(null);
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setDocumentMatches([]);
      setActiveMatchIndex(null);

      try {
        const response = await axios.get<TermDocumentMatchesResult>(
          `/api/projects/${projectId}/term-matches`,
          { params: { term } }
        );

        const matches = response.data.matches ?? [];
        setDocumentMatches(matches);

        if (matches.length > 0) {
          const initialIndex = pickInitialMatchIndex(matches, pages);
          const initialMatch = matches[initialIndex]!;
          setActiveMatchIndex(initialIndex);
          setLocateStatus('hit');
          locateReadyPageRef.current = initialMatch.pageNumber;
          setFocusedPage(initialMatch.pageNumber);
          setLocateHint(`${matches.length} match${matches.length !== 1 ? 'es' : ''} in document`);
          return;
        }

        setLocateStatus('miss');
        if (pages.length > 0) {
          setFocusedPage(pages[0]!);
          setLocateHint('Term not found in PDF text layer');
        }
      } catch {
        setLocateStatus('miss');
        setLocateHint('Failed to search document');
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!sourceTerm.trim()) return;
    void locateAllTermMatches(sourceTerm, hintPages);
  }, [sourceTerm, hintPages, locateAllTermMatches]);

  useEffect(() => {
    const page = locateReadyPageRef.current;
    if (page == null) return;
    maybeStartAutoPulse(page);
  }, [documentMatches, activeMatchIndex, maybeStartAutoPulse]);

  const highlightsByPage = useMemo(
    () => matchesToHighlightsByPage(documentMatches, activeMatchIndex),
    [documentMatches, activeMatchIndex]
  );

  const goToMatch = useCallback(
    (index: number) => {
      const match = documentMatches[index];
      if (!match) return;

      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setActiveMatchIndex(index);
      locateReadyPageRef.current = match.pageNumber;
      setFocusedPage(match.pageNumber);
      setLocateHint(
        `Match ${index + 1} of ${documentMatches.length} · page ${match.pageNumber}`
      );
    },
    [documentMatches]
  );

  const handlePrevMatch = useCallback(() => {
    if (documentMatches.length === 0 || activeMatchIndex === null) return;
    const nextIndex = (activeMatchIndex - 1 + documentMatches.length) % documentMatches.length;
    goToMatch(nextIndex);
  }, [activeMatchIndex, documentMatches.length, goToMatch]);

  const handleNextMatch = useCallback(() => {
    if (documentMatches.length === 0 || activeMatchIndex === null) return;
    const nextIndex = (activeMatchIndex + 1) % documentMatches.length;
    goToMatch(nextIndex);
  }, [activeMatchIndex, documentMatches.length, goToMatch]);

  const occurrencePages = useMemo(() => {
    const pages = new Set<number>();
    for (const match of documentMatches) {
      pages.add(match.pageNumber);
    }
    for (const figure of curationState?.concept?.figures ?? []) {
      pages.add(figure.pageNumber);
    }
    for (const warning of curationState?.definitionWarnings ?? []) {
      pages.add(warning.pageNumber);
    }
    return [...pages].sort((a, b) => a - b);
  }, [curationState, documentMatches]);

  const handleWarningClick = useCallback(
    (warning: KeywordCurationState['definitionWarnings'][number]) => {
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setLocateHint(null);
      setFocusedPage(warning.pageNumber);

      const matchOnPage = documentMatches.findIndex(
        match => match.pageNumber === warning.pageNumber
      );
      if (matchOnPage >= 0) {
        goToMatch(matchOnPage);
      } else {
        setLocateHint(`No text-layer match on page ${warning.pageNumber}`);
      }
    },
    [documentMatches, goToMatch]
  );

  const previewEnabled = pageCount != null && pageCount > 0;

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${previewEnabled ? '' : 'max-w-5xl mx-auto w-full'}`}>
      <div
        className={`flex flex-col min-h-0 min-w-0 bg-white overflow-hidden ${
          previewEnabled
            ? 'flex-1 border-r border-gray-200'
            : 'flex-1 rounded-xl shadow-sm border border-gray-200'
        }`}
      >
        <div className={`border-b border-gray-100 shrink-0 ${previewEnabled ? 'p-4' : 'p-8 pb-4'}`}>
          <h3 className="text-lg font-semibold text-gray-900">{sourceTerm}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {figureCount} figure{figureCount !== 1 ? 's' : ''}
          </p>
        </div>

        <KeywordCurationPanel
          sourceTerm={sourceTerm}
          state={curationState}
          isLoading={isLoadingCuration}
          loadError={curationLoadError}
          onWarningClick={handleWarningClick}
          compact={previewEnabled}
        />
      </div>

      <DocumentPreviewSidebar enabled={previewEnabled}>
        <DocumentPreview
          ref={previewRef}
          projectId={projectId}
          pageCount={pageCount!}
          occurrencePages={occurrencePages}
          focusedPage={focusedPage}
          highlightsByPage={highlightsByPage}
          locateStatus={locateStatus}
          locateHint={locateHint}
          hoverPulsePage={null}
          autoPulsePage={autoPulsePage}
          autoPulseGeneration={autoPulseGeneration}
          matchIndex={activeMatchIndex}
          matchCount={documentMatches.length}
          onPrevMatch={documentMatches.length > 1 ? handlePrevMatch : undefined}
          onNextMatch={documentMatches.length > 1 ? handleNextMatch : undefined}
          onScrollSettled={handleScrollSettled}
          onFocusedPageChange={pageNumber => {
            setFocusedPage(pageNumber);
          }}
        />
      </DocumentPreviewSidebar>
    </div>
  );
}
