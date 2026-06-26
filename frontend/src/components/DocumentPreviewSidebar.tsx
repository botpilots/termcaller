import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

const STORAGE_WIDTH_KEY = 'termcaller-preview-sidebar-width';
const STORAGE_MINIMIZED_KEY = 'termcaller-preview-sidebar-minimized';

const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 280;
const MAX_WIDTH_RATIO = 0.72;
const COLLAPSED_RAIL_WIDTH = 36;

function readStoredWidth(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_WIDTH_KEY);
    const n = raw ? Number(raw) : DEFAULT_WIDTH;
    return Number.isFinite(n) ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function readStoredMinimized(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_MINIMIZED_KEY) === '1';
  } catch {
    return false;
  }
}

interface DocumentPreviewSidebarProps {
  children: ReactNode;
  enabled: boolean;
}

export function DocumentPreviewSidebar({ children, enabled }: DocumentPreviewSidebarProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const [minimized, setMinimized] = useState(readStoredMinimized);
  const widthBeforeMinimize = useRef(width);
  const dragging = useRef(false);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_MINIMIZED_KEY, minimized ? '1' : '0');
  }, [minimized]);

  const clampWidth = useCallback((next: number) => {
    const max = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * MAX_WIDTH_RATIO));
    return Math.min(max, Math.max(MIN_WIDTH, next));
  }, []);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragging.current = true;
      const startX = event.clientX;
      const startWidth = minimized ? widthBeforeMinimize.current : width;

      const onMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startX - moveEvent.clientX;
        const next = clampWidth(startWidth + delta);
        setWidth(next);
        if (minimized) setMinimized(false);
      };

      const onUp = () => {
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [clampWidth, minimized, width]
  );

  const minimize = () => {
    widthBeforeMinimize.current = width;
    setMinimized(true);
  };

  const expand = () => {
    setWidth(clampWidth(widthBeforeMinimize.current || DEFAULT_WIDTH));
    setMinimized(false);
  };

  if (!enabled) {
    return null;
  }

  if (minimized) {
    return (
      <div
        className="shrink-0 flex flex-col items-center border-l border-gray-200 bg-gray-50"
        style={{ width: COLLAPSED_RAIL_WIDTH }}
      >
        <button
          type="button"
          onClick={expand}
          title="Show document preview"
          className="mt-3 p-2 rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
        >
          <PanelRightOpen size={18} />
        </button>
        <span
          className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          Pages
        </span>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 flex min-h-0 relative border-l border-gray-200 bg-gray-50"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize document preview"
        onMouseDown={startResize}
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-[3px] z-20 cursor-col-resize group"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
      </div>

      <div className="flex flex-col flex-1 min-w-0 min-h-0 pl-1">
        <div className="shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 border-b border-gray-200 bg-white">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Document</span>
          <button
            type="button"
            onClick={minimize}
            title="Minimize preview"
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0 p-2">{children}</div>
      </div>
    </div>
  );
}
