import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { ignoreOccurrence, saveOccurrenceEdit } from '../services/occurrenceEditService.js';
import {
  branchConcept,
  getKeywordCurationState,
  ignoreConcept,
} from '../services/keywordCurationService.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/:id/curation', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  try {
    const state = await getKeywordCurationState(prisma, id, req.user!.userId);
    if (!state) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    res.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load curation state';
    console.error('[Keyword curation]', error);
    res.status(500).json({ error: message });
  }
});

router.post('/:id/branch', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  const { conceptId, newSourceTerm } = req.body ?? {};

  if (typeof conceptId !== 'string' || typeof newSourceTerm !== 'string') {
    return res.status(400).json({ error: 'Invalid branch payload' });
  }

  try {
    const result = await branchConcept(prisma, req.user!.userId, {
      keywordId: id,
      conceptId,
      newSourceTerm,
    });

    if (!result) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    const state = await getKeywordCurationState(prisma, id, req.user!.userId);
    res.json({ ...result, curation: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to branch concept';
    console.error('[Keyword branch]', error);
    res.status(400).json({ error: message });
  }
});

router.post('/:id/concepts/:conceptId/ignore', authenticateToken, async (req: AuthRequest, res) => {
  const { id, conceptId } = req.params;
  if (!id || !conceptId) return res.status(400).json({ error: 'Missing keyword or concept id' });

  try {
    const result = await ignoreConcept(prisma, req.user!.userId, {
      keywordId: id,
      conceptId,
    });

    if (!result) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    const state = await getKeywordCurationState(prisma, id, req.user!.userId);
    res.json({ ...result, curation: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ignore concept';
    console.error('[Keyword ignore concept]', error);
    res.status(400).json({ error: message });
  }
});

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

router.post('/:id/occurrences/ignore', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing keyword id' });

  const { pageNumber, figureNumber, identifiers } = req.body ?? {};

  if (typeof pageNumber !== 'number' || typeof identifiers !== 'string') {
    return res.status(400).json({ error: 'Invalid occurrence payload' });
  }

  try {
    const result = await ignoreOccurrence(prisma, req.user!.userId, {
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
    const message = error instanceof Error ? error.message : 'Failed to ignore occurrence';
    console.error('[Occurrence ignore]', error);
    res.status(500).json({ error: message });
  }
});

export default router;
