// backend/services/parkinsonAnalyzer.js
import { parse } from 'csv-parse/sync';

const NUM = (v) => {
  const n = typeof v === 'string' ? v.trim() : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : NaN;
};
const mean = (arr) => arr.reduce((a,b)=>a+b,0) / (arr.length || 1);
const std = (arr) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s,v)=>s + Math.pow(v - m, 2), 0) / (arr.length || 1));
};
function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n === 0) return NaN;
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx  += a * a;
    dy  += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : (num / den);
}
function normalizeHeader(h) {
  const k = h.trim().toLowerCase();
  if (k.includes('timestamp')) return 'timestamp';
  if (k.includes('frame')) return 'frame';
  if (k.includes('left pupil') && k.includes('mm')) return 'lmm';
  if (k.includes('right pupil') && k.includes('mm')) return 'rmm';
  if (k.includes('brightness')) return 'brightness';
  if (k.includes('illuminance')) return 'illuminance';
  return k;
}

export function analyzeCsvBuffer(buf, fps = 30) {
  const text = buf.toString('utf8');
  const records = parse(text, { columns: true, skip_empty_lines: true });
  const rows = records.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = v;
    return out;
  });

  const left = [], right = [], bright = [], illum = [], frames = [];
  for (const r of rows) {
    const l = NUM(r.lmm); if (!Number.isNaN(l)) left.push(l);
    const rr = NUM(r.rmm); if (!Number.isNaN(rr)) right.push(rr);
    const b = NUM(r.brightness); if (!Number.isNaN(b)) bright.push(b);
    const i = NUM(r.illuminance); if (!Number.isNaN(i)) illum.push(i);
    const f = NUM(r.frame); if (!Number.isNaN(f)) frames.push(f);
  }

  const leftMean = left.length ? Number(mean(left).toFixed(3)) : null;
  const rightMean = right.length ? Number(mean(right).toFixed(3)) : null;
  const leftStd  = left.length ? Number(std(left).toFixed(3)) : null;
  const rightStd = right.length ? Number(std(right).toFixed(3)) : null;
  const corrBLeft  = Number(pearson(bright, left).toFixed(3));
  const corrBRight = Number(pearson(bright, right).toFixed(3));
  const corrILeft  = Number(pearson(illum, left).toFixed(3));
  const corrIRight = Number(pearson(illum, right).toFixed(3));
  const asym = (leftMean != null && rightMean != null) ? Number(Math.abs(leftMean - rightMean).toFixed(3)) : null;

  let durationSec = null;
  if (frames.length) {
    const minF = Math.min(...frames);
    const maxF = Math.max(...frames);
    durationSec = Number(((maxF - minF + 1) / fps).toFixed(2));
  }

  const reasons = [];
  if (asym != null && asym > 0.5) reasons.push('Left/Right asymmetry > 0.5 mm');
  if (leftStd != null && leftStd < 0.1) reasons.push('Left pupil variability very low');
  if (rightStd != null && rightStd < 0.1) reasons.push('Right pupil variability very low');
  const corrFlags = [corrBLeft, corrBRight, corrILeft, corrIRight].filter(v => Number.isFinite(v) && Math.abs(v) >= 0.2);
  if (corrFlags.length) reasons.push('Pupil size correlated with brightness/illuminance');

  const diagnosis = reasons.length ? 'review_recommended' : 'ok';

  return {
    n_rows: rows.length,
    duration_sec: durationSec,
    summary: {
      left: { mean: leftMean, std: leftStd },
      right: { mean: rightMean, std: rightStd },
      asym_mm: asym,
      brightness_corr: { left: corrBLeft, right: corrBRight },
      illuminance_corr: { left: corrILeft, right: corrIRight },
      fps
    },
    diagnosis,
    reasons
  };
}
