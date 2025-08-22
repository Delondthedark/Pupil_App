// backend/routes/ingest.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { analyzeCsvBuffer } from '../services/ParkinsonAnalyzer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const looksLikeCSV = (buf) => {
  const head = buf.toString('utf8', 0, 2048);
  return head.includes(',') || head.includes('\n');
};

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
      analyze = true
    } = req.body || {};

    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });
    if (contentType !== 'text/csv') return res.status(400).json({ error: 'contentType must be text/csv' });

    let csvBuf;
    try { csvBuf = Buffer.from(fileBase64, 'base64'); }
    catch { return res.status(400).json({ error: 'Invalid base64' }); }

    if (!looksLikeCSV(csvBuf)) return res.status(400).json({ error: 'Payload does not look like CSV' });

    // Persist file
    const uploadsDir = path.join(process.cwd(), 'uploads', 'csv');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `upload_${Date.now()}.csv`;
    const fullPath = path.join(uploadsDir, safeName);
    await fs.promises.writeFile(fullPath, csvBuf);

    if (!analyze) {
      return res.json({
        accepted: true,
        stored: { path: `/uploads/csv/${safeName}`, bytes: csvBuf.length, contentType },
        meta
      });
    }

    const result = analyzeCsvBuffer(csvBuf);
    return res.json({
      accepted: true,
      stored: { path: `/uploads/csv/${safeName}`, bytes: csvBuf.length, contentType },
      meta,
      analysis: result
    });
  } catch (e) {
    console.error('ingest error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Test UI helper: multipart upload (no secret), analyzes immediately
router.post('/test', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const buf = req.file.buffer;
    if (!looksLikeCSV(buf)) return res.status(400).json({ error: 'Not CSV' });

    const result = analyzeCsvBuffer(buf);
    return res.json(result);
  } catch (e) {
    console.error('ingest/test error:', e);
    return res.status(400).json({ error: e.message || 'Analyze failed' });
  }
});

export default router;
