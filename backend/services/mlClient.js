// backend/services/mlClient.js
import fetch from 'node-fetch';

const ML_BASE_URL = process.env.ML_BASE_URL || 'http://localhost:8000';

/**
 * Check if ML service is alive and model is loaded
 */
export async function checkHealth() {
  const url = `${ML_BASE_URL}/ml/health`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Health check failed (${res.status})`);
    return await res.json();
  } catch (err) {
    console.error('[mlClient] Health check error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Run ML prediction given a feature vector
 * @param {Object} feats - Feature vector (must match FeatureVector in main.py)
 * Example:
 * {
 *   n: 300,
 *   L_mean: 3.1,
 *   R_mean: 3.3,
 *   L_std: 0.05,
 *   R_std: 0.06,
 *   asym: 0.2,
 *   corr_L_B: 0.1,
 *   corr_R_B: 0.2,
 *   stv: 0.1
 * }
 */
export async function predict(feats) {
  const url = `${ML_BASE_URL}/ml/predict`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feats),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(data?.detail || `Prediction failed (${res.status})`);
    return data; // { label, proba: { ... } }
  } catch (err) {
    console.error('[mlClient] Prediction error:', err.message);
    return { error: err.message };
  }
}
