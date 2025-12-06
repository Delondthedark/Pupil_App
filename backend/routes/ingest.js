// backend/routes/ingest.js
import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';

import { analyzeCsvBuffer } from '../services/p_analyzer.js';
import { predict } from '../services/mlClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const UP_BASE = path.join(process.cwd(), 'uploads', 'csv');
const SHARED_SECRET = process.env.SHARED_UPLOAD_TOKEN || process.env.INGEST_SECRET || '';

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function toFeatures(analysis) {
  const s = analysis?.summary || {};
  const L = s.left  || {};
  const R = s.right || {};
  return {
    n: analysis?.n_rows ?? 0,
    L_mean: Number(L.mean ?? 0),
    R_mean: Number(R.mean ?? 0),
    L_std:  Number(L.std  ?? 0),
    R_std:  Number(R.std  ?? 0),
    asym:   Number(s.asymmetry_mm ?? 0),
    stv:    Number(s.stv_bilateral ?? 0),
    corr_L_B: Number(s.corr_brightness?.left  ?? 0),
    corr_R_B: Number(s.corr_brightness?.right ?? 0),
  };
}

function canonicalizeConditions(proba = {}) {
  return Object.keys(proba)
    .map(k => ({ condition: k, confidence: Number(proba[k]) }))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function ms(start) {
  return Math.round(performance.now() - start);
}

async function buildResponse({ analysis, started, storedPathRel, doAnalyze }) {
  let diagnosis_final = '—';
  let conditions = [];
  let reasons = [];
  let explanations = undefined;
  let scores = undefined;

  if (doAnalyze) {
    const feats = toFeatures(analysis);
    const ml = await predict(feats);
    if (!ml?.error) {
      diagnosis_final = ml.label ?? '—';
      conditions = canonicalizeConditions(ml.proba || {});
      reasons = Array.isArray(ml.reasons) ? ml.reasons : [];
      explanations = ml.explanations;
      scores = Array.isArray(ml.scores) ? ml.scores : undefined;
    }
  }

  const body = {
    analysis: {
      ...analysis,
      diagnosis_final,
      ...(conditions.length ? { conditions } : {}),
      ...(reasons.length ? { reasons } : {}),
      ...(explanations ? { explanations } : {}),
      ...(scores ? { scores } : {}),
    },
    ...(storedPathRel ? { stored: { path: storedPathRel } } : {}),
    response_time_ms: ms(started),
  };

  return body;
}

/* ----------------------- UI TEST (multipart) ----------------------- *
 * POST /api/ingest/test?analyze=1
 * form-data: file = <csv>
 */
router.post('/test', upload.single('file'), async (req, res) => {
  const started = performance.now();
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'csv_required' });

    // store file (optional but nice for debugging)
    await ensureDir(UP_BASE);
    const fname = `test_${Date.now()}.csv`;
    const abs = path.join(UP_BASE, fname);
    await fs.writeFile(abs, req.file.buffer);
    const rel = `/uploads/csv/${fname}`;

    const analysis = await analyzeCsvBuffer(req.file.buffer);
    const doAnalyze = String(req.query.analyze || '0') === '1';

    const payload = await buildResponse({ analysis, started, storedPathRel: rel, doAnalyze });
    res.set('X-Response-Time-Ms', String(payload.response_time_ms));
    return res.json(payload);
  } catch (e) {
    console.error('[ingest/test]', e);
    return res.status(500).json({ error: 'internal_error', detail: e.message, response_time_ms: ms(started) });
  }
});

/* ----------------------- PARTNER JSON (base64) ----------------------- *
 * POST /api/ingest
 * headers: X-Shared-Secret: <secret>
 * body: { fileName, fileBase64, contentType: "text/csv", meta?, analyze? }
 */
router.post('/', express.json({ limit: '80mb' }), async (req, res) => {
  const started = performance.now();
  try {
    if (SHARED_SECRET) {
      const got = req.header('X-Shared-Secret') || '';
      if (got !== SHARED_SECRET) return res.status(403).json({ error: 'forbidden' });
    }
    const { fileBase64, fileName = `upload_${Date.now()}.csv`, analyze = true } = req.body || {};
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64_required' });

    const raw = Buffer.from(String(fileBase64), 'base64');
    await ensureDir(UP_BASE);
    const abs = path.join(UP_BASE, fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    await fs.writeFile(abs, raw);
    const rel = `/uploads/csv/${path.basename(abs)}`;

    const analysis = await analyzeCsvBuffer(raw);
    const payload = await buildResponse({ analysis, started, storedPathRel: rel, doAnalyze: !!analyze });
    res.set('X-Response-Time-Ms', String(payload.response_time_ms));
    return res.json(payload);
  } catch (e) {
    console.error('[ingest/partner]', e);
    return res.status(500).json({ error: 'internal_error', detail: e.message, response_time_ms: ms(started) });
  }
});

export default router;
