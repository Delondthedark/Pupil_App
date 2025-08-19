// backend/routes/ingest.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { analyzeCsvBuffer } from '../services/parkinsonAnalyzer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function saveCsv(fileName, buf) {
  const uploadsDir = path.join(process.cwd(), 'uploads', 'csv');
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `upload_${Date.now()}.csv`;
  const fullPath = path.join(uploadsDir, safeName);
  await fs.promises.writeFile(fullPath, buf);
  return { safeName, fullPath };
}

// JSON ingest (partners / backend)
router.post('/', async (req, res) => {
  try {
    const provided = req.get('X-Shared-Secret') || '';
    if (provided !== process.env.SHARED_UPLOAD_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { fileName = `upload_${Date.now()}.csv`, fileBase64 = '', analyze = false } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

    const buf = Buffer.from(fileBase64, 'base64');
    const { safeName } = await saveCsv(fileName, buf);

    let analysis = null;
    if (analyze) analysis = analyzeCsvBuffer(buf);

    res.json({
      accepted: true,
      stored: { path: `/uploads/csv/${safeName}`, bytes: buf.length, contentType: 'text/csv' },
      analysis
    });
  } catch (err) {
    console.error('ingest error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Form-data ingest (frontend / Postman)
router.post('/test', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file required' });

    const buf = req.file.buffer;
    const { safeName } = await saveCsv(req.file.originalname, buf);
    const analysis = analyzeCsvBuffer(buf);

    res.json({
      accepted: true,
      stored: { path: `/uploads/csv/${safeName}`, bytes: buf.length, contentType: req.file.mimetype },
      analysis
    });
  } catch (err) {
    console.error('ingest/test error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
