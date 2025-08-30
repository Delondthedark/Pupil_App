import express from 'express';
import multer from 'multer';
import { analyzeCsvBuffer } from '../services/p_analyzer.js';
import { predict } from '../services/mlClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    const buf = req.file?.buffer;
    if (!buf) return res.status(400).json({ error: 'CSV file required' });

    const analysis = await analyzeCsvBuffer(buf);

    return res.json(analysis);
  } catch (e) {
    console.error('Analyze error:', e);
    return res.status(500).json({ error: e.message || 'Analyze failed' });
  }
});

export default router;
