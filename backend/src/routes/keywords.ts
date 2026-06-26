import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { analyzeKeywordSimilarity } from '../services/similarityService.js';
import { deleteOccurrence, saveOccurrenceEdit } from '../services/occurrenceEditService.js';

const router = express.Router();
const prisma = new PrismaClient();

router.patch('/:id/occurrences', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  const {
    pageNumber,
    figureNumber,
    originalIdentifiers,
    identifier,
    sourceTerm,
    definitionText,
    originalSourceTerm,
  } = req.body ?? {};

  if (
    typeof pageNumber !== 'number' ||
    typeof originalIdentifiers !== 'string' ||
    typeof identifier !== 'string' ||
    typeof sourceTerm !== 'string' ||
    typeof definitionText !== 'string' ||
    typeof originalSourceTerm !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid occurrence payload' });
  }

  try {
    const result = await saveOccurrenceEdit(prisma, req.user!.userId, {
      keywordId: id,
      pageNumber,
      figureNumber: typeof figureNumber === 'string' ? figureNumber : undefined,
      originalIdentifiers,
      identifier,
      sourceTerm,
      definitionText,
      originalSourceTerm,
    });

    if (!result) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save occurrence';
    console.error('[Occurrence edit]', error);
    res.status(500).json({ error: message });
  }
});

router.delete('/:id/occurrences', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  const { pageNumber, figureNumber, identifiers } = req.body ?? {};

  if (typeof pageNumber !== 'number' || typeof identifiers !== 'string') {
    return res.status(400).json({ error: 'Invalid occurrence payload' });
  }

  try {
    const result = await deleteOccurrence(prisma, req.user!.userId, {
      keywordId: id,
      pageNumber,
      figureNumber: typeof figureNumber === 'string' ? figureNumber : undefined,
      identifiers,
    });

    if (!result) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete occurrence';
    console.error('[Occurrence delete]', error);
    res.status(500).json({ error: message });
  }
});

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
