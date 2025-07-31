// frontend/src/pages/ParkinsonAnalysis.jsx
import React, { useState } from 'react';

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

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🧠 Parkinson's Data Analysis</h2>
      <p style={styles.text}>
        Upload a CSV file containing pupil tracking metrics for automated analysis and visualization.
      </p>

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

      {filename && <p style={styles.file}>📄 {filename}</p>}

      {csvData && (
        <div style={styles.tableContainer}>
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
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '1rem',
    textAlign: 'center',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1B5A72',
    marginBottom: '0.5rem',
  },
  text: {
    fontSize: '16px',
    marginBottom: '1rem',
  },
  button: {
    display: 'inline-block',
    backgroundColor: '#1B5A72',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  file: {
    marginTop: '1rem',
    fontSize: '14px',
    color: '#444',
    fontStyle: 'italic',
  },
  tableContainer: {
    marginTop: '2rem',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  note: {
    marginTop: '1rem',
    fontSize: '13px',
    color: '#888',
  },
  th: {
    backgroundColor: '#f0f0f0',
    fontWeight: '600',
    padding: '8px',
    border: '1px solid #ccc',
  },
  td: {
    padding: '8px',
    border: '1px solid #ccc',
  },
};

export default ParkinsonAnalysis;
