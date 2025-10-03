// backend/services/p_analyzer.js
import { parse as csvParse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { performance } from 'node:perf_hooks';

/* ---------- CSV utils ---------- */
function detectDelimiter(headerLine) {
  if (headerLine.includes('\t')) return '\t';
  if (headerLine.includes(';')) return ';';
  return ',';
}
function parseCSV(text) {
  const first = (text.split(/\r?\n/)[0] || '');
  const delimiter = detectDelimiter(first);
  return csvParse(text, { columns: true, delimiter, skip_empty_lines: true, trim: true });
}

/* ---------- math helpers ---------- */
const toNum = (v) => {
  if (v == null) return NaN;
  let s = String(v).trim();
  s = s.replace(/,/g, '.').replace(/\b(mm|px)\b/gi, '');
  s = s.replace(/[^\d.\-eE]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a, m = mean(a)) => {
  if (a.length < 2) return 0;
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(Math.max(0, v));
};
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const yb = b[i] - mb;
    num += xa * yb;
    da += xa * xa;
    db += yb * yb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

/* ---------- header mapper (requires illuminance & depth) ---------- */
function mapColumns(row0) {
  const norm = (s) => String(s).toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()_\-]/g, '')
    .replace(/\./g, '');
  const keys = Object.keys(row0);
  const byNorm = {};
  for (const k of keys) byNorm[norm(k)] = k;

  const pick = (...cands) => {
    for (const c of cands) if (byNorm[c]) return byNorm[c];
    return null;
  };

  const left  = pick('leftpupilmm','leftpupil','lpupil','pupill','left');
  const right = pick('rightpupilmm','rightpupil','rpupil','pupilr','right');
  const brightness = pick('illuminance','brightness','bright','illum','lux','light'); // REQUIRED
  const depth      = pick('depth','z','distance');                                     // REQUIRED

  if (!left || !right) throw new Error('CSV must include "Left Pupil (mm)" and "Right Pupil (mm)".');
  if (!brightness)     throw new Error('CSV must include "Illuminance" (or Brightness/Lux).');
  if (!depth)          throw new Error('CSV must include "depth" (or z/distance).');

  return { left, right, brightness, depth };
}

/* ---------- main ---------- */
export async function analyzeCsvBuffer(csvBuffer, opts = { debug: false }) {
  const debug = !!opts.debug;
  const t0 = performance.now();

  const text = csvBuffer.toString('utf8');
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('CSV is empty');

  const col = mapColumns(rows[0]);

  const series = [];
  for (const r of rows) {
    const left   = toNum(r[col.left]);
    const right  = toNum(r[col.right]);
    const bright = toNum(r[col.brightness]); // required
    const depth  = toNum(r[col.depth]);      // required
    if (Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(bright) && Number.isFinite(depth)) {
      series.push({ left, right, bright, depth });
    }
  }
  if (!series.length) throw new Error('No valid numeric rows for required columns');

  const L = series.map(s => s.left);
  const R = series.map(s => s.right);
  const B = series.map(s => s.bright);
  const D = series.map(s => s.depth);

  const L_mean = mean(L);
  const R_mean = mean(R);
  const L_std  = std(L, L_mean);
  const R_std  = std(R, R_mean);
  const asym   = Math.abs(L_mean - R_mean);
  const stv    = std(L.concat(R));

  const corr_L_B = corr(L, B);
  const corr_R_B = corr(R, B);
  const corr_L_D = corr(L, D);
  const corr_R_D = corr(R, D);

  // 9-feature vector sent to ML
  const features = {
    n: series.length,
    L_mean, R_mean,
    L_std, R_std,
    asym,
    corr_L_B, corr_R_B,
    stv,
  };

  // Predict
  let ml_prediction = null;
  try {
    const mlBase = process.env.ML_BASE_URL || 'http://localhost:8000';
    const mlRes = await fetch(`${mlBase}/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
    });
    if (mlRes.ok) {
      ml_prediction = await mlRes.json();
    } else {
      console.error('ML service error:', mlRes.status, await mlRes.text().catch(()=>'')); // log only
    }
  } catch (e) {
    console.error('Error calling ML service:', e.message);
  }

  const diagnosis_final = ml_prediction?.label || 'Review Recommended';
  const conditions = ml_prediction?.proba
    ? Object.entries(ml_prediction.proba)
        .map(([condition, confidence]) => ({ condition, confidence }))
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    : [];

  const summary = {
    left:  { mean: Number(L_mean.toFixed(3)), std: Number(L_std.toFixed(3)) },
    right: { mean: Number(R_mean.toFixed(3)), std: Number(R_std.toFixed(3)) },
    asymmetry_mm: Number(asym.toFixed(3)),
    stv_bilateral: Number(stv.toFixed(3)),
    corr_brightness: { left: Number(corr_L_B.toFixed(3)), right: Number(corr_R_B.toFixed(3)) },
    corr_depth:      { left: Number(corr_L_D.toFixed(3)), right: Number(corr_R_D.toFixed(3)) },
  };

  // Clean default response (no timings)
  const result = {
    n_rows: series.length,
    summary,
    diagnosis_final,
    conditions
  };

  // Debug extras only when requested
  if (debug) {
    result.features = features;
    result.ml_prediction = ml_prediction;
    result.timings = { total_analyze_ms: Number((performance.now() - t0).toFixed(1)) };
  }

  return result;
}
