import express from 'express';
import { validatePageCalloutsWithGemini } from '../services/geminiValidationService.js';
import type { ExtractedCallout } from '../services/geminiService.js';

const router = express.Router();

/**
 * POST /api/validation/callouts
 * Body: { imageBase64: string, extractedConcepts: ExtractedCallout[] }
 *
 * Runs callout anomaly detection separately from term extraction.
 */
router.post('/callouts', async (req, res) => {
  const { imageBase64, extractedConcepts } = req.body as {
    imageBase64?: string;
    extractedConcepts?: ExtractedCallout[];
  };

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  if (!Array.isArray(extractedConcepts)) {
    return res.status(400).json({ error: 'extractedConcepts must be an array' });
  }

  try {
    const result = await validatePageCalloutsWithGemini(imageBase64, extractedConcepts);
    res.json(result);
  } catch (error) {
    console.error('[Validation] Callout validation failed:', error);
    res.status(500).json({ error: 'Callout validation failed' });
  }
});

export default router;
