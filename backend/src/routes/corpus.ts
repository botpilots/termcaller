import express from 'express';
import { getCorpusTermsMap } from '../services/corpusLookup.js';

const router = express.Router();

/** Compact corpus stats for client-side priority scoring during live extraction. */
router.get('/word-rank', (_req, res) => {
  try {
    res.json(getCorpusTermsMap());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load corpus word-rank' });
  }
});

export default router;
