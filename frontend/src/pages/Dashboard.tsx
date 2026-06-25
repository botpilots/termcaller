import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Folder, Plus, LogOut, FileText, Download } from 'lucide-react';
import axios from 'axios';

interface Concept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
}

interface Keyword {
  id: string;
  sourceTerm: string;
  concepts: Concept[];
}

interface Project {
  id: string;
  name: string;
  keywords?: Keyword[];
}

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);

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
          setSelectedProjectDetails(response.data);
        } catch (error) {
          console.error('Failed to fetch project details', error);
        }
      };
      fetchProjectDetails();
    } else {
      setSelectedProjectDetails(null);
    }
  }, [selectedProjectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Create a project named after the uploaded file
      const response = await axios.post('/api/projects', { name: file.name });
      setProjects([response.data, ...projects]);
      setSelectedProjectId(response.data.id);
      
      // TODO: Actually upload the file contents to the backend here
      // const formData = new FormData();
      // formData.append('file', file);
      // await axios.post(`/api/projects/${response.data.id}/upload`, formData);
      
    } catch (error) {
      console.error('Failed to create project from file', error);
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
          
          {selectedProjectDetails?.keywords?.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              No keywords extracted yet. Upload a PDF to begin.
            </div>
          ) : (
            <div className="space-y-4">
              {selectedProjectDetails?.keywords?.map(keyword => (
                <div key={keyword.id} className="bg-white rounded-md border border-gray-200 shadow-sm p-3">
                  <h3 className="font-semibold text-gray-900 mb-2">{keyword.sourceTerm}</h3>
                  <div className="space-y-2">
                    {keyword.concepts.map(concept => (
                      <div key={concept.id} className="text-sm bg-gray-50 p-2 rounded border border-gray-100">
                        <p className="font-medium text-blue-700">{concept.candidateConceptName}</p>
                        <p className="text-gray-600 mt-1">{concept.definitionText}</p>
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
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedProjectId ? (
          <div className="flex-1 p-8 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
            <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <FileText className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedProjectDetails?.name}</h2>
              <p className="text-gray-500 mb-8 max-w-lg mx-auto">
                Upload a PDF technical document. Termcaller will automatically parse the illustrations, extract terminology candidates, and group them into structural concepts.
              </p>
              
              <div className="flex justify-center space-x-4">
                <label className="flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors cursor-pointer">
                  <Plus className="mr-2" size={20} />
                  Upload PDF Document
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
                <button className="flex items-center px-6 py-3 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                  <Download className="mr-2" size={20} />
                  Export TBX Basic
                </button>
              </div>
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
