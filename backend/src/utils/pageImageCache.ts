import fs from 'fs';
import path from 'path';
import { PDF_RENDER_FORMAT } from '../constants/pdfProcessing.js';

const imageExt = PDF_RENDER_FORMAT.toLowerCase();
const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

export function pageCacheDir(projectId: string): string {
  return path.join(UPLOADS_ROOT, 'page-cache', projectId);
}

export function pageCachePath(projectId: string, pageNumber: number): string {
  return path.join(pageCacheDir(projectId), `page_${pageNumber}.${imageExt}`);
}

export function ensurePageCacheDir(projectId: string): string {
  const dir = pageCacheDir(projectId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
