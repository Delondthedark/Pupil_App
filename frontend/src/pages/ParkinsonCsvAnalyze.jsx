import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function ParkinsonCsvAnalyze() {
  const API = process.env.REACT_APP_API_BASE_URL; // e.g. http://localhost:3001
  const DEFAULT_SECRET = process.env.REACT_APP_INGEST_SECRET || '';
  const { token } = useAuth();

  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // new controls
  const [mode, setMode] = useState('test'); // 'test' | 'partner'
  const [secret, setSecret] = useState(DEFAULT_SECRET);
  const [analyze, setAnalyze] = useState(true);
  const [metaText, setMetaText] = useState('{\n  "patientId": "P001",\n  "testId": "abc123"\n}');

  const onPick = (e) => {
    setResult(null);
    setError('');
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file.');
      return;
    }
    setFile(f);
  };

  const fileToBase64 = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // result like "data:text/csv;base64,AAAA"; we only want the base64 part after the comma
        const s = String(reader.result || '');
        const b64 = s.includes(',') ? s.split(',')[1] : s;
        resolve(b64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(f);
    });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }

    try {
      setBusy(true);

      const endpoint =
        mode === 'partner' ? `${API}/api/ingest` : `${API}/api/ingest/test`;

      let res;

      if (mode === 'partner') {
        // build JSON body with base64 + optional meta + analyze
        let meta = {};
        if (metaText.trim()) {
          try {
            meta = JSON.parse(metaText);
          } catch {
            throw new Error('Meta must be valid JSON.');
          }
        }
        if (!secret) {
          throw new Error('Shared secret is required in Partner mode.');
        }

        const fileBase64 = await fileToBase64(file);

        res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shared-Secret': secret,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fileName: file.name,
            fileBase64,
            contentType: 'text/csv',
            meta,
            analyze,
          }),
        });
      } else {
        // test mode: multipart upload
        const fd = new FormData();
        fd.append('file', file, file.name);
        res = await fetch(endpoint, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: fd,
        });
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new Error(
            `Upload failed (${res.status}). Raw response: ${text.slice(0, 200)}…`
          );
        } else {
          throw new Error('Unexpected response (not JSON).');
        }
      }
      if (!res.ok) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }
      setResult(data);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const downloadJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parkinson_analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Normalize result: backend may return {analysis:{...}} or top-level
  const view = result?.analysis ?? result ?? null;

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>Parkinson CSV Analysis</h2>
      <p style={styles.sub}>
        Upload a CSV with columns like: <code>Left Pupil Size (mm)</code>,{' '}
        <code>Right Pupil Size (mm)</code>, optionally <code>Frame Number</code> and{' '}
        <code>Brightness</code>.
      </p>

      {/* mode switch */}
      <div style={styles.modeRow}>
        <label style={styles.modeLabel}>
          <input
            type="radio"
            name="mode"
            value="test"
            checked={mode === 'test'}
            onChange={() => setMode('test')}
          />
          <span> UI Test (multipart → /api/ingest/test)</span>
        </label>
        <label style={styles.modeLabel}>
          <input
            type="radio"
            name="mode"
            value="partner"
            checked={mode === 'partner'}
            onChange={() => setMode('partner')}
          />
          <span> Partner JSON (base64 + secret → /api/ingest)</span>
        </label>
      </div>

      {/* partner options */}
      {mode === 'partner' && (
        <div style={styles.panel}>
          <div style={styles.row}>
            <label style={styles.lbl}>Shared secret</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="X-Shared-Secret"
              style={styles.input}
            />
          </div>
          <div style={styles.row}>
            <label style={styles.lbl}>
              <input
                type="checkbox"
                checked={analyze}
                onChange={(e) => setAnalyze(e.target.checked)}
              />{' '}
              Analyze on upload
            </label>
          </div>
          <div style={styles.rowCol}>
            <label style={styles.lbl}>Meta (JSON)</label>
            <textarea
              rows={5}
              value={metaText}
              onChange={(e) => setMetaText(e.target.value)}
              style={styles.textarea}
              spellCheck={false}
            />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onPick}
          style={styles.file}
        />
        <button type="submit" style={styles.btn} disabled={busy}>
          {busy ? 'Analyzing…' : 'Upload & Analyze'}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      {result && (
        <div style={styles.card}>
          <h3 style={styles.h3}>Result</h3>

          {result?.stored?.path && (
            <div style={{ marginBottom: 10, fontSize: 13, color: '#6b7a89' }}>
              Stored at: <code>{result.stored.path}</code>
            </div>
          )}

          <div style={styles.grid}>
            <div style={styles.kv}>
              <div style={styles.k}>Rows</div>
              <div style={styles.v}>{view?.n_rows ?? '—'}</div>
            </div>
            <div style={styles.kv}>
              <div style={styles.k}>Diagnosis</div>
              <div style={{ ...styles.badge, ...badgeColor(view?.diagnosis) }}>
                {view?.diagnosis ?? '—'}
              </div>
            </div>
            <div style={styles.kv}>
              <div style={styles.k}>Left (mean ± std)</div>
              <div style={styles.v}>
                {view?.summary?.left?.mean ?? '—'} ± {view?.summary?.left?.std ?? '—'}
              </div>
            </div>
            <div style={styles.kv}>
              <div style={styles.k}>Right (mean ± std)</div>
              <div style={styles.v}>
                {view?.summary?.right?.mean ?? '—'} ± {view?.summary?.right?.std ?? '—'}
              </div>
            </div>
            <div style={styles.kv}>
              <div style={styles.k}>Asymmetry (mm)</div>
              <div style={styles.v}>{view?.summary?.asym_mm ?? '—'}</div>
            </div>
            <div style={styles.kv}>
              <div style={styles.k}>Brightness corr (L / R)</div>
              <div style={styles.v}>
                {view?.summary?.brightness_corr?.left ?? '—'} /{' '}
                {view?.summary?.brightness_corr?.right ?? '—'}
              </div>
            </div>
          </div>

          {Array.isArray(view?.reasons) && view.reasons.length > 0 && (
            <>
              <h4 style={styles.h4}>Reasons</h4>
              <ul>
                {view.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}

          <details style={{ marginTop: 12 }}>
            <summary>Show first 20 samples</summary>
            <pre style={styles.pre}>
              {JSON.stringify(view?.samples?.slice(0, 20) ?? [], null, 2)}
            </pre>
          </details>

          <button onClick={downloadJSON} style={{ ...styles.btn, marginTop: 12 }}>
            Download JSON
          </button>
        </div>
      )}

      <details style={{ marginTop: 16 }}>
        <summary>Debug: cURL</summary>
        <pre style={styles.pre}>
{mode === 'partner'
  ? `b64=$(base64 -i "/path/to/your.csv" | tr -d '\\n')\n\ncurl -X POST ${API}/api/ingest \\\n  -H "Content-Type: application/json" \\\n  -H "X-Shared-Secret: ${secret || 'YOUR_SECRET'}" \\\n  -d '{\n    "fileName": "your.csv",\n    "fileBase64": "'"$b64"'",\n    "contentType": "text/csv",\n    "meta": ${metaText || '{}'},\n    "analyze": ${analyze}\n  }'`
  : `curl -X POST ${API}/api/ingest/test \\\n  -F 'file=@"/path/to/your.csv"'`}
        </pre>
      </details>
    </div>
  );
}

function badgeColor(diagnosis) {
  if (!diagnosis) return {};
  if (diagnosis === 'clear')
    return { background: '#E6FFFB', color: '#00796B', border: '1px solid #B2F5EA' };
  if (diagnosis === 'flagged')
    return { background: '#FFEDED', color: '#B71C1C', border: '1px solid #F5C2C2' };
  return { background: '#FFF7E6', color: '#8B5E00', border: '1px solid #FFE58F' }; // review_recommended or other
}

const styles = {
  wrap: { maxWidth: 900, margin: '0 auto', padding: '1rem', color: '#2E4057' },
  title: { color: '#1B5A72', margin: 0, marginBottom: 6 },
  sub: { marginTop: 4, color: '#6b7a89' },
  modeRow: { display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, marginBottom: 6 },
  modeLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 },
  panel: { padding: 12, border: '1px solid #e8edf2', borderRadius: 8, background: '#FBFEFF', marginBottom: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  rowCol: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 },
  lbl: { width: 140, color: '#6b7a89', fontSize: 13 },
  input: { padding: 8, border: '1px solid #d9e6ee', borderRadius: 8, flex: 1 },
  textarea: { padding: 8, border: '1px solid #d9e6ee', borderRadius: 8, width: '100%', fontFamily: 'monospace' },
  form: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' },
  file: { padding: 8, border: '1px solid #d9e6ee', borderRadius: 8, background: '#fff' },
  btn: { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1B5A72', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  error: { marginTop: 12, background: '#fff2f0', color: '#a8071a', padding: '10px 12px', borderRadius: 8, border: '1px solid #ffccc7' },
  card: { marginTop: 16, background: '#fff', border: '1px solid #e8edf2', borderRadius: 12, padding: 16, boxShadow: '0 6px 18px rgba(0,0,0,0.04)' },
  h3: { margin: 0, marginBottom: 10, color: '#1B5A72' },
  h4: { marginBottom: 6, marginTop: 16 },
  grid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' },
  kv: { background: '#F7FBFF', border: '1px solid #E6F0F8', borderRadius: 8, padding: 10 },
  k: { fontSize: 12, color: '#6c7c8c' },
  v: { fontWeight: 600, marginTop: 2 },
  badge: { padding: '4px 8px', borderRadius: 20, display: 'inline-block', fontWeight: 700, textTransform: 'capitalize' },
  pre: { background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8, overflowX: 'auto' },
};
