import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { analyzeCsvBuffer } from '../services/ParkinsonAnalyzer.js';
import fetch from 'node-fetch';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// POST /parkinson/analyze  (multipart or JSON URL)
router.post('/analyze', upload.single('file'), async (req, res) => {
  try {
    let buf;

    if (req.file) {
      buf = req.file.buffer;                           // multipart: form-data "file"
    } else if (req.body?.url) {
      const r = await fetch(req.body.url);
      if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());        // JSON: { "url": "https://..." }
    } else if (req.body?.csvBase64) {
      buf = Buffer.from(req.body.csvBase64, 'base64'); // JSON: { "csvBase64": "..." }
    } else {
      return res.status(400).json({ error: 'Provide a CSV file, url, or csvBase64' });
    }

    const result = analyzeCsvBuffer(buf);
    return res.json(result);
  } catch (e) {
    console.error('Analyze error:', e);
    return res.status(400).json({ error: e.message || 'Analyze failed' });
  }
});

export default router;
