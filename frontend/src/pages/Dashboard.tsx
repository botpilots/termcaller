import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Folder, Plus, LogOut, FileText, Download, Loader2 } from 'lucide-react';
import axios from 'axios';

interface Concept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
}

interface Callout {
  identifier: string;
  figureNumber?: string;
  pageNumber: number;
  concept?: Concept;
}

interface Keyword {
  id: string;
  sourceTerm: string;
  concepts: Concept[];
  callouts?: Callout[];
}

interface Project {
  id: string;
  name: string;
  keywords?: Keyword[];
  illustrations?: {
    pageNumber: number;
    figureNumber?: string;
    callouts: Callout[];
  }[];
}

interface Progress {
  current: number;
  total: number;
  error?: boolean;
  skipped?: boolean;
}

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch Projects on load
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get('/api/projects');
        setProjects(response.data);
        if (response.data.length > 0) {
          setSelectedProjectId(response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch projects', error);
      }
    };
    fetchProjects();
  }, []);

  // Fetch specific project details when selected
  useEffect(() => {
    if (selectedProjectId) {
      const fetchProjectDetails = async () => {
        try {
          const response = await axios.get(`/api/projects/${selectedProjectId}`);
          const data = response.data;
          
          // Map illustrations.callouts to keywords
          if (data.keywords && data.illustrations) {
            data.keywords.forEach((kw: any) => {
              kw.callouts = [];
              data.illustrations.forEach((ill: any) => {
                ill.callouts.forEach((callout: any) => {
                  if (callout.concept && kw.concepts.some((c: any) => c.id === callout.concept.id)) {
                    kw.callouts.push({
                      ...callout,
                      pageNumber: ill.pageNumber,
                      figureNumber: ill.figureNumber
                    });
                  }
                });
              });
            });
          }
          
          setSelectedProjectDetails(data);
        } catch (error) {
          console.error('Failed to fetch project details', error);
        }
      };
      fetchProjectDetails();

      // Setup SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = localStorage.getItem('token');
      const eventSource = new EventSource(`/api/projects/${selectedProjectId}/stream?token=${token}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        setProgress(data);
        if (data.current === data.total) {
          setIsProcessing(false);
        } else {
          setIsProcessing(true);
        }
      });

      eventSource.addEventListener('keyword_extracted', (e) => {
        const data = JSON.parse(e.data);
        setSelectedProjectDetails(prev => {
          if (!prev) return prev;
          
          const newKeywords = [...(prev.keywords || [])];
          const existingKeywordIndex = newKeywords.findIndex(k => k.id === data.keyword.id);
          
          if (existingKeywordIndex >= 0) {
            const existingKeyword = newKeywords[existingKeywordIndex];
            const conceptExists = existingKeyword.concepts.some(c => c.id === data.concept.id);
            if (!conceptExists) {
              existingKeyword.concepts.push(data.concept);
            }
            if (!existingKeyword.callouts) existingKeyword.callouts = [];
            existingKeyword.callouts.push(data.callout);
          } else {
            newKeywords.push({
              ...data.keyword,
              concepts: [data.concept],
              callouts: [data.callout]
            });
          }
          
          // Sort A-Z
          newKeywords.sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm));
          
          return { ...prev, keywords: newKeywords };
        });
      });

      eventSource.addEventListener('complete', () => {
        setIsProcessing(false);
        setProgress(null);
      });

      eventSource.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
      });

    } else {
      setSelectedProjectDetails(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [selectedProjectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Create a project named after the uploaded file
      const response = await axios.post('/api/projects', { name: file.name });
      setProjects([response.data, ...projects]);
      setSelectedProjectId(response.data.id);
      
      const formData = new FormData();
      formData.append('file', file);
      
      setIsProcessing(true);
      setProgress({ current: 0, total: 1 }); // Temporary until real progress comes

      await axios.post(`/api/projects/${response.data.id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
    } catch (error) {
      console.error('Failed to create project from file', error);
      setIsProcessing(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Sidebar Header: Project Selector */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">Termcaller</h1>
          </div>
          
          <div className="flex space-x-2">
            <select
              className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
              value={selectedProjectId || ''}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="" disabled>Select a project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sidebar Content: Keywords */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Extracted Keywords
          </h2>
          
          {selectedProjectDetails?.keywords?.length === 0 && !isProcessing ? (
            <div className="text-sm text-gray-500 text-center py-8">
              No keywords extracted yet. Upload a PDF to begin.
            </div>
          ) : (
            <div className="space-y-4">
              {selectedProjectDetails?.keywords?.map(keyword => (
                <div key={keyword.id} className="bg-white rounded-md border border-gray-200 shadow-sm p-3">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {keyword.sourceTerm} <span className="text-gray-400 font-normal text-sm">({keyword.callouts?.length || 0})</span>
                  </h3>
                  <div className="space-y-2">
                    {keyword.concepts.map(concept => (
                      <div key={concept.id} className="text-sm bg-gray-50 p-2 rounded border border-gray-100">
                        <p className="font-medium text-blue-700">{concept.candidateConceptName}</p>
                        <p className="text-gray-600 mt-1 line-clamp-2" title={concept.definitionText}>{concept.definitionText}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center">
          <div className="text-sm font-medium text-gray-700">{user?.username}</div>
          <button onClick={logout} className="text-gray-500 hover:text-red-600 p-1">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {selectedProjectId ? (
          <div className="flex-1 p-8 flex flex-col max-w-5xl mx-auto w-full overflow-y-auto">
            <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedProjectDetails?.name}</h2>
                  <p className="text-gray-500 text-sm mt-1">Project Details</p>
                </div>
                <div className="flex space-x-3">
                  {!isProcessing && (
                    <label className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 font-medium rounded-lg hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200">
                      <Plus className="mr-2" size={18} />
                      Upload PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  )}
                  <button className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                    <Download className="mr-2" size={18} />
                    Export TBX
                  </button>
                </div>
              </div>

              {isProcessing && progress && (
                <div className="mb-8 bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center text-blue-800 font-medium">
                      <Loader2 className="animate-spin mr-2" size={18} />
                      Processing Document...
                    </div>
                    <div className="text-sm text-blue-600 font-medium">
                      {progress.current} / {progress.total} pages
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {selectedProjectDetails?.keywords && selectedProjectDetails.keywords.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Extracted Concepts</h3>
                    <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors">
                      Analyse Similarities
                    </button>
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Figure</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Callout</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Term</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Concept / Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedProjectDetails.keywords.flatMap(kw => 
                          (kw.callouts || []).map((callout, idx) => {
                            const concept = kw.concepts.find(c => c.id === callout.concept?.id) || kw.concepts[0];
                            return (
                              <tr key={`${kw.id}-${idx}`} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{callout.pageNumber}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{callout.figureNumber || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{callout.identifier}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{kw.sourceTerm}</td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                  <div className="font-medium text-gray-900">{concept?.candidateConceptName}</div>
                                  <div className="text-gray-500 truncate max-w-md" title={concept?.definitionText}>{concept?.definitionText}</div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Folder className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="mb-4">Select a project or upload a new PDF to get started</p>
              <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors cursor-pointer">
                <Plus className="mr-2" size={18} />
                Upload PDF Document
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
