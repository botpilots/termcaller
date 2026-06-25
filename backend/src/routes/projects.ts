import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

const prisma = new PrismaClient();

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

export default router;
