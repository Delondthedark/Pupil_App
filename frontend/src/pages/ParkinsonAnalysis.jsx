// frontend/src/pages/ParkinsonAnalysis.jsx
import React, { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { saveAs } from 'file-saver';
import { CSVLink } from 'react-csv';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  zoomPlugin
);

const COLORS = {
  brand: '#1B5A72',  // deep teal (Sleep header)
  mint: '#4ED8C3',   // aqua (Sleep REM)
  text: '#2E4057',
  cardBg: '#D9F1FF',
  warnBg: '#fffbe6',
  warnBorder: '#ffd66b',
};

function movingAverage(arr, k) {
  if (!k || k <= 1) return arr;
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  let q = [];
  for (let i = 0; i < arr.length; i++) {
    const v = Number(arr[i]);
    if (!Number.isFinite(v)) { q = []; sum = 0; continue; }
    q.push(v); sum += v;
    if (q.length > k) sum -= q.shift();
    if (q.length === k) out[i] = sum / k;
  }
  // backfill leading nulls for nicer line
  let firstIdx = out.findIndex(x => x !== null);
  if (firstIdx > 0) for (let i = 0; i < firstIdx; i++) out[i] = out[firstIdx];
  return out;
}

function stats(values) {
  const v = values.filter(x => Number.isFinite(x));
  if (!v.length) return { mean: NaN, std: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length;
  return { mean, std: Math.sqrt(variance) };
}

const ParkinsonAnalysis = () => {
  const [rows, setRows] = useState(null);
  const [filename, setFilename] = useState('');
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [smoothK, setSmoothK] = useState(1); // moving average window
  const chartRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCSV(text);
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  // Robust-ish CSV parser for comma-separated headers + numeric values
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const cells = line.split(',').map(c => c.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
      return obj;
    });
  }

  // Columns we care about (match your generator)
  const col = useMemo(() => ({
    frame: 'Frame Number',
    left: 'Left Pupil Size (mm)',
    right: 'Right Pupil Size (mm)',
    brightness: 'Brightness',
    lux: 'Illuminance',
  }), []);

  const series = useMemo(() => {
    if (!rows?.length) return null;
    const frames = rows.map(r => r[col.frame]);
    const leftRaw = rows.map(r => Number(r[col.left]));
    const rightRaw = rows.map(r => Number(r[col.right]));

    const left = movingAverage(leftRaw, smoothK);
    const right = movingAverage(rightRaw, smoothK);

    return { frames, leftRaw, rightRaw, left, right };
  }, [rows, col, smoothK]);

  const metrics = useMemo(() => {
    if (!series) return null;
    const { leftRaw, rightRaw } = series;
    const L = leftRaw.filter(Number.isFinite);
    const R = rightRaw.filter(Number.isFinite);

    const ls = stats(L);
    const rs = stats(R);
    const anisocoria = Math.abs((ls.mean ?? 0) - (rs.mean ?? 0));

    // very rough “blink-ish” count: spikes where both pupils drop sharply vs a 5-sample median
    let blinkish = 0;
    for (let i = 3; i < Math.min(L.length, R.length) - 3; i++) {
      const prev = (L[i - 1] + R[i - 1]) / 2;
      const curr = (L[i] + R[i]) / 2;
      if (Number.isFinite(prev) && Number.isFinite(curr) && prev - curr > 0.8) {
        blinkish++;
      }
    }

    return {
      leftAvg: ls.mean?.toFixed(2),
      rightAvg: rs.mean?.toFixed(2),
      leftStd: ls.std?.toFixed(2),
      rightStd: rs.std?.toFixed(2),
      anisocoria: anisocoria?.toFixed(2),
      blinkish,
    };
  }, [series]);

  const diagnosis = useMemo(() => {
    if (!metrics) return null;
    const lStd = Number(metrics.leftStd);
    const rStd = Number(metrics.rightStd);
    const diff = Number(metrics.anisocoria);

    // placeholder rules — just flags, not medical advice
    if (diff > 0.5 || lStd < 0.08 || rStd < 0.08) {
      return '⚠️ Irregularity detected. Recommend specialist review.';
    }
    return '✅ No major anomalies detected. Stable pupil response.';
  }, [metrics]);

  const chartData = useMemo(() => {
    if (!series) return null;
    const datasets = [];
    if (showLeft) {
      datasets.push({
        label: 'Left Pupil Size',
        data: series.left,
        borderColor: COLORS.brand,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
      });
    }
    if (showRight) {
      datasets.push({
        label: 'Right Pupil Size',
        data: series.right,
        borderColor: COLORS.mint,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
      });
    }
    return { labels: series.frames, datasets };
  }, [series, showLeft, showRight]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: COLORS.text } },
      tooltip: { mode: 'index', intersect: false },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x',
        },
        limits: {
          x: { min: 0, max: 'original' },
          y: { min: 'original', max: 'original' },
        },
      },
      title: {
        display: true,
        text: 'Pupil Size Over Frames',
        color: COLORS.text,
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Frame Number', color: COLORS.text },
        ticks: { color: COLORS.text },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      y: {
        title: { display: true, text: 'Pupil Size (mm)', color: COLORS.text },
        ticks: { color: COLORS.text },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
    },
  }), []);

  const resetZoom = () => {
    const chart = chartRef.current;
    if (chart && chart.resetZoom) chart.resetZoom();
  };

  const exportJSON = () => {
    if (!rows) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    saveAs(blob, 'parkinson_analysis.json');
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🧠 Parkinson’s Data Analysis</h2>
      <p style={styles.subtitle}>Upload a CSV with pupil tracking metrics to visualize and review.</p>

      <input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
      <label htmlFor="csv-upload" style={styles.button}>Upload CSV</label>
      {filename && <p style={styles.filename}>📄 {filename}</p>}

      {rows && (
        <>
          {/* Metric cards */}
          <div style={styles.cardRow}>
            {[
              { label: 'Left Pupil Avg', value: metrics?.leftAvg ?? '—' },
              { label: 'Right Pupil Avg', value: metrics?.rightAvg ?? '—' },
              { label: 'Left Std Dev', value: metrics?.leftStd ?? '—' },
              { label: 'Right Std Dev', value: metrics?.rightStd ?? '—' },
              { label: 'L–R Mean Diff', value: metrics?.anisocoria ?? '—' },
              { label: 'Blink-ish Count', value: metrics?.blinkish ?? '—' },
            ].map((c, i) => (
              <div key={i} style={styles.card}>
                <div style={styles.cardLabel}>{c.label}</div>
                <div style={styles.cardValue}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Preliminary flag */}
          <div style={styles.diagnosisBox}>
            <strong>Preliminary Flag:</strong> {diagnosis}
          </div>

          {/* Controls */}
          <div style={styles.controls}>
            <label style={styles.check}>
              <input type="checkbox" checked={showLeft} onChange={() => setShowLeft(v => !v)} />
              <span>Left</span>
            </label>
            <label style={styles.check}>
              <input type="checkbox" checked={showRight} onChange={() => setShowRight(v => !v)} />
              <span>Right</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: COLORS.text }}>Smoothing</span>
              <input
                type="range"
                min={1}
                max={21}
                step={2}
                value={smoothK}
                onChange={e => setSmoothK(Number(e.target.value))}
              />
              <span style={{ color: COLORS.text }}>{smoothK} pts</span>
            </div>

            <button onClick={resetZoom} style={styles.resetButton}>Reset Zoom</button>
          </div>

          {/* Chart */}
          <div style={styles.chartWrap}>
            {chartData && (
              <Line
                data={chartData}
                options={chartOptions}
                ref={chartRef}
                height={380}
              />
            )}
          </div>

          {/* Downloads */}
          <div style={styles.buttonRow}>
            <button onClick={exportJSON} style={styles.downloadButton}>⬇️ Download JSON</button>
            <CSVLink data={rows} filename="parkinson_analysis.csv" style={{ ...styles.downloadButton, textDecoration: 'none' }}>
              ⬇️ Download CSV
            </CSVLink>
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '1rem',
    fontFamily: 'Segoe UI, sans-serif',
    background: '#ffffff',
    color: '#2E4057',
    maxWidth: 1000,
    margin: '0 auto',
  },
  title: {
    fontSize: '1.8rem',
    color: COLORS.brand,
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '1rem',
    textAlign: 'center',
    marginBottom: '1rem',
  },
  button: {
    backgroundColor: COLORS.brand,
    color: '#fff',
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'block',
    margin: '0 auto',
  },
  filename: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: '0.5rem',
  },
  cardRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginTop: '1.25rem',
  },
  card: {
    backgroundColor: COLORS.cardBg,
    padding: 16,
    borderRadius: 10,
    textAlign: 'center',
    color: COLORS.text,
  },
  cardLabel: { fontSize: '0.9rem' },
  cardValue: { fontSize: '1.2rem', fontWeight: 'bold' },
  diagnosisBox: {
    background: COLORS.warnBg,
    padding: '1rem',
    border: `1px solid ${COLORS.warnBorder}`,
    borderRadius: 8,
    marginTop: '1rem',
    textAlign: 'center',
    fontSize: '1rem',
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  check: { display: 'flex', alignItems: 'center', gap: 6, color: COLORS.text },
  resetButton: {
    padding: '6px 12px',
    backgroundColor: COLORS.mint,
    color: '#fff',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  },
  chartWrap: {
    marginTop: '1.25rem',
    width: '100%',
    height: 420,
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    marginTop: '1.5rem',
  },
  downloadButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    borderRadius: 6,
    border: 'none',
    background: COLORS.brand,
    color: 'white',
    cursor: 'pointer',
  },
};

export default ParkinsonAnalysis;
