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
  const denom = Math.sqrt(da * db);
  return denom === 0 ? NaN : (num / denom);
}

/** Map CSV headers */
function mapColumns(row0) {
  const col = {};
  for (const key of Object.keys(row0)) {
    const nk = key.toLowerCase().trim();
    if (nk.includes('frame')) col.frame = key;
    if (nk.includes('left') && nk.includes('pupil')) col.left = key;
    if (nk.includes('right') && nk.includes('pupil')) col.right = key;
    if (nk.includes('illuminance') || nk.includes('lux') || nk.includes('brightness')) col.brightness = key;
    if (nk.includes('depth') || nk.includes('distance')) col.depth = key;
  }
  if (!col.left || !col.right) throw new Error('CSV must include Left/Right Pupil Size columns');
  if (!col.brightness) throw new Error('CSV must include Illuminance / Brightness column');
  if (!col.depth) throw new Error('CSV must include Depth column');
  return col;
}

/** Build human-readable reasons per condition from features */
function reasonsByCondition(conf, f) {
  // f: feature object containing L_mean,R_mean,L_std,R_std,asym,stv,corr_b_l,corr_b_r,corr_d_l,corr_d_r
  const r = {};

  const hiVar   = (f.L_std > 0.20 || f.R_std > 0.20 || f.stv > 0.25);
  const loVar   = (f.L_std < 0.08 && f.R_std < 0.08 && f.stv < 0.12);
  const asymHi  = (f.asym > 0.4);
  const asymMod = (f.asym > 0.2 && f.asym <= 0.4);
  const corrBpos = (f.corr_b_l > 0.4 && f.corr_b_r > 0.4);
  const corrBneg = (f.corr_b_l < -0.35 && f.corr_b_r < -0.35);
  const corrDpos = (f.corr_d_l > 0.3 && f.corr_d_r > 0.3);
  const corrDneg = (f.corr_d_l < -0.3 && f.corr_d_r < -0.3);
  const weakCorr = (Math.abs(f.corr_b_l) < 0.2 && Math.abs(f.corr_b_r) < 0.2);

  // Parkinson
  r.parkinson = [];
  if (loVar) r.parkinson.push('Low short-term variability in pupil size');
  if (weakCorr) r.parkinson.push('Weak coupling with illuminance');
  if (!asymMod && !asymHi) r.parkinson.push('Minimal L/R asymmetry');

  // Alzheimer’s
  r.alzheimers = [];
  if (asymHi || asymMod) r.alzheimers.push('Pronounced left/right asymmetry');
  if (!loVar) r.alzheimers.push('Moderate variability observed');

  // High Stress
  r.stress = [];
  if (hiVar) r.stress.push('Elevated variability (std/stv) consistent with arousal');
  if (corrBpos) r.stress.push('Strong positive correlation with illuminance');

  // PTSD
  r.ptsd = [];
  if (!asymHi && !asymMod) r.ptsd.push('Small L/R asymmetry');
  if (corrBneg) r.ptsd.push('Negative correlation with illuminance (pupil constriction under brightening)');

  // ADHD
  r.adhd = [];
  if (hiVar && weakCorr) r.adhd.push('High variability with weak brightness coupling');
  if (corrDpos) r.adhd.push('Positive association with depth (task/engagement-like changes)');

  // Depression
  r.depression = [];
  if (loVar) r.depression.push('Reduced variability across frames');
  if (corrDneg) r.depression.push('Inverse association with depth');

  // Clear / Review Recommended
  r.clear = [];
  if (!hiVar && !asymHi && !asymMod && weakCorr) r.clear.push('Stable bilateral response with minimal asymmetry');

  r.review_recommended = ['Insufficient signal separation across features'];

  // Return per item in conf (array of {condition, confidence})
  return conf.map((item) => {
    const key = String(item.condition || '').toLowerCase();
    const reasons = r[key] && r[key].length ? r[key] : [];
    return { ...item, reasons };
  });
}

/** ---- Main ---- */
export async function analyzeCsvBuffer(csvBuffer) {
  const t0 = Date.now();

  const text = csvBuffer.toString('utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('CSV is empty');

  const col = mapColumns(rows[0]);
  const series = [];
  for (const r of rows) {
    const frame = col.frame ? toNum(r[col.frame]) : series.length;
    const left = toNum(r[col.left]);
    const right = toNum(r[col.right]);
    const bright = toNum(r[col.brightness]);        // now required
    const depth = toNum(r[col.depth]);              // now required
    if ([left, right, bright, depth].every(Number.isFinite)) {
      series.push({ frame, left, right, bright, depth });
    }
  }
  if (!series.length) throw new Error('No valid numeric rows found');

  const leftArr   = series.map(s => s.left);
  const rightArr  = series.map(s => s.right);
  const brightArr = series.map(s => s.bright);
  const depthArr  = series.map(s => s.depth);

  // Simple summary stats
  const L_mean = mean(leftArr);
  const R_mean = mean(rightArr);
  const L_std  = std(leftArr, L_mean);
  const R_std  = std(rightArr, R_mean);
  const asym   = Math.abs(L_mean - R_mean);
  const stv    = std(leftArr.concat(rightArr));

  // Correlations (brightness & depth)
  const corr_L_B = corr(leftArr,  brightArr);
  const corr_R_B = corr(rightArr, brightArr);
  const corr_L_D = corr(leftArr,  depthArr);
  const corr_R_D = corr(rightArr, depthArr);

  const features = {
    L_mean, R_mean, L_std, R_std, asym, stv,
    corr_b_l: Number.isFinite(corr_L_B) ? corr_L_B : 0,
    corr_b_r: Number.isFinite(corr_R_B) ? corr_R_B : 0,
    corr_d_l: Number.isFinite(corr_L_D) ? corr_L_D : 0,
    corr_d_r: Number.isFinite(corr_R_D) ? corr_R_D : 0
  };

  const summary = {
    left:  { mean: +L_mean.toFixed(3), std: +L_std.toFixed(3) },
    right: { mean: +R_mean.toFixed(3), std: +R_std.toFixed(3) },
    asymmetry_mm: +asym.toFixed(3),
    stv_bilateral: +stv.toFixed(3),
    corr_brightness: {
      left: +features.corr_b_l.toFixed(3),
      right: +features.corr_b_r.toFixed(3),
    },
    corr_depth: {
      left: +features.corr_d_l.toFixed(3),
      right: +features.corr_d_r.toFixed(3),
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
        corr_L_B: features.corr_b_l,
        corr_R_B: features.corr_b_r,
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

  // Build conditions array + reasons
  const baseConds = ml_prediction?.proba
    ? Object.entries(ml_prediction.proba)
        .map(([condition, confidence]) => ({ condition, confidence }))
    : [];

  const conditionsWithReasons = reasonsByCondition(baseConds, features);

  const elapsed = Date.now() - t0;

  return {
    n_rows: series.length,
    summary,
    diagnosis_final: ml_prediction?.label || 'Review Recommended',
    ml_prediction,
    conditions: conditionsWithReasons,
    // NOTE: keep internal timings out of response; caller wraps with response_time_ms
    _internal_ms: elapsed
  };
}
