import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import fs from 'fs';
import { sseClients, processPdfBackground } from '../services/processingService.js';
import {
  validateProjectFigure,
  validateAllProjectFigures,
  type IllustrationWithCallouts,
} from '../services/figureValidationService.js';
import { loadProjectPdfPath, resolveProjectPdfPath } from '../utils/resolveProjectPdf.js';
import { openPdfDocument } from '../utils/pdfjsLoad.js';
import { getPdfPageCount } from '../utils/pdfPageCount.js';
import { attachKeywordPriorities } from '../utils/attachKeywordPriorities.js';
import { exportProjectTbxBasic } from '../services/tbxExportService.js';

const router = express.Router();

const prisma = new PrismaClient();

const upload = multer({ dest: 'uploads/' });

const illustrationInclude = {
  callouts: {
    include: { concept: true },
  },
} as const;

// Get all projects for the logged in user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        userId: req.user!.userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create a new project
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  try {
    const project = await prisma.project.create({
      data: {
        name,
        userId: req.user!.userId,
      },
    });
    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Export project glossary as TBX-Basic
router.get('/:id/export/tbx', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  const defaultLanguage =
    typeof req.query.defaultLanguage === 'string' && req.query.defaultLanguage.trim()
      ? req.query.defaultLanguage.trim()
      : 'en';

  try {
    const exported = await exportProjectTbxBasic(prisma, id, req.user!.userId, defaultLanguage);
    if (!exported) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.xml);
  } catch (error) {
    console.error('[TBX export] Failed:', error);
    res.status(500).json({ error: 'Failed to export TBX' });
  }
});

// Get a single project with its concepts and keywords (for the sidebar)
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        userId: req.user!.userId,
      },
      include: {
        keywords: {
          include: {
            concepts: true,
          }
        },
        illustrations: {
          include: {
            callouts: {
              include: {
                concept: true
              }
            }
          }
        }
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const pdfPath = await resolveProjectPdfPath(project, prisma);
    const keywords = attachKeywordPriorities(project.keywords, project.illustrations);
    res.json({ ...project, keywords, pdfPath: pdfPath ?? project.pdfPath });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
});

// Delete a project and its uploaded PDF
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: req.user!.userId },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.pdfPath && fs.existsSync(project.pdfPath)) {
      try {
        fs.unlinkSync(project.pdfPath);
        console.log(`[Delete] Removed PDF for project ${id}: ${project.pdfPath}`);
      } catch (error) {
        console.warn(`[Delete] Failed to remove PDF for project ${id}:`, error);
      }
    }

    const clients = sseClients.get(id);
    if (clients) {
      for (const client of clients) {
        client.end();
      }
      sseClients.delete(id);
    }

    await prisma.project.delete({ where: { id } });
    console.log(`[Delete] Removed project ${id}`);
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('[Delete] Failed:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Upload PDF only — extraction is started separately via POST /:id/extract
router.post('/:id/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: req.user!.userId }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const pageCount = await getPdfPageCount(file.path);
    console.log(
      `[Upload] Received PDF for project ${id}: ${file.originalname} (${file.size} bytes, ${pageCount} pages)`
    );
    await prisma.project.update({
      where: { id },
      data: { pdfPath: file.path, pageCount },
    });

    res.json({ message: 'Upload successful', pdfPath: file.path, pageCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// Start keyword extraction for an uploaded PDF
router.post('/:id/extract', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  try {
    const loaded = await loadProjectPdfPath(id, req.user!.userId, prisma);
    if ('error' in loaded) {
      return res.status(loaded.status).json({ error: loaded.error });
    }

    console.log(`[Extract] Starting keyword extraction for project ${id}`);
    processPdfBackground(id, loaded.pdfPath);

    res.json({ message: 'Extraction started' });
  } catch (error) {
    console.error('[Extract] Failed to start extraction:', error);
    res.status(500).json({ error: 'Failed to start extraction' });
  }
});

// Identified figures only (independent from keyword extraction)
router.get('/:id/figures', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  try {
    const project = await prisma.project.findFirst({
      where: { id, userId: req.user!.userId },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const figures = await prisma.illustration.findMany({
      where: { projectId: id },
      include: illustrationInclude,
      orderBy: [{ pageNumber: 'asc' }, { figureNumber: 'asc' }],
    });

    res.json(figures);
  } catch (error) {
    console.error('[Figures] Failed to list figures:', error);
    res.status(500).json({ error: 'Failed to fetch figures' });
  }
});

// Validate referential integrity — scans PDF, discovers figures, upserts DB (6 concurrent)
router.post('/:id/figures/validate-all', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });

  try {
    const loaded = await loadProjectPdfPath(id, req.user!.userId, prisma);
    if ('error' in loaded) {
      return res.status(loaded.status).json({ error: loaded.error });
    }

    console.log(`[Validation] Batch validating figures for project ${id}`);
    const results = await validateAllProjectFigures(prisma, id, loaded.pdfPath);

    const failed = results.filter((r: { error?: string }) => r.error).length;
    res.json({
      results,
      validated: results.length - failed,
      failed,
      total: results.length,
    });
  } catch (error) {
    console.error('[Validation] Batch figure validation failed:', error);
    res.status(500).json({ error: 'Batch figure validation failed' });
  }
});

// Validate callout anomalies for a single identified figure
router.post('/:id/figures/:pageNumber/validate', authenticateToken, async (req: AuthRequest, res) => {
  const { id, pageNumber: pageNumberParam } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing project id' });
  const pageNumber = Number(pageNumberParam);

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  try {
    const loaded = await loadProjectPdfPath(id, req.user!.userId, prisma);
    if ('error' in loaded) {
      return res.status(loaded.status).json({ error: loaded.error });
    }

    const illustration = (await prisma.illustration.findFirst({
      where: {
        projectId: id,
        pageNumber,
        ...(req.query.figureNumber ? { figureNumber: String(req.query.figureNumber) } : {}),
      },
      include: illustrationInclude,
    })) as IllustrationWithCallouts | null;

    if (!illustration) {
      return res.status(404).json({ error: 'No illustration found for this page' });
    }

    const pdfDocument = await openPdfDocument(new Uint8Array(fs.readFileSync(loaded.pdfPath)));

    const result = await validateProjectFigure(
      loaded.pdfPath,
      pageNumber,
      pdfDocument.numPages,
      illustration
    );

    res.json({
      pageNumber,
      figureNumber: illustration.figureNumber,
      calloutCount: illustration.callouts.length,
      ...result,
    });
  } catch (error) {
    console.error('[Validation] Figure validation failed:', error);
    res.status(500).json({ error: 'Figure validation failed' });
  }
});

// SSE endpoint for progress and keyword streaming
router.get('/:id/stream', authenticateToken, (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'Missing project id' });
    return;
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add client to the map
  if (!sseClients.has(id)) {
    sseClients.set(id, []);
  }
  sseClients.get(id)!.push(res);
  console.log(`[SSE] Client connected for project ${id} (${sseClients.get(id)!.length} total)`);

  // Remove client when connection closes
  req.on('close', () => {
    const clients = sseClients.get(id);
    if (clients) {
      const index = clients.indexOf(res);
      if (index !== -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        sseClients.delete(id);
      }
    }
    console.log(`[SSE] Client disconnected for project ${id}`);
  });
});

export default router;
