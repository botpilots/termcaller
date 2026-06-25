import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { CorpusTextMethod } from './corpusSourceText.js';
import { ocrSidecarPath } from './corpusSourceText.js';

export interface SourceChecksums {
  checksum: string;
  sidecarChecksum: string | null;
}

export interface ManifestSourceEntry {
  checksum: string;
  sidecarChecksum: string | null;
  method: CorpusTextMethod;
  tokenCount: number;
  uniqueCount: number;
  pages?: number;
  charsPerPage?: number;
  lowYield?: boolean;
}

export interface BuildManifest {
  version: 1;
  sources: Record<string, ManifestSourceEntry>;
}

export function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function sourceChecksums(
  sourcePath: string,
  type: 'pdf' | 'txt' | 'ocr-sidecar'
): SourceChecksums {
  if (type === 'ocr-sidecar') {
    return { checksum: sha256File(sourcePath), sidecarChecksum: null };
  }

  const checksum = sha256File(sourcePath);
  if (type !== 'pdf') {
    return { checksum, sidecarChecksum: null };
  }

  const sidecar = ocrSidecarPath(sourcePath);
  return {
    checksum,
    sidecarChecksum: fs.existsSync(sidecar) ? sha256File(sidecar) : null,
  };
}

export function checksumsMatch(entry: ManifestSourceEntry, current: SourceChecksums): boolean {
  return entry.checksum === current.checksum && entry.sidecarChecksum === current.sidecarChecksum;
}

export function loadManifest(manifestPath: string): BuildManifest {
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, sources: {} };
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BuildManifest;
}

export function saveManifest(manifestPath: string, manifest: BuildManifest): void {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export function cachePathFor(cacheDir: string, sourceId: string): string {
  return path.join(cacheDir, `${sourceId}.tokens.txt`);
}

export function readCachedTokens(cacheDir: string, sourceId: string): string[] | null {
  const cachePath = cachePathFor(cacheDir, sourceId);
  if (!fs.existsSync(cachePath)) return null;
  const raw = fs.readFileSync(cachePath, 'utf8').trim();
  return raw.length > 0 ? raw.split(' ') : [];
}

export function writeCachedTokens(cacheDir: string, sourceId: string, tokens: string[]): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cachePathFor(cacheDir, sourceId), tokens.join(' '), 'utf8');
}

export function pruneStaleCache(cacheDir: string, activeSourceIds: Set<string>): void {
  if (!fs.existsSync(cacheDir)) return;
  for (const name of fs.readdirSync(cacheDir)) {
    if (!name.endsWith('.tokens.txt')) continue;
    const id = name.slice(0, -'.tokens.txt'.length);
    if (!activeSourceIds.has(id)) {
      fs.unlinkSync(path.join(cacheDir, name));
    }
  }
}

export function pruneStaleManifest(manifest: BuildManifest, activeSourceIds: Set<string>): void {
  for (const id of Object.keys(manifest.sources)) {
    if (!activeSourceIds.has(id)) {
      delete manifest.sources[id];
    }
  }
}
