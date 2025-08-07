import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { saveAs } from 'file-saver';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale
} from 'chart.js';

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale
);

const ParkinsonAnalysis = () => {
  const [csvData, setCsvData] = useState(null);
  const [filename, setFilename] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const rows = text.trim().split('\n');
    const headers = rows[0].split(',');
    const data = rows.slice(1).map((row) => {
      const values = row.split(',');
      const entry = {};
      headers.forEach((h, i) => {
        entry[h.trim()] = values[i]?.trim();
      });
      return entry;
    });
    setCsvData(data);
  };

  const exportCSV = () => {
    const blob = new Blob([JSON.stringify(csvData, null, 2)], { type: 'application/json' });
    saveAs(blob, 'parkinson_analysis.json');
  };

  const getColumnStats = (key) => {
    if (!csvData) return {};
    const values = csvData.map((d) => parseFloat(d[key])).filter((v) => !isNaN(v));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);
    return { avg: avg.toFixed(2), std: std.toFixed(2) };
  };

  const preliminaryDiagnosis = () => {
    if (!csvData) return null;
    const left = getColumnStats('Left Pupil Size (mm)');
    const right = getColumnStats('Right Pupil Size (mm)');
    const diff = Math.abs(left.avg - right.avg);

    if (diff > 0.5 || left.std < 0.1 || right.std < 0.1) {
      return '⚠️ Irregularity detected. Recommend specialist review.';
    } else {
      return '✅ No major anomalies detected. Stable pupil response.';
    }
  };

  const generateChartData = () => {
    const frames = csvData.map((d) => d['Frame Number']);
    const left = csvData.map((d) => parseFloat(d['Left Pupil Size (mm)']));
    const right = csvData.map((d) => parseFloat(d['Right Pupil Size (mm)']));
    return {
      labels: frames,
      datasets: [
        {
          label: 'Left Pupil Size',
          data: left,
          borderColor: '#1B5A72',
          fill: false
        },
        {
          label: 'Right Pupil Size',
          data: right,
          borderColor: '#4ED8C3',
          fill: false
        }
      ]
    };
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🧠 Parkinson's Data Analysis</h2>
      <p style={styles.subtitle}>
        Upload a CSV with pupil tracking metrics to visualize and get a preliminary report.
      </p>

      <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} id="csv-upload" />
      <label htmlFor="csv-upload" style={styles.button}>Upload CSV</label>
      {filename && <p style={styles.filename}>📄 {filename}</p>}

      {csvData && (
        <>
          <div style={styles.cardRow}>
            {[
              { label: 'Left Pupil Avg', value: getColumnStats('Left Pupil Size (mm)').avg },
              { label: 'Right Pupil Avg', value: getColumnStats('Right Pupil Size (mm)').avg },
              { label: 'Left Std Dev', value: getColumnStats('Left Pupil Size (mm)').std },
              { label: 'Right Std Dev', value: getColumnStats('Right Pupil Size (mm)').std }
            ].map((card, i) => (
              <div key={i} style={styles.card}>
                <div style={styles.cardLabel}>{card.label}</div>
                <div style={styles.cardValue}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={styles.diagnosisBox}>
            <strong>Preliminary Diagnosis:</strong> {preliminaryDiagnosis()}
          </div>

          <div style={styles.chartContainer}>
            <Line data={generateChartData()} options={{
              responsive: true,
              plugins: { legend: { position: 'top' } },
              scales: {
                x: { title: { display: true, text: 'Frame Number' } },
                y: { title: { display: true, text: 'Pupil Size (mm)' } }
              }
            }} />
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {Object.keys(csvData[0]).map((key, idx) => (
                    <th key={idx}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 10).map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).map((val, i) => (
                      <td key={i}>{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={styles.note}>Showing first 10 rows for preview.</p>
          </div>

          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <button onClick={exportCSV} style={styles.downloadButton}>
              ⬇️ Download JSON
            </button>
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
    maxWidth: 900,
    margin: '0 auto'
  },
  title: {
    fontSize: '1.8rem',
    color: '#1B5A72',
    textAlign: 'center',
    marginBottom: '0.5rem'
  },
  subtitle: {
    fontSize: '1rem',
    textAlign: 'center',
    marginBottom: '1rem'
  },
  button: {
    backgroundColor: '#1B5A72',
    color: '#fff',
    padding: '0.75rem 1.25rem',
    fontSize: '1rem',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'block',
    margin: '0 auto'
  },
  filename: {
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: '0.5rem'
  },
  cardRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '1.5rem'
  },
  card: {
    backgroundColor: '#D9F1FF',
    padding: '16px',
    borderRadius: '10px',
    minWidth: '120px',
    textAlign: 'center',
    color: '#2E4057',
    flex: '1 0 40%',
    maxWidth: '160px'
  },
  cardLabel: {
    fontSize: '0.9rem'
  },
  cardValue: {
    fontSize: '1.2rem',
    fontWeight: 'bold'
  },
  diagnosisBox: {
    background: '#fffbe6',
    padding: '1rem',
    border: '1px solid #ffd66b',
    borderRadius: '8px',
    marginTop: '1.5rem',
    textAlign: 'center',
    fontSize: '1rem'
  },
  chartContainer: {
    marginTop: '2rem'
  },
  tableWrapper: {
    marginTop: '2rem',
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem'
  },
  note: {
    marginTop: '0.5rem',
    fontSize: '13px',
    color: '#888'
  },
  downloadButton: {
    padding: '12px 24px',
    fontSize: '1rem',
    borderRadius: '6px',
    border: 'none',
    background: '#1B5A72',
    color: 'white',
    cursor: 'pointer'
  }
};

export default ParkinsonAnalysis;
