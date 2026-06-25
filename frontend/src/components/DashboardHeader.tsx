import React from 'react';
import { Plus, Download } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface DashboardHeaderProps {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectChange: (projectId: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  projects,
  selectedProjectId,
  onProjectChange,
  onFileUpload,
  isProcessing,
}) => {
  return (
    <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 shrink-0">Termcaller</h1>

          <select
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 min-w-[12rem] max-w-xs"
            value={selectedProjectId || ''}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="" disabled>
              Select a project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {!isProcessing && (
            <label className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200 shrink-0">
              <Plus className="mr-2" size={18} />
              Upload PDF
              <input type="file" accept=".pdf" className="hidden" onChange={onFileUpload} />
            </label>
          )}
        </div>

        <button
          type="button"
          disabled
          title="TBX export is not implemented yet"
          className="flex items-center px-4 py-2 bg-white text-gray-400 border border-gray-200 text-sm font-medium rounded-lg cursor-not-allowed shrink-0"
        >
          <Download className="mr-2" size={18} />
          Export TBX
        </button>
      </div>
    </header>
  );
};
