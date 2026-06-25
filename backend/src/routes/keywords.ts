import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { analyzeKeywordSimilarity } from '../services/similarityService.js';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/:id/analyze-similarity', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  try {
    const keyword = await prisma.keyword.findFirst({
      where: {
        id,
        project: { userId: req.user!.userId },
      },
    });

    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    const result = await analyzeKeywordSimilarity(id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to analyse similarity';
    console.error('[Similarity]', error);
    res.status(500).json({ error: message });
  }
});

export default router;
