import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { sseClients, processPdfBackground } from '../services/processingService.js';

const router = express.Router();

const prisma = new PrismaClient();

const upload = multer({ dest: 'uploads/' });

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

// Get a single project with its concepts and keywords (for the sidebar)
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;

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

    res.json(project);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
});

// Upload PDF and start processing
router.post('/:id/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res) => {
  const { id } = req.params;
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

    // Start background processing
    console.log(`[Upload] Received PDF for project ${id}: ${file.originalname} (${file.size} bytes)`);
    processPdfBackground(id, file.path);

    res.json({ message: 'Upload successful, processing started' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// SSE endpoint for progress and keyword streaming
router.get('/:id/stream', authenticateToken, (req: AuthRequest, res) => {
  const { id } = req.params;

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
