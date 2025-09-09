// backend/services/p_analyzer.js
import { parse } from 'csv-parse/sync';
import fetch from 'node-fetch';

/** ---- Helpers ---- */
const toNum = (v) => {
  if (v == null) return NaN;
  const s = String(v).replace(/[^\d.\-eE]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = (a, m = mean(a)) =>
  Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length || 1));

/** Pearson correlation */
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return NaN;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

/** Map CSV headers */
function mapColumns(row0) {
  const col = {};
  for (const key of Object.keys(row0)) {
    const nk = key.toLowerCase().trim();
    if (nk.includes('frame')) col.frame = key;
    if (nk.includes('left') && nk.includes('pupil')) col.left = key;
    if (nk.includes('right') && nk.includes('pupil')) col.right = key;
    if (nk.includes('bright')) col.brightness = key;
  }
  if (!col.left || !col.right) throw new Error('CSV must include Left/Right Pupil Size columns');
  return col;
}

/** ---- Main ---- */
export async function analyzeCsvBuffer(csvBuffer) {
  const text = csvBuffer.toString('utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('CSV is empty');

  const col = mapColumns(rows[0]);
  const series = [];
  for (const r of rows) {
    const frame = col.frame ? toNum(r[col.frame]) : series.length;
    const left = toNum(r[col.left]);
    const right = toNum(r[col.right]);
    const bright = col.brightness ? toNum(r[col.brightness]) : NaN;
    if (Number.isFinite(left) && Number.isFinite(right)) {
      series.push({ frame, left, right, bright });
    }
  }
  if (!series.length) throw new Error('No valid numeric rows found');

  const leftArr = series.map(s => s.left);
  const rightArr = series.map(s => s.right);
  const brightArr = series.map(s => s.bright).filter(v => Number.isFinite(v));

  // Simple summary stats
  const L_mean = mean(leftArr);
  const R_mean = mean(rightArr);
  const L_std = std(leftArr, L_mean);
  const R_std = std(rightArr, R_mean);
  const asym = Math.abs(L_mean - R_mean);
  const stv = std(leftArr.concat(rightArr));

  // Brightness correlation if brightness exists
  let corr_L_B = NaN, corr_R_B = NaN;
  if (brightArr.length) {
    corr_L_B = corr(leftArr.slice(0, brightArr.length), brightArr);
    corr_R_B = corr(rightArr.slice(0, brightArr.length), brightArr);
  }

  const summary = {
    left: { mean: L_mean.toFixed(3), std: L_std.toFixed(3) },
    right: { mean: R_mean.toFixed(3), std: R_std.toFixed(3) },
    asym_mm: asym.toFixed(3),
    short_term_variability: stv.toFixed(3),
    brightness_corr: {
      left: Number.isFinite(corr_L_B) ? corr_L_B.toFixed(3) : null,
      right: Number.isFinite(corr_R_B) ? corr_R_B.toFixed(3) : null,
    }
  };

  // ---- ML Prediction ----
  let ml_prediction = null;
  try {
    const mlBase = process.env.ML_BASE_URL || 'http://localhost:8000';
    const mlRes = await fetch(`${mlBase}/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        n: series.length,
        L_mean, R_mean,
        L_std, R_std,
        asym,
        corr_L_B: Number.isFinite(corr_L_B) ? corr_L_B : 0.0,
        corr_R_B: Number.isFinite(corr_R_B) ? corr_R_B : 0.0,
        stv,
      }),
    });
    if (mlRes.ok) {
      ml_prediction = await mlRes.json();
    } else {
      console.error('ML service error:', mlRes.status);
    }
  } catch (e) {
    console.error('Error calling ML service:', e.message);
  }

  return {
    n_rows: series.length,
    summary,
    diagnosis_final: ml_prediction?.label || 'Review Recommended',
    ml_prediction,
    conditions: ml_prediction?.proba
      ? Object.entries(ml_prediction.proba).map(([condition, confidence]) => ({ condition, confidence }))
      : [],
  };
}
