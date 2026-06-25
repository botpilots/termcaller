import fs from 'fs';
import path from 'path';
import type { PrismaClient, Project } from '@prisma/client';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

function listUploadFiles(): { relativePath: string; mtime: number }[] {
  if (!fs.existsSync(UPLOADS_DIR)) return [];

  return fs
    .readdirSync(UPLOADS_DIR)
    .filter(name => {
      try {
        return fs.statSync(path.join(UPLOADS_DIR, name)).isFile();
      } catch {
        return false;
      }
    })
    .map(name => {
      const full = path.join(UPLOADS_DIR, name);
      return {
        relativePath: `uploads/${name}`,
        mtime: fs.statSync(full).mtimeMs,
      };
    });
}

function pdfPathExists(pdfPath: string | null | undefined): pdfPath is string {
  return Boolean(pdfPath && fs.existsSync(pdfPath));
}

/**
 * Link projects missing pdfPath to files in uploads/ (same user, ordered by createdAt ↔ mtime).
 * PDFs are on disk from multer; older projects were created before pdfPath was persisted.
 */
export async function resolveProjectPdfPath(
  project: Pick<Project, 'id' | 'userId' | 'pdfPath' | 'createdAt'>,
  prisma: PrismaClient
): Promise<string | null> {
  if (pdfPathExists(project.pdfPath)) {
    return project.pdfPath;
  }

  const userProjects = await prisma.project.findMany({
    where: { userId: project.userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, pdfPath: true, createdAt: true },
  });

  const usedPaths = new Set(
    userProjects.map(p => p.pdfPath).filter((p): p is string => pdfPathExists(p))
  );

  const unlinkedFiles = listUploadFiles()
    .filter(f => !usedPaths.has(f.relativePath))
    .sort((a, b) => a.mtime - b.mtime);

  const unlinkedProjects = userProjects.filter(p => !pdfPathExists(p.pdfPath));
  const slot = unlinkedProjects.findIndex(p => p.id === project.id);
  if (slot < 0 || slot >= unlinkedFiles.length) {
    return null;
  }

  const match = unlinkedFiles[slot];
  if (!match) return null;

  const pdfPath = match.relativePath;
  await prisma.project.update({
    where: { id: project.id },
    data: { pdfPath },
  });

  console.log(`[PDF] Linked project ${project.id} → ${pdfPath}`);
  return pdfPath;
}

export async function loadProjectPdfPath(
  projectId: string,
  userId: string,
  prisma: PrismaClient
): Promise<
  | { pdfPath: string }
  | { error: string; status: 400 | 404 }
> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    return { error: 'Project not found', status: 404 };
  }

  const pdfPath = await resolveProjectPdfPath(project, prisma);
  if (!pdfPath) {
    return { error: 'No PDF linked to this project. Upload a PDF using the header.', status: 400 };
  }

  return { pdfPath };
}
