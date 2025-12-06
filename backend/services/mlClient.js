// backend/services/mlClient.js
import fetchPkg from 'node-fetch';
const fetch = globalThis.fetch || fetchPkg;

const ML_BASE_URL = process.env.ML_BASE_URL || 'http://127.0.0.1:8000';
const ML_SHARED_SECRET =
  process.env.ML_SHARED_SECRET || process.env.ML_SECRET || '';

export async function checkHealth() {
  const url = `${ML_BASE_URL}/ml/health`;
  try {
    const res = await fetch(url);
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    if (!res.ok) throw new Error(`health ${res.status}: ${txt.slice(0,200)}`);
    return data;
  } catch (err) {
    console.error('[mlClient] Health error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function predict(feats) {
  const url = `${ML_BASE_URL}/ml/predict`;
  try {
    const headers = { 'Content-Type': 'application/json' };
    // send a secret only if you configured one
    if (ML_SHARED_SECRET) headers['X-ML-Secret'] = ML_SHARED_SECRET;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(feats) });
    const txt = await res.text();
    let data; try { data = JSON.parse(txt); } catch { throw new Error(`invalid json: ${txt.slice(0,200)}`); }
    if (!res.ok) throw new Error(`predict ${res.status}: ${txt.slice(0,200)}`);
    return data;                   // expected: { label, proba: {...}, ... }
  } catch (err) {
    console.error('[mlClient] Prediction error:', err.message);
    return { error: err.message }; // caller will show "—"
  }
}
