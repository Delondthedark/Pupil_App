// backend/services/p_analyzer.js
// ESM module
import { parse } from 'csv-parse/sync';

/** -------- Utilities -------- */
const toNum = (v) => {
  if (v == null) return NaN;
  const s = String(v).replace(/[^\d.\-eE]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = (a, m = mean(a)) =>
  Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length || 1));

const pearson = (x, y) => {
  const n = Math.min(x.length, y.length);
  if (!n) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : NaN;
};

const safeRound = (x, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
const normKey = (k) => (k || '').toLowerCase().trim();

/** Map header names robustly */
function mapColumns(row0) {
  const col = {};
  for (const key of Object.keys(row0)) {
    const nk = normKey(key);
    if (nk.includes('frame')) col.frame = key;
    if (nk.includes('left') && nk.includes('pupil')) col.left = key;
    if (nk.includes('right') && nk.includes('pupil')) col.right = key;
    if (nk.includes('bright')) col.brightness = key;
    if (nk.includes('illuminance') || nk.includes('lux')) col.ill = key;
  }
  if (!col.left || !col.right) throw new Error('CSV must include Left/Right Pupil Size columns');
  return col;
}

/** Downsample for UI */
function downsample(series, maxPts = 200) {
  const step = Math.max(1, Math.floor(series.length / maxPts));
  const out = [];
  for (let i = 0; i < series.length; i += step) {
    const s = series[i];
    out.push({ frame: s.frame, left_mm: s.left, right_mm: s.right });
  }
  return out;
}

/** Helpers for scoring */
const lin = (x, a, b) => {
  if (!Number.isFinite(x)) return 0;
  if (a === b) return 0;
  const t = (x - a) / (b - a);
  return Math.max(0, Math.min(1, t));
};
const tri = (x, c, w) => {
  if (!Number.isFinite(x)) return 0;
  const d = Math.abs(x - c);
  return Math.max(0, 1 - d / w);
};

// short-term variability as rolling window std (window ~5)
function shortTermVar(arr) {
  const w = 5;
  if (arr.length < 2) return 0;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const s = Math.max(0, i - Math.floor(w / 2));
    const e = Math.min(arr.length, s + w);
    const seg = arr.slice(s, e);
    out.push(std(seg));
  }
  return mean(out || [0]);
}

/** -------- Heuristic scoring for 4 conditions --------
 *  PRELIMINARY, non-diagnostic indicators. Tunable thresholds.
 */
function scoreConditions({ leftArr, rightArr, brightArr }) {
  const Lm = mean(leftArr);
  const Rm = mean(rightArr);
  const Ls = std(leftArr, Lm);
  const Rs = std(rightArr, Rm);
  const asym = Math.abs(Lm - Rm);

  const varAvg = (Ls + Rs) / 2;
  const stv = (shortTermVar(leftArr) + shortTermVar(rightArr)) / 2;

  // brightness correlation if complete
  let corrL = NaN, corrR = NaN, corrAvg = NaN;
  const haveFullBrightness = Array.isArray(brightArr) && brightArr.length === leftArr.length;
  if (haveFullBrightness) {
    corrL = pearson(brightArr, leftArr);
    corrR = pearson(brightArr, rightArr);
    corrAvg = (corrL + corrR) / 2;
  }

  // ---- Scoring (0..1) ----
  // Parkinson: very low variability; weak |corr|; penalize asymmetry
  const parkLowVar   = lin(0.08 - varAvg, 0, 0.08);                 // 1 @ 0, 0 @ >=0.08
  const parkWeakCorr = haveFullBrightness ? lin(0.3 - Math.abs(corrAvg), 0, 0.3) : 0.5;
  const parkAsymPen  = 1 - lin(asym, 0.25, 1.2);
  const parkinsonScore = 0.6 * parkLowVar + 0.25 * parkWeakCorr + 0.15 * parkAsymPen;

  // Alzheimer’s: strong asymmetry + moderate variability; weak corr slightly preferred
  const alzAsym   = lin(asym, 0.3, 1.2);
  const alzVarMid = tri(varAvg, 0.22, 0.12);
  const alzWeakC  = haveFullBrightness ? lin(0.25 - Math.abs(corrAvg), 0, 0.25) : 0.4;
  const alzScore  = 0.6 * alzAsym + 0.3 * alzVarMid + 0.1 * alzWeakC;

  // High Stress: high short-term variability + large |corr| + higher overall var
  const stressSTV  = lin(stv, 0.15, 0.55);
  const stressCorr = haveFullBrightness ? lin(Math.abs(corrAvg), 0.15, 0.6) : 0.3;
  const stressVar  = lin(varAvg, 0.15, 0.6);
  const stressScore = 0.5 * stressSTV + 0.3 * stressCorr + 0.2 * stressVar;

  // PTSD: negative correlation + moderate variability + small asymmetry
  const negCorr   = haveFullBrightness ? lin(-corrAvg, 0.15, 0.6) : 0;
  const varMid    = tri(varAvg, 0.22, 0.12);
  const asymSmall = 1 - lin(asym, 0.25, 1.0);
  const ptsdScore = 0.6 * negCorr + 0.25 * varMid + 0.15 * asymSmall;

  const raw = {
    parkinson: Math.max(0, Math.min(1, parkinsonScore)),
    alzheimers: Math.max(0, Math.min(1, alzScore)),
    stress: Math.max(0, Math.min(1, stressScore)),
    ptsd: Math.max(0, Math.min(1, ptsdScore)),
  };

  // confidences (normalized 0..1)
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const conf = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number((v / total).toFixed(3))]));

  // choose primary (require minimum signal)
  let primary = 'clear';
  let maxK = null, maxV = -1;
  for (const [k, v] of Object.entries(raw)) {
    if (v > maxV) { maxV = v; maxK = k; }
  }
  if (maxV >= 0.35) primary = maxK;

  return {
    summary: {
      left:  { mean: safeRound(Lm), std: safeRound(Ls) },
      right: { mean: safeRound(Rm), std: safeRound(Rs) },
      asym_mm: safeRound(asym),
      brightness_corr: {
        left:  safeRound(corrL),
        right: safeRound(corrR),
      },
      short_term_variability: safeRound(stv),
    },
    primary,
    scores: raw,
    confidences: conf,
  };
}

/** -------- Public: analyzeCsvBuffer -------- */
export function analyzeCsvBuffer(csvBuffer) {
  const text = csvBuffer.toString('utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('CSV is empty');

  const col = mapColumns(rows[0]);

  // Build numeric series (keep only rows with both pupils numeric)
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

  // brightness array only if all rows have finite values
  const haveFullBrightness = series.every(s => Number.isFinite(s.bright));
  const brightArr = haveFullBrightness ? series.map(s => s.bright) : null;

  // Score conditions
  const scored = scoreConditions({ leftArr, rightArr, brightArr });

  // Reasons (human readable)
  const reasons = [];
  const { left, right, asym_mm, brightness_corr, short_term_variability } = scored.summary;
  if (scored.primary === 'parkinson') {
    if ((left?.std ?? 1) < 0.08 || (right?.std ?? 1) < 0.08) reasons.push('Very low pupil variability');
    if ((asym_mm ?? 0) > 0.5) reasons.push('Asymmetry present but Parkinson favored by flat response');
    if (brightness_corr && (Math.abs(brightness_corr.left ?? 0) < 0.1 && Math.abs(brightness_corr.right ?? 0) < 0.1)) {
      reasons.push('Weak correlation with brightness');
    }
  }
  if (scored.primary === 'alzheimers') {
    if ((asym_mm ?? 0) > 0.5) reasons.push(`Left/Right asymmetry ${asym_mm} mm > 0.5 mm`);
    if ((left?.std ?? 0) > 0.08 && (right?.std ?? 0) > 0.08) reasons.push('Moderate variability (not ultra-flat)');
  }
  if (scored.primary === 'stress') {
    if ((short_term_variability ?? 0) > 0.25) reasons.push(`High short-term variability ~ ${short_term_variability}`);
    if (brightness_corr && (Math.abs(brightness_corr.left ?? 0) > 0.2 || Math.abs(brightness_corr.right ?? 0) > 0.2)) {
      reasons.push('Pupil size tracks brightness strongly');
    }
  }
  if (scored.primary === 'ptsd') {
    const l = brightness_corr?.left ?? 0, r = brightness_corr?.right ?? 0;
    if (l < -0.15 || r < -0.15) reasons.push(`Inverse brightness correlation (L=${l}, R=${r})`);
    if ((asym_mm ?? 0) < 0.3) reasons.push('Small asymmetry');
  }
  if (!reasons.length) reasons.push('No strong single indicator; overall response looks typical');

  // Compose final response
  const samples = downsample(series);

  const conditions = Object.entries(scored.confidences).map(([condition, confidence]) => ({
    condition,                                  // 'parkinson' | 'alzheimers' | 'stress' | 'ptsd'
    confidence: Number(confidence),             // 0..1 normalized
    score: Number(scored.scores[condition].toFixed(3)), // raw score 0..1
  }));

  // Map primary to UI-friendly string
  let diag = scored.primary;
  if (diag === 'parkinson') diag = 'Parkinson';
  else if (diag === 'alzheimers') diag = "Alzheimer's";
  else if (diag === 'stress') diag = 'Stress';
  else if (diag === 'ptsd') diag = 'PTSD';

  return {
    n_rows: series.length,
    summary: scored.summary,
    diagnosis: diag,   // string only (UI-safe)
    conditions,
    reasons,
    samples,
  };
}
