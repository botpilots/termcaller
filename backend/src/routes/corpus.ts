import express from 'express';
import {
  prioritizeCorpusTerms,
  type CorpusPrioritizeItem,
} from '../services/corpusPrioritize.js';

const router = express.Router();

/** Batch corpus rarity lookup for a list of terms (stateless; no full vocab download). */
router.post('/prioritize', (req, res) => {
  try {
    const { items } = req.body as { items?: unknown };

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    const parsed: CorpusPrioritizeItem[] = [];
    for (const item of items) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as CorpusPrioritizeItem).id !== 'string' ||
        typeof (item as CorpusPrioritizeItem).term !== 'string'
      ) {
        return res.status(400).json({ error: 'Each item needs id and term strings' });
      }
      parsed.push({ id: (item as CorpusPrioritizeItem).id, term: (item as CorpusPrioritizeItem).term });
    }

    res.json({ items: prioritizeCorpusTerms(parsed) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to prioritize corpus terms' });
  }
});

export default router;
