// frontend/src/pages/ParkinsonAnalysis.jsx
import React, { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ParkinsonAnalysis = () => {
  const [csvData, setCsvData] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
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
    generateDiagnosis(data);
  };

  const generateDiagnosis = (data) => {
    const leftSizes = data.map(row => parseFloat(row["Left Pupil Size (mm)"]));
    const rightSizes = data.map(row => parseFloat(row["Right Pupil Size (mm)"]));

    const leftStdDev = stddev(leftSizes);
    const rightStdDev = stddev(rightSizes);

    if (leftStdDev > 0.25 || rightStdDev > 0.25) {
      setDiagnosis('⚠️ Possible abnormal pupil reactivity — recommend further testing');
    } else {
      setDiagnosis('✅ Normal pupil dynamics');
    }
  };

  const stddev = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  const chartData = {
    labels: csvData?.map((_, i) => i),
    datasets: [
      {
        label: 'Left Pupil Size (mm)',
        data: csvData?.map(row => parseFloat(row["Left Pupil Size (mm)"])),
        backgroundColor: '#4ED8C3',
      },
      {
        label: 'Right Pupil Size (mm)',
        data: csvData?.map(row => parseFloat(row["Right Pupil Size (mm)"])),
        backgroundColor: '#3F7F89',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: 'Pupil Size Over Time',
        color: '#2E4057',
      }
    },
    scales: {
      x: { ticks: { color: '#2E4057' } },
      y: { ticks: { color: '#2E4057' } }
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🧠 Parkinson's Data Analysis</h2>
      <p style={styles.text}>Upload a CSV file to analyze pupil metrics and screen for abnormalities.</p>

      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        id="csv-upload"
      />
      <label htmlFor="csv-upload" style={styles.button}>
        Upload CSV
      </label>

      {csvData && (
        <>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Preliminary Diagnosis</h3>
            <p style={styles.diagnosisText}>{diagnosis}</p>
          </div>

          <div style={styles.chartWrapper}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px 10px',
    maxWidth: '100%',
    margin: '0 auto',
    fontFamily: 'Segoe UI, sans-serif',
    background: '#FFFFFF',
  },
  title: {
    textAlign: 'center',
    color: '#1B5A72',
    fontSize: 'clamp(1.5rem, 5vw, 2rem)',
    marginBottom: '20px',
  },
  text: {
    textAlign: 'center',
    color: '#333',
    fontSize: '1rem',
    marginBottom: '1.5rem',
  },
  button: {
    display: 'block',
    backgroundColor: '#1B5A72',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    margin: '0 auto 2rem',
  },
  card: {
    backgroundColor: '#D9F1FF',
    padding: '16px',
    borderRadius: '10px',
    margin: '0 auto 20px',
    maxWidth: '480px',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: '1.2rem',
    color: '#2E4057',
    marginBottom: '0.5rem',
  },
  diagnosisText: {
    fontSize: '1rem',
    fontWeight: 500,
    color: '#2E4057',
  },
  chartWrapper: {
    maxWidth: '800px',
    margin: '0 auto',
    background: '#fff',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  }
};

export default ParkinsonAnalysis;
