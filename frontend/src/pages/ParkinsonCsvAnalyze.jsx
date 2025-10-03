// src/pages/ParkinsonCsvAnalyze.jsx
import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function ParkinsonCsvAnalyze() {
  const API = process.env.REACT_APP_API_BASE_URL;       // e.g. http://localhost:3001
  const DEFAULT_SECRET = process.env.REACT_APP_INGEST_SECRET || '';
  const { token } = useAuth();

  // UI + state
  const [mode, setMode] = useState('test');             // 'test' | 'partner'
  const [secret, setSecret] = useState(DEFAULT_SECRET);
  const [analyze, setAnalyze] = useState(true);
  const [metaText, setMetaText] = useState('{\n  "testId": "abc123"\n}');

  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [respHeaderMs, setRespHeaderMs] = useState(null); // capture X-Response-Time-Ms

  const fileInputRef = useRef(null);
  const endpoint = mode === 'partner' ? `${API}/api/ingest` : `${API}/api/ingest/test`;

  // --- helpers ---
  const fileToBase64 = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        resolve(s.includes(',') ? s.split(',')[1] : s);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const onPick = (f) => {
    setResult(null);
    setError('');
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.');
      return;
    }
    setFile(f);
  };

  const onBrowse = (e) => onPick(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer?.files?.[0];
    onPick(f);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setRespHeaderMs(null);
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }

    try {
      setBusy(true);
      let res;

      if (mode === 'partner') {
        let meta = {};
        if (metaText.trim()) {
          try { meta = JSON.parse(metaText); }
          catch { throw new Error('Meta must be valid JSON.'); }
        }
        if (!secret) throw new Error('Shared secret is required in Partner mode.');

        const fileBase64 = await fileToBase64(file);
        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shared-Secret': secret,
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            fileName: file.name,
            fileBase64,
            contentType: 'text/csv',
            meta,
            analyze
          })
        });
      } else {
        const fd = new FormData();
        fd.append('file', file, file.name);
        res = await fetch(endpoint, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: fd
        });
      }

      // capture final response time header if present
      const headerMs = res.headers.get('x-response-time-ms');
      if (headerMs != null) setRespHeaderMs(headerMs);

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status}). Raw response: ${text.slice(0, 240)}…`);
        } else {
          throw new Error('Unexpected response (not JSON).');
        }
      }
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadJSON = () => {
    const view = result?.analysis ?? result ?? null;
    if (!view) return;
    const blob = new Blob([JSON.stringify(view, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parkinson_analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Normalize for display
  const view = useMemo(() => result?.analysis ?? result ?? null, [result]);

  // ---------------- schema-tolerant summary normalizer (old & new analyzer keys) ----------------
  function fmt(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : String(v);
  }
  function normalizeSummary(s = {}) {
    const left  = s.left  ?? {};
    const right = s.right ?? {};
    return {
      left:  { mean: Number(left.mean),  std: Number(left.std) },
      right: { mean: Number(right.mean), std: Number(right.std) },
      asymmetry_mm: s.asymmetry_mm ?? s.asym_mm ?? null,
      stv_bilateral: s.stv_bilateral ?? s.short_term_variability ?? s.stv ?? null,
      corr_brightness: s.corr_brightness ?? s.brightness_corr ?? null,
      corr_depth: s.corr_depth ?? s.depth_corr ?? null,
    };
  }
  const norm = useMemo(() => normalizeSummary(view?.summary || {}), [view]);
  // ---------------------------------------------------------------------------------------------

  // Derive a clean diagnosis label + style (handles string OR {condition, confidence})
  const diagLabel = view?.diagnosis_final || '—';
  const diagKey = String(diagLabel || '').toLowerCase();

  // Optional: list of condition scores if backend provides them
  // Accepts either `conditions: [{condition, confidence}]` or `scores: [{label, score}]`
  const scoredConditions = useMemo(() => {
    const arrA = Array.isArray(view?.conditions) ? view.conditions : [];
    const arrB = Array.isArray(view?.scores)
      ? view.scores.map(s => ({ condition: s.label, confidence: s.score }))
      : [];
    const merged = [...arrA, ...arrB];
    const seen = new Set();
    const out = [];
    for (const item of merged) {
      const key = (item?.condition || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [view]);

  // final response time: prefer body field, else header
  const finalResponseMs = useMemo(() => {
    if (result?.response_time_ms != null) return Number(result.response_time_ms);
    if (respHeaderMs != null) return Number(respHeaderMs);
    return null;
  }, [result, respHeaderMs]);

  const curlSnippet = useMemo(() => {
    if (mode === 'partner') {
      const sec = secret || 'YOUR_SECRET';
      return `b64=$(base64 -i "/path/to/your.csv" | tr -d '\\n')

curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-Shared-Secret: ${sec}"${
    token ? ` \\\n  -H "Authorization: Bearer ${token}"` : ''
  } \\
  -d '{
    "fileName": "your.csv",
    "fileBase64": "'"$b64"'",
    "contentType": "text/csv",
    "meta": ${metaText || '{}'},
    "analyze": ${String(analyze)}
  }'`;
    }
    return `curl -X POST ${endpoint} \\
  ${token ? `-H "Authorization: Bearer ${token}" \\\n  ` : ''}-F 'file=@"/path/to/your.csv"'`;
  }, [mode, endpoint, secret, token, metaText, analyze]);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <h2 style={S.hTitle}>CSV Analysis</h2>
        <div style={S.hSub}>Upload a pupil-tracking CSV to analyze preliminary markers.</div>
      </div>

      {/* Mode Switch */}
      <div style={S.card}>
        <div style={S.tabs}>
          <button
            type="button"
            onClick={() => setMode('test')}
            style={{ ...S.tab, ...(mode === 'test' ? S.tabActive : {}) }}
          >
            UI Test (multipart)
          </button>
          <button
            type="button"
            onClick={() => setMode('partner')}
            style={{ ...S.tab, ...(mode === 'partner' ? S.tabActive : {}) }}
          >
            Partner JSON (base64 + secret)
          </button>
        </div>

        {mode === 'partner' && (
          <div style={S.panel}>
            <div style={S.row}>
              <label style={S.label}>Shared secret</label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="X-Shared-Secret"
                style={S.input}
              />
            </div>
            <div style={S.row}>
              <label style={{ ...S.label, width: 'auto' }}>
                <input
                  type="checkbox"
                  checked={analyze}
                  onChange={(e) => setAnalyze(e.target.checked)}
                />{' '}
                Analyze on upload
              </label>
            </div>
            <div style={S.rowCol}>
              <label style={S.label}>Meta (JSON)</label>
              <textarea
                rows={5}
                value={metaText}
                onChange={(e) => setMetaText(e.target.value)}
                style={S.textarea}
                spellCheck={false}
              />
            </div>
          </div>
        )}

        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          style={S.drop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Upload CSV"
          title="Click to choose file or drag & drop"
        >
          <div style={S.dropIcon}>📄</div>
          <div style={S.dropTitle}>Drop CSV here or click to choose</div>
          <div style={S.dropHint}>
            Accepted: .csv (Left/Right pupil size, <strong>Illuminance</strong> &amp; <strong>depth</strong> required)
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={onBrowse}
          />
        </div>

        {/* Chosen file */}
        {file && (
          <div style={S.fileRow}>
            <div style={S.fileName}>📎 {file.name}</div>
            <button type="button" onClick={clearFile} style={S.linkBtn}>Remove</button>
          </div>
        )}

        {/* Action */}
        <div style={S.actions}>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy || !file}
            style={{ ...S.primaryBtn, opacity: busy || !file ? 0.7 : 1 }}
          >
            {busy ? 'Analyzing…' : 'Upload & Analyze'}
          </button>
        </div>

        {/* Error */}
        {error && <div style={S.error}>{error}</div>}
      </div>

      {/* Result */}
      {result && (
        <div style={{ ...S.card, marginTop: 16 }}>
          <h3 style={S.sectionTitle}>Result</h3>

          {result?.stored?.path && (
            <div style={S.smallNote}>
              Stored at: <code>{result.stored.path}</code>
            </div>
          )}

          {/* final response time */}
          {finalResponseMs != null && (
            <div style={S.smallNote}>
              Response time: <strong>{finalResponseMs.toFixed(1)} ms</strong>
            </div>
          )}

          <div style={S.grid}>
            <KV k="Rows" v={view?.n_rows ?? '—'} />
            <KV
              k="Diagnosis"
              v={
                <span style={{ ...S.badge, ...badgeStyle(diagKey) }}>
                  {diagLabel}
                </span>
              }
            />
            <KV k="Left (mean ± std)"  v={`${fmt(norm.left?.mean)} ± ${fmt(norm.left?.std)}`} />
            <KV k="Right (mean ± std)" v={`${fmt(norm.right?.mean)} ± ${fmt(norm.right?.std)}`} />
            <KV k="Asymmetry (mm)"     v={fmt(norm.asymmetry_mm)} />
            <KV k="STV (bilateral)"    v={fmt(norm.stv_bilateral)} />
            <KV
              k="Brightness corr (L / R)"
              v={
                norm.corr_brightness
                  ? `${fmt(norm.corr_brightness.left)} / ${fmt(norm.corr_brightness.right)}`
                  : '— / —'
              }
            />
            <KV
              k="Depth corr (L / R)"
              v={
                norm.corr_depth
                  ? `${fmt(norm.corr_depth.left)} / ${fmt(norm.corr_depth.right)}`
                  : '— / —'
              }
            />
          </div>

          {/* Optional: show per-condition confidences if provided */}
          {scoredConditions.length > 0 && (
            <>
              <h4 style={S.subTitle}>Condition likelihoods</h4>
              <div style={{ display: 'grid', gap: 8 }}>
                {scoredConditions.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 14 }}>{prettyCond(c.condition)}</div>
                    <div style={{ height: 10, background: '#eef5fa', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(0, Math.min(100, Math.round((c.confidence || 0) * 100)))}%`,
                        height: '100%',
                        background: COLORS.brand
                      }} />
                    </div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round((c.confidence || 0) * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {Array.isArray(view?.reasons) && view.reasons.length > 0 && (
            <>
              <h4 style={S.subTitle}>Reasons</h4>
              <ul style={S.reasonList}>
                {view.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <button onClick={downloadJSON} style={S.secondaryBtn}>⬇️ Download JSON</button>
          </div>

          {/* Debug timings (hidden by default if not present) */}
          {view?.timings && (
            <details style={{ marginTop: 12 }}>
              <summary>Debug: timings</summary>
              <pre style={S.pre}>{JSON.stringify(view.timings, null, 2)}</pre>
            </details>
          )}
        </div> 
      )}

      {/* Debug cURL */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <details>
          <summary>Debug: cURL</summary>
        <pre style={S.pre}>{curlSnippet}</pre>
        </details>
      </div>
    </div>
  );
}


/* ---------- Small presentational helpers ---------- */
function KV({ k, v }) {
  return (
    <div style={S.kv}>
      <div style={S.k}>{k}</div>
      <div style={S.v}>{v}</div>
    </div>
  );
}

function prettyCond(k) {
  const key = String(k || '').toLowerCase();
  if (key === 'ptsd') return 'PTSD';
  if (key === 'high_stress' || key === 'stress') return 'High Stress';
  if (key === 'parkinson') return 'Parkinson’s';
  if (key === 'alzheimers' || key === 'alzheimer') return 'Alzheimer’s';
  if (key === 'depression') return 'Depression';
  if (key === 'adhd') return 'ADHD';
  if (key === 'clear' || key === 'ok') return 'Clear';
  if (key === 'review_recommended') return 'Review Recommended';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function badgeStyle(diagKey) {
  if (!diagKey) return {};
  const d = String(diagKey).toLowerCase();
  if (d === 'clear' || d === 'ok')
    return { background: '#E6FFFB', color: '#00796B', border: '1px solid #B2F5EA' };
  if (d === 'flagged')
    return { background: '#FFEDED', color: '#B71C1C', border: '1px solid #F5C2C2' };
  // PTSD / High Stress / Parkinson / Alzheimer / review_recommended / others
  return { background: '#FFF7E6', color: '#8B5E00', border: '1px solid #FFE58F' };
}

/* ---------- Styles (brand-aligned, clean) ---------- */
const COLORS = {
  brand: '#1B5A72',
  text: '#2E4057',
  cardBorder: '#e8edf2',
  note: '#6b7a89',
};

const S = {
  page: { maxWidth: 980, margin: '0 auto', padding: '16px', color: COLORS.text, fontFamily: 'Segoe UI, sans-serif' },

  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  logo: { height: 36, objectFit: 'contain' },
  hTitle: { margin: 0, color: COLORS.brand, fontSize: '1.6rem' },
  hSub: { color: COLORS.note, marginTop: 2 },

  card: {
    background: '#fff',
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
  },

  tabs: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  tab: {
    background: '#F7FBFF',
    border: `1px solid ${COLORS.cardBorder}`,
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    color: COLORS.text,
  },
  tabActive: { background: '#D9F1FF', color: COLORS.brand, fontWeight: 600 },

  panel: {
    background: '#FBFEFF',
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  rowCol: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 },
  label: { width: 140, color: COLORS.note, fontSize: 13 },
  input: { padding: 10, border: '1px solid #d9e6ee', borderRadius: 8, flex: 1 },
  textarea: { padding: 10, border: '1px solid #d9e6ee', borderRadius: 8, width: '100%', fontFamily: 'monospace' },

  drop: {
    marginTop: 8,
    border: '2px dashed #b7d4e2',
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
    background: '#FAFDFF',
    cursor: 'pointer'
  },
  dropIcon: { fontSize: 28, marginBottom: 6 },
  dropTitle: { fontWeight: 600, color: COLORS.brand },
  dropHint: { color: COLORS.note, fontSize: 13 },

  fileRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  fileName: { fontSize: 14 },
  linkBtn: { background: 'transparent', border: 'none', color: COLORS.brand, cursor: 'pointer', fontWeight: 600 },

  actions: { marginTop: 12 },
  primaryBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: COLORS.brand,
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600
  },
  secondaryBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: '1px solid #d9e6ee',
    background: '#fff',
    color: COLORS.brand,
    cursor: 'pointer',
    fontWeight: 600
  },

  error: { marginTop: 12, background: '#fff2f0', color: '#a8071a', padding: '10px 12px', borderRadius: 8, border: '1px solid #ffccc7' },

  sectionTitle: { margin: 0, color: COLORS.brand, marginBottom: 8 },

  smallNote: { fontSize: 13, color: COLORS.note, marginBottom: 8 },

  grid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 8 },
  kv: { background: '#F7FBFF', border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, padding: 10 },
  k: { fontSize: 12, color: '#6c7c8c' },
  v: { fontWeight: 600, marginTop: 2 },

  badge: { padding: '4px 8px', borderRadius: 20, display: 'inline-block', fontWeight: 700, textTransform: 'capitalize' },

  subTitle: { marginTop: 14, marginBottom: 6, color: COLORS.text },
  reasonList: { marginTop: 0, paddingLeft: 18 },

  pre: { background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, overflowX: 'auto', marginTop: 8 },
};
