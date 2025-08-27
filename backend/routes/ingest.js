// backend/routes/ingest.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { analyzeCsvBuffer } from '../services/p_analyzer.js';

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ingest' });
});

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const looksLikeCSV = (buif) => {
  const head = buf.toStrng('utf8', 0, 2048);
  return head.includes(',') || head.includes('\n');
};

// Partner JSON: POST /ingest  (expects base64)
router.post('/', async (req, res) => {
  try {
    const provided = req.get('X-Shared-Secret') || '';
    const expected = process.env.SHARED_UPLOAD_TOKEN || '';
    if (!expected || provided !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      fileName = `upload_${Date.now()}.csv`,
      fileBase64 = '',
      contentType = 'text/csv',
      meta = {},
      analyze = true,
    } = req.body || {};

    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });
    if (contentType !== 'text/csv') return res.status(400).json({ error: 'contentType must be text/csv' });

    let csvBuf;
    try { csvBuf = Buffer.from(fileBase64, 'base64'); }
    catch { return res.status(400).json({ error: 'Invalid base64' }); }

    if (!looksLikeCSV(csvBuf)) return res.status(400).json({ error: 'Payload does not look like CSV' });

    const dir = path.join(process.cwd(), 'uploads', 'csv');
    await fs.promises.mkdir(dir, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `upload_${Date.now()}.csv`;
    const fullPath = path.join(dir, safeName);
    await fs.promises.writeFile(fullPath, csvBuf);

    if (!analyze) {
      return res.json({
        accepted: true,
        stored: { path: `/uploads/csv/${safeName}`, bytes: csvBuf.length, contentType },
        meta
      });
    }

    const analysis = analyzeCsvBuffer(csvBuf);
    return res.json({
      accepted: true,
      stored: { path: `/uploads/csv/${safeName}`, bytes: csvBuf.length, contentType },
      meta,
      analysis
    });
  } catch (e) {
    console.error('ingest/ error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// UI Test: multipart → POST /ingest/test
router.post('/test', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'file is required' });
    const csvBuf = req.file.buffer;

    const dir = path.join(process.cwd(), 'uploads', 'csv');
    await fs.promises.mkdir(dir, { recursive: true });
    const safeName = (req.file.originalname || `upload_${Date.now()}.csv`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(dir, safeName);
    await fs.promises.writeFile(fullPath, csvBuf);

    const analysis = analyzeCsvBuffer(csvBuf);
    return res.json({
      accepted: true,
      stored: { path: `/uploads/csv/${safeName}`, bytes: csvBuf.length, contentType: 'text/csv' },
      analysis
    });
  } catch (e) {
    console.error('ingest/test error:', e);
    return res.status(400).json({ error: e.message || 'Analyze failed' });
  }
});

export default router;
