// backend/services/p_analyzer.js

const HEADERS_HINT = {
  left:  ['left','left_mm','l_pupil','pupil_l','lpupil','leftpupil','left_pupil','left (mm)'],
  right: ['right','right_mm','r_pupil','pupil_r','rpupil','rightpupil','right_pupil','right (mm)'],
  bright:['brightness','bright','illum','luma','light','brightness_lux'],
  depth: ['depth','z','distance','range','z_mm']
};

function findCol(headers, wanted) {
  const lc = headers.map(h => (h ?? '').toString().trim().toLowerCase());
  for (const name of wanted) {
    const i = lc.indexOf(name);
    if (i !== -1) return headers[i];
  }
  for (const name of wanted) {
    const i = lc.findIndex(h => h.includes(name));
    if (i !== -1) return headers[i];
  }
  return null;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

export function normalizeAndSummarize(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) { const e = new Error('empty_csv'); e.code = 'empty_csv'; throw e; }

  const headers = Object.keys(rows[0]);
  const cLeft   = findCol(headers, HEADERS_HINT.left);
  const cRight  = findCol(headers, HEADERS_HINT.right);
  const cBright = findCol(headers, HEADERS_HINT.bright);
  const cDepth  = findCol(headers, HEADERS_HINT.depth);

  if (!cLeft || !cRight) {
    const msg = `CSV must include Left/Right Pupil columns (accepted: ${HEADERS_HINT.left.join('/')}, ${HEADERS_HINT.right.join('/')})`;
    const err = new Error(msg); err.code = 'missing_left_right'; throw err;
  }

  const series = rows.map(r => ({
    left: Number(r[cLeft]),
    right: Number(r[cRight]),
    brightness: cBright ? Number(r[cBright]) : null,
    depth: cDepth ? Number(r[cDepth]) : null
  })).filter(r => Number.isFinite(r.left) && Number.isFinite(r.right));

  if (!series.length) { const e = new Error('no_numeric_rows'); e.code = 'no_numeric_rows'; throw e; }

  const n = series.length;
  const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
  const std  = arr => { const m = mean(arr); return Math.sqrt(arr.reduce((s,x)=>s+(x-m)*(x-m),0)/(arr.length||1)); };
  const L = series.map(s=>s.left);
  const R = series.map(s=>s.right);
  const bright = cBright ? series.map(s=>s.brightness) : null;
  const depth  = cDepth  ? series.map(s=>s.depth)      : null;

  function corr(a, b) {
    const mA = mean(a), mB = mean(b);
    let num=0, dA=0, dB=0;
    for (let i=0;i<a.length;i++){ const x=a[i]-mA, y=b[i]-mB; num+=x*y; dA+=x*x; dB+=y*y; }
    const den = Math.sqrt(dA*dB);
    return den ? num/den : 0;
  }

  return {
    n_rows: n,
    summary: {
      left:  { mean: +mean(L).toFixed(3), std: +std(L).toFixed(3) },
      right: { mean: +mean(R).toFixed(3), std: +std(R).toFixed(3) },
      asymmetry_mm: +Math.abs(mean(L)-mean(R)).toFixed(3),
      stv_bilateral: +std(L.concat(R)).toFixed(3),
      corr_brightness: bright ? { left: +corr(L, bright).toFixed(3), right: +corr(R, bright).toFixed(3) } : null,
      corr_depth: depth ? { left: +corr(L, depth).toFixed(3), right: +corr(R, depth).toFixed(3) } : null
    }
  };
}

/** ── Compatibility export for legacy callers (e.g., parkinsonAnalyze.js) ── */
export function analyzeCsvBuffer(bufferOrString) {
  const text = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('utf8')
    : String(bufferOrString ?? '');
  return normalizeAndSummarize(text);
}
