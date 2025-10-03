// backend/routes/ingest.js
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { analyzeCsvBuffer } from '../services/p_analyzer.js';

const router = express.Router();
const upload = multer();

const nsToMs = (ns) => Number(ns) / 1e6;

// (optional) scrub meta identifiers
function scrubPatientId(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrubPatientId);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (key === 'patientid' || key === 'patient_id' || key === 'pid') continue;
    out[k] = scrubPatientId(v);
  }
  return out;
}

// POST /api/ingest/test  (multipart)
router.post('/test', upload.single('file'), async (req, res) => {
  const t0 = process.hrtime.bigint();
  try {
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const isDebug = req.query.debug === '1' || req.get('X-Debug') === '1';
    const analysis = await analyzeCsvBuffer(req.file.buffer, { debug: isDebug });

    // persist (optional)
    const fname = req.file.originalname?.replace(/\s+/g, '_') || `upload_${Date.now()}.csv`;
    await fs.mkdir('uploads/csv', { recursive: true });
    const outPath = path.join('uploads/csv', fname);
    await fs.writeFile(outPath, req.file.buffer);

    const totalMs = nsToMs(process.hrtime.bigint() - t0);
    res.setHeader('X-Response-Time-Ms', totalMs.toFixed(1));
    return res.json({
      accepted: true,
      stored: { path: `/${outPath}`, bytes: req.file.size, contentType: req.file.mimetype || 'text/csv' },
      response_time_ms: Number(totalMs.toFixed(1)),
      analysis
    });
  } catch (e) {
    const totalMs = nsToMs(process.hrtime.bigint() - t0);
    res.setHeader('X-Response-Time-Ms', totalMs.toFixed(1));
    return res.status(500).json({
      error: 'internal_error',
      detail: e.message,
      response_time_ms: Number(totalMs.toFixed(1))
    });
  }
});

// POST /api/ingest  (partner JSON, base64)
router.post('/', express.json({ limit: '25mb' }), async (req, res) => {
  const t0 = process.hrtime.bigint();
  try {
    const { fileName, fileBase64, contentType = 'text/csv', meta = {}, analyze = true } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'missing_fileBase64' });

    const buf = Buffer.from(String(fileBase64), 'base64');

    // save
    await fs.mkdir('uploads/csv', { recursive: true });
    const fname = (fileName || `upload_${Date.now()}.csv`).replace(/\s+/g, '_');
    const outPath = path.join('uploads/csv', fname);
    await fs.writeFile(outPath, buf);

    const isDebug = req.query.debug === '1' || req.get('X-Debug') === '1';
    const analysis = analyze ? await analyzeCsvBuffer(buf, { debug: isDebug }) : null;

    const totalMs = nsToMs(process.hrtime.bigint() - t0);
    res.setHeader('X-Response-Time-Ms', totalMs.toFixed(1));
    return res.json({
      accepted: true,
      stored: { path: `/${outPath}`, bytes: buf.length, contentType },
      meta: scrubPatientId(meta),
      response_time_ms: Number(totalMs.toFixed(1)),
      ...(analysis ? { analysis } : {})
    });
  } catch (e) {
    const totalMs = nsToMs(process.hrtime.bigint() - t0);
    res.setHeader('X-Response-Time-Ms', totalMs.toFixed(1));
    return res.status(500).json({
      error: 'internal_error',
      detail: e.message,
      response_time_ms: Number(totalMs.toFixed(1))
    });
  }
});

export default router;
