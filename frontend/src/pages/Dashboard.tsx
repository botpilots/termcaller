import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Folder, Loader2 } from 'lucide-react';
import axios from 'axios';
import { DashboardHeader } from '../components/DashboardHeader';
import { type SimilarityResult } from '../components/SimilarityCluster';
import { BrowsePanel, ProgressBanner, BrowseSectionHeader, KeywordSortToggle, IndeterminateProgressBanner, type BrowseTab } from '../components/BrowsePanel';
import { OccurrencesEditor } from '../components/OccurrencesEditor';
import type { CalloutRow } from '../components/OccurrencesTable';
import { KeywordDocumentView } from '../components/KeywordDocumentView';
import {
  ValidationAnomalies,
  buildAnomalyMap,
  figureHasAnomalies,
  type FigureValidationResult,
} from '../components/ValidationAnomalies';
import {
  rankKeywords,
  type CorpusTermScore,
  type KeywordPriority,
  type KeywordSortMode,
} from '../utils/keywordPriority';
import { countFiguresForKeyword, groupCalloutsByFigure } from '../utils/figureOccurrences';

interface Concept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
}

interface Callout {
  id?: string;
  identifier: string;
  sourceTerm?: string;
  figureNumber?: string;
  pageNumber?: number;
  concept?: Concept;
}

interface Illustration {
  id: string;
  pageNumber: number;
  figureNumber?: string | null;
  callouts: Callout[];
}

interface Keyword {
  id: string;
  sourceTerm: string;
  concepts: Concept[];
  callouts?: Callout[];
  priority?: KeywordPriority;
}

interface Project {
  id: string;
  name: string;
  pdfPath?: string | null;
  pageCount?: number | null;
  keywords?: Keyword[];
  illustrations?: Illustration[];
}

function figureKey(pageNumber: number, figureNumber: string) {
  return `${pageNumber}:${figureNumber}`;
}

interface Progress {
  current: number;
  total: number;
  error?: boolean;
  skipped?: boolean;
}

type MainTab = 'callouts' | 'similarity';

function mapCalloutsToKeywords(data: Project): Project {
  if (!data.keywords || !data.illustrations) return data;

  data.keywords.forEach(kw => {
    kw.callouts = [];
    data.illustrations!.forEach(ill => {
      ill.callouts.forEach(callout => {
        if (callout.concept && kw.concepts.some(c => c.id === callout.concept!.id)) {
          kw.callouts!.push({
            ...callout,
            pageNumber: ill.pageNumber,
            figureNumber: ill.figureNumber ?? undefined,
          });
        }
      });
    });
  });

  return data;
}

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [figures, setFigures] = useState<Illustration[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [browseTab, setBrowseTab] = useState<BrowseTab>('keywords');
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedFigureId, setSelectedFigureId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('callouts');
  const [similarityResult, setSimilarityResult] = useState<SimilarityResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarityError, setSimilarityError] = useState<string | null>(null);
  const [figureValidations, setFigureValidations] = useState<Record<string, FigureValidationResult>>({});
  const [figureValidationErrors, setFigureValidationErrors] = useState<Record<string, string>>({});
  const [isValidatingAll, setIsValidatingAll] = useState(false);
  const [validationBatchError, setValidationBatchError] = useState<string | null>(null);
  const [corpusScores, setCorpusScores] = useState<Record<string, CorpusTermScore>>({});
  const [keywordSortMode, setKeywordSortMode] = useState<KeywordSortMode>('both');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const rankedKeywords = useMemo(
    () => rankKeywords(keywords, Object.keys(corpusScores).length ? corpusScores : null, keywordSortMode),
    [keywords, corpusScores, keywordSortMode]
  );

  const selectedKeyword = rankedKeywords.find(k => k.id === selectedKeywordId) ?? null;

  const selectedFigure = figures.find(f => f.id === selectedFigureId) ?? null;
  const selectedFigureKey = selectedFigure
    ? figureKey(selectedFigure.pageNumber, selectedFigure.figureNumber ?? '1')
    : null;
  const figureValidation =
    selectedFigureKey !== null ? (figureValidations[selectedFigureKey] ?? null) : null;
  const figureValidationError =
    selectedFigureKey !== null ? (figureValidationErrors[selectedFigureKey] ?? null) : null;

  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null;
  const hasPdf = Boolean(selectedProject?.pdfPath);
  const hasExistingData = keywords.length > 0 || figures.length > 0;

  const fetchKeywords = useCallback(async (projectId: string) => {
    const response = await axios.get(`/api/projects/${projectId}`);
    const data = mapCalloutsToKeywords(response.data);
    const nextKeywords = data.keywords ?? [];
    setKeywords(nextKeywords);
    // Keep pdfPath and pageCount in sync — project list may be stale after upload or page reload
    if (response.data.pdfPath || response.data.pageCount != null) {
      setProjects(prev =>
        prev.map(p =>
          p.id === projectId
            ? {
                ...p,
                ...(response.data.pdfPath ? { pdfPath: response.data.pdfPath } : {}),
                ...(response.data.pageCount != null ? { pageCount: response.data.pageCount } : {}),
              }
            : p
        )
      );
    }
    return nextKeywords;
  }, []);

  const fetchFigures = useCallback(async (projectId: string) => {
    const response = await axios.get(`/api/projects/${projectId}/figures`);
    setFigures(response.data);
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const projectsResponse = await axios.get('/api/projects');
        setProjects(projectsResponse.data);
        if (projectsResponse.data.length > 0) {
          setSelectedProjectId(projectsResponse.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch projects', error);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (!keywords.length) {
      setCorpusScores({});
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        const response = await axios.post<{ items: Array<CorpusTermScore & { id: string }> }>(
          '/api/corpus/prioritize',
          { items: keywords.map((k) => ({ id: k.id, term: k.sourceTerm })) }
        );
        const scores: Record<string, CorpusTermScore> = {};
        for (const item of response.data.items) {
          scores[item.id] = { corpusRarity: item.corpusRarity, inCorpus: item.inCorpus };
        }
        setCorpusScores(scores);
      } catch (error) {
        console.error('Failed to fetch corpus scores', error);
      }
    }, 200);

    return () => window.clearTimeout(handle);
  }, [keywords]);

  useEffect(() => {
    setBrowseTab('keywords');
    setSelectedKeywordId(null);
    setSelectedFigureId(null);
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
    setFigureValidations({});
    setFigureValidationErrors({});
    setValidationBatchError(null);
    setKeywords([]);
    setFigures([]);
  }, [selectedProjectId]);

  useEffect(() => {
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
  }, [selectedKeywordId]);

  useEffect(() => {
    const keywordList = rankedKeywords;
    if (browseTab !== 'keywords') return;
    if (!keywordList.length) {
      setSelectedKeywordId(null);
      return;
    }
    if (!selectedKeywordId || !keywordList.some(k => k.id === selectedKeywordId)) {
      setSelectedKeywordId(keywordList[0].id);
    }
  }, [rankedKeywords, selectedKeywordId, browseTab]);

  useEffect(() => {
    if (browseTab !== 'figures') return;
    if (!figures.length) {
      setSelectedFigureId(null);
      return;
    }
    if (selectedFigureId === null || !figures.some(f => f.id === selectedFigureId)) {
      setSelectedFigureId(figures[0].id);
    }
  }, [figures, selectedFigureId, browseTab]);

  useEffect(() => {
    if (!selectedProjectId) return;

    const setup = async () => {
      try {
        await Promise.all([fetchKeywords(selectedProjectId), fetchFigures(selectedProjectId)]);
      } catch (error) {
        console.error('Failed to fetch project data', error);
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = localStorage.getItem('token');
      const eventSource = new EventSource(`/api/projects/${selectedProjectId}/stream?token=${token}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('progress', e => {
        const data = JSON.parse(e.data);
        setProgress(data);
        setIsProcessing(data.current < data.total);
      });

      eventSource.addEventListener('keyword_extracted', e => {
        const data = JSON.parse(e.data);
        setKeywords(prev => {
          const newKeywords = [...prev];
          const existingKeywordIndex = newKeywords.findIndex(k => k.id === data.keyword.id);

          if (existingKeywordIndex >= 0) {
            const existingKeyword = newKeywords[existingKeywordIndex];
            if (!existingKeyword.concepts.some(c => c.id === data.concept.id)) {
              existingKeyword.concepts.push(data.concept);
            }
            if (!existingKeyword.callouts) existingKeyword.callouts = [];
            existingKeyword.callouts.push({ ...data.callout, concept: data.concept });
          } else {
            newKeywords.push({
              ...data.keyword,
              concepts: [data.concept],
              callouts: [{ ...data.callout, concept: data.concept }],
            });
          }

          newKeywords.sort(
            (a, b) =>
              countFiguresForKeyword(b.callouts) - countFiguresForKeyword(a.callouts) ||
              a.sourceTerm.localeCompare(b.sourceTerm)
          );
          return newKeywords;
        });
      });

      eventSource.addEventListener('complete', async () => {
        setIsProcessing(false);
        setProgress(null);
        try {
          await Promise.all([fetchKeywords(selectedProjectId), fetchFigures(selectedProjectId)]);
        } catch (error) {
          console.error('Failed to refresh project after processing', error);
        }
      });

      eventSource.addEventListener('error', e => {
        console.error('SSE Error:', e);
      });
    };

    setup();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [selectedProjectId, fetchKeywords, fetchFigures]);

  const handleBrowseTabChange = (tab: BrowseTab) => {
    setBrowseTab(tab);
    if (tab === 'keywords') {
      setSelectedFigureId(null);
    } else {
      setSelectedKeywordId(null);
      if (selectedProjectId) {
        fetchFigures(selectedProjectId).catch(console.error);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const response = await axios.post('/api/projects', { name: file.name });
      const projectId = response.data.id;

      const formData = new FormData();
      formData.append('file', file);

      await new Promise(resolve => setTimeout(resolve, 300));

      const uploadResponse = await axios.post(`/api/projects/${projectId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setProjects([
        {
          ...response.data,
          pdfPath: uploadResponse.data.pdfPath ?? 'uploaded',
          pageCount: uploadResponse.data.pageCount ?? null,
        },
        ...projects,
      ]);
      setSelectedProjectId(projectId);
    } catch (error) {
      console.error('Failed to create project from file', error);
    }
  };

  const handleExportTbx = async () => {
    if (!selectedProjectId || isExporting) return;

    setIsExporting(true);
    try {
      const response = await axios.get(`/api/projects/${selectedProjectId}/export/tbx`, {
        responseType: 'blob',
      });

      const disposition = response.headers['content-disposition'] as string | undefined;
      const filenameMatch = disposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? 'termbase.tbx';

      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export TBX', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId || isDeleting || isProcessing) return;

    const projectName = selectedProject?.name ?? 'this project';
    const confirmed = window.confirm(
      `Delete "${projectName}"? This permanently removes the PDF and all extracted keywords and figures.`
    );
    if (!confirmed) return;

    const deletedId = selectedProjectId;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsDeleting(true);
    try {
      await axios.delete(`/api/projects/${deletedId}`);

      const remaining = projects.filter(p => p.id !== deletedId);
      setProjects(remaining);
      setSelectedProjectId(remaining[0]?.id ?? null);
      setIsProcessing(false);
      setProgress(null);
    } catch (error) {
      console.error('Failed to delete project', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartExtraction = async () => {
    if (!selectedProjectId || isProcessing || !hasPdf) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: 1 });

    try {
      await axios.post(`/api/projects/${selectedProjectId}/extract`);
    } catch (error) {
      console.error('Failed to start extraction', error);
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleValidateAllFigures = async () => {
    if (!selectedProjectId || !hasPdf) return;

    setIsValidatingAll(true);
    setValidationBatchError(null);
    setFigureValidationErrors({});

    try {
      const response = await axios.post(`/api/projects/${selectedProjectId}/figures/validate-all`);
      const next: Record<string, FigureValidationResult> = {};
      const errors: Record<string, string> = {};
      for (const item of response.data.results) {
        const key = figureKey(item.pageNumber, item.figureNumber);
        if (item.validation) {
          next[key] = item.validation;
        }
        if (item.error) {
          errors[key] = item.error;
        }
      }
      setFigureValidations(next);
      setFigureValidationErrors(errors);
      await fetchFigures(selectedProjectId);

      if (response.data.failed > 0) {
        setValidationBatchError(
          `${response.data.failed} of ${response.data.total} figure(s) failed validation.`
        );
      }
    } catch (error) {
      console.error('Batch figure validation failed', error);
      setValidationBatchError(
        'Validation failed. Re-upload the PDF if this project predates PDF storage.'
      );
    } finally {
      setIsValidatingAll(false);
    }
  };

  const handleAnalyzeSimilarity = async () => {
    if (!selectedKeyword) return;

    setIsAnalyzing(true);
    setSimilarityError(null);

    try {
      const response = await axios.post(`/api/keywords/${selectedKeyword.id}/analyze-similarity`);
      setSimilarityResult(response.data);
    } catch (error) {
      console.error('Failed to analyse similarity', error);
      setSimilarityError('Failed to analyse similarities. Ensure concepts exist and try again.');
      setSimilarityResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const keywordRows: CalloutRow[] = useMemo(
    () =>
      groupCalloutsByFigure(
        selectedKeyword?.callouts ?? [],
        selectedKeyword?.concepts[0]?.definitionText
      ).map(row => ({
        ...row,
        sourceTerm: selectedKeyword?.sourceTerm,
      })),
    [selectedKeyword]
  );

  const figureRows: CalloutRow[] = useMemo(() => {
    if (!selectedFigure) return [];

    const anomalyMap = buildAnomalyMap(figureValidation);
    const rows: CalloutRow[] = selectedFigure.callouts.map(callout => ({
      identifier: callout.identifier,
      pageNumber: selectedFigure.pageNumber,
      sourceTerm: callout.concept?.candidateConceptName ?? callout.sourceTerm,
      definitionText: callout.concept?.definitionText,
      anomaly: anomalyMap.get(callout.identifier),
    }));

    if (figureValidation) {
      for (const id of figureValidation.unreferencedCallouts) {
        if (!rows.some(r => r.identifier === id)) {
          rows.push({
            identifier: id,
            pageNumber: selectedFigure.pageNumber,
            sourceTerm: undefined,
            definitionText: undefined,
            anomaly: 'Unreferenced',
          });
        }
      }
      for (const id of figureValidation.uncalledReferences) {
        if (!rows.some(r => r.identifier === id)) {
          rows.push({
            identifier: id,
            pageNumber: selectedFigure.pageNumber,
            sourceTerm: undefined,
            definitionText: undefined,
            anomaly: 'Uncalled ref.',
          });
        }
      }
    }

    return rows;
  }, [selectedFigure, figureValidation]);

  const listContent =
    browseTab === 'keywords' ? (
      <>
        <BrowseSectionHeader
          title="Keywords"
          actionLabel="Extract"
          actionTitle="Extract keywords from uploaded PDF"
          onAction={handleStartExtraction}
          isLoading={isProcessing}
          disabled={!hasPdf || !selectedProjectId}
          variant="blue"
          icon="extract"
          middle={
            keywords.length > 0 ? (
              <KeywordSortToggle value={keywordSortMode} onChange={setKeywordSortMode} />
            ) : undefined
          }
        />
        {!hasPdf && !hasExistingData ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Upload a PDF, then click Extract to begin.
          </div>
        ) : !hasPdf && hasExistingData ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Could not link a PDF to this project. Upload again using the header, or select a newer project.
          </div>
        ) : keywords.length === 0 && !isProcessing ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Click Extract to run keyword extraction.
          </div>
        ) : keywords.length === 0 && isProcessing ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Extracting keywords…
          </div>
        ) : (
          <ul className="space-y-1">
            {rankedKeywords.map(keyword => (
              <li key={keyword.id}>
                <button
                  type="button"
                  onClick={() => setSelectedKeywordId(keyword.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedKeywordId === keyword.id
                      ? 'bg-blue-100 text-blue-900 font-medium border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{keyword.sourceTerm}</span>
                    <span className="text-gray-400 font-normal shrink-0">
                      ({countFiguresForKeyword(keyword.callouts)})
                    </span>
                  </span>
                  {keyword.priority && (
                    <span className="block text-[10px] text-gray-400 font-normal mt-0.5">
                      rarity {(keyword.priority.corpusRarity * 100).toFixed(1)}%
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    ) : (
      <>
        <BrowseSectionHeader
          title="Figures"
          actionLabel="Validate"
          actionTitle="Validate referential integrity for all figures"
          onAction={handleValidateAllFigures}
          isLoading={isValidatingAll}
          disabled={!hasPdf || !selectedProjectId}
          variant="amber"
          icon="validate"
        />
        {validationBatchError && (
          <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            {validationBatchError}
          </div>
        )}
        {figures.length === 0 && isValidatingAll ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Discovering and validating figures…
          </div>
        ) : figures.length === 0 && !hasPdf ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Upload a PDF using the header to get started.
          </div>
        ) : figures.length === 0 && hasPdf ? (
          <div className="text-sm text-gray-500 text-center py-8">
            Click Validate to discover and check figures.
          </div>
        ) : figures.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-8">
            No identified figures in this project (no explicit figure numbers found).
          </div>
        ) : (
          <ul className="space-y-1">
            {figures.map(figure => {
              const key = figureKey(figure.pageNumber, figure.figureNumber ?? '1');
              const validation = figureValidations[key];
              const pageError = figureValidationErrors[key];
              const validated = validation !== undefined;
              const hasError = Boolean(pageError);
              const hasIssues = validated && figureHasAnomalies(validation);

              return (
              <li key={figure.id}>
                <button
                  type="button"
                  onClick={() => setSelectedFigureId(figure.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedFigureId === figure.id
                      ? 'bg-blue-100 text-blue-900 font-medium border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <span className="font-medium flex items-center gap-1.5">
                    Fig. {figure.figureNumber ?? '1'}
                    {(validated || hasError) && (
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          hasError ? 'bg-red-500' : hasIssues ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        title={
                          hasError
                            ? pageError
                            : hasIssues
                              ? 'Anomalies found'
                              : 'No anomalies'
                        }
                      />
                    )}
                  </span>
                  <span className="text-gray-400 font-normal block text-xs mt-0.5">
                    Page {figure.pageNumber} · {figure.callouts.length} callout
                    {figure.callouts.length !== 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            );
            })}
          </ul>
        )}
      </>
    );

  return (
    <div className="flex h-screen flex-col bg-white">
      <DashboardHeader
        projects={projects}
        selectedProjectId={selectedProjectId}
        selectedPageCount={selectedProject?.pageCount}
        onProjectChange={setSelectedProjectId}
        onFileUpload={handleFileUpload}
        onExportTbx={handleExportTbx}
        onDeleteProject={handleDeleteProject}
        isProcessing={isProcessing}
        isExporting={isExporting}
        isDeleting={isDeleting}
      />

      <div className="flex flex-1 overflow-hidden">
        <BrowsePanel
          activeTab={browseTab}
          onTabChange={handleBrowseTabChange}
          progressSlot={
            browseTab === 'keywords' && isProcessing && progress ? (
              <ProgressBanner current={progress.current} total={progress.total} compact label="Extracting..." />
            ) : browseTab === 'figures' && isValidatingAll ? (
              <IndeterminateProgressBanner compact label="Validating figures..." variant="amber" />
            ) : null
          }
          listContent={listContent}
          username={user?.username ?? ''}
          onLogout={logout}
        />

        <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden min-w-0">
          {selectedProjectId ? (
            browseTab === 'keywords' && selectedKeyword ? (
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                {isProcessing && progress && !keywords.length && (
                  <div className="mb-4 max-w-5xl mx-auto w-full">
                    <ProgressBanner current={progress.current} total={progress.total} label="Extracting keywords..." />
                  </div>
                )}
                <KeywordDocumentView
                  projectId={selectedProjectId}
                  keywordId={selectedKeyword.id}
                  pageCount={selectedProject?.pageCount}
                  sourceTerm={selectedKeyword.sourceTerm}
                  conceptCount={selectedKeyword.concepts.length}
                  keywordRows={keywordRows}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  similarityResult={similarityResult}
                  similarityError={similarityError}
                  isAnalyzing={isAnalyzing}
                  onAnalyzeSimilarity={handleAnalyzeSimilarity}
                  onOccurrenceSaved={keywordId => {
                    void fetchKeywords(selectedProjectId).then(() => {
                      setSelectedKeywordId(keywordId);
                    });
                  }}
                  onOccurrenceDeleted={result => {
                    void fetchKeywords(selectedProjectId).then(freshKeywords => {
                      if (result.keywordDeleted || !result.keywordId) {
                        setSelectedKeywordId(freshKeywords[0]?.id ?? null);
                        return;
                      }
                      setSelectedKeywordId(result.keywordId);
                    });
                  }}
                />
              </div>
            ) : (
            <div className="flex-1 p-8 flex flex-col max-w-5xl mx-auto w-full overflow-y-auto">
              <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
                {isProcessing && progress && !keywords.length && browseTab === 'keywords' && (
                  <div className="mb-8">
                    <ProgressBanner current={progress.current} total={progress.total} label="Extracting keywords..." />
                  </div>
                )}

                {browseTab === 'figures' && selectedFigure ? (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Figure {selectedFigure.figureNumber ?? '1'}
                      </h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Page {selectedFigure.pageNumber} · {selectedFigure.callouts.length} callout
                        {selectedFigure.callouts.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <ValidationAnomalies
                      validation={figureValidation}
                      isLoading={isValidatingAll}
                      error={figureValidationError}
                      pendingMessage={
                        !figureValidation && !figureValidationError && !isValidatingAll
                          ? 'Click Validate in the Figures sidebar to discover and check referential integrity.'
                          : undefined
                      }
                    />

                    <h4 className="text-sm font-medium text-gray-700 mb-3">Occurrences</h4>
                    <OccurrencesEditor
                      rows={figureRows}
                      mode="figure"
                      emptyMessage="No callouts on this figure."
                    />
                  </div>
                ) : !hasPdf && !hasExistingData ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Upload a PDF using the header to get started.
                  </div>
                ) : browseTab === 'keywords' && keywords.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    {hasPdf
                      ? 'Click Extract in the Keywords sidebar to run extraction.'
                      : 'Re-upload the PDF, then click Extract in the Keywords sidebar.'}
                  </div>
                ) : browseTab === 'figures' && figures.length === 0 && isValidatingAll ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Discovering and validating figures…
                  </div>
                ) : browseTab === 'figures' && figures.length === 0 && !hasPdf ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Upload a PDF using the header to get started.
                  </div>
                ) : browseTab === 'figures' && figures.length === 0 && hasPdf ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Click Validate in the Figures sidebar to discover and check figures.
                  </div>
                ) : browseTab === 'figures' && figures.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    No identified figures in this project (no explicit figure numbers found).
                  </div>
                ) : browseTab === 'keywords' ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Select a keyword from the list to view its occurrences.
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Select a figure from the list to view occurrences and validation results.
                  </div>
                )}
              </div>
            </div>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Folder className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p>Select a project or upload a new PDF using the header to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
