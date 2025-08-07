import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend, zoomPlugin);

const ParkinsonAnalysis = () => {
  const [csvData, setCsvData] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [diagnosis, setDiagnosis] = useState('');
  const [filename, setFilename] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFilename(file.name);

    const reader = new FileReader();
    reader.onload = () => parseCSV(reader.result);
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const rows = text.trim().split('\n');
    const headers = rows[0].split(',');
    const data = rows.slice(1).map(row => {
      const values = row.split(',');
      const entry = {};
      headers.forEach((h, i) => {
        entry[h.trim()] = values[i]?.trim();
      });
      return entry;
    });
    setCsvData(data);
    computeMetrics(data);
  };

  const computeMetrics = (data) => {
    const leftPupil = data.map(row => parseFloat(row["Left Pupil Size (mm)"])).filter(x => !isNaN(x));
    const rightPupil = data.map(row => parseFloat(row["Right Pupil Size (mm)"])).filter(x => !isNaN(x));

    const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stddev = (arr, avg) => Math.sqrt(arr.reduce((sum, val) => sum + (val - avg) ** 2, 0) / arr.length);

    const metrics = {
      left_avg: average(leftPupil).toFixed(2),
      right_avg: average(rightPupil).toFixed(2),
      left_std: stddev(leftPupil, average(leftPupil)).toFixed(2),
      right_std: stddev(rightPupil, average(rightPupil)).toFixed(2),
      left_min: Math.min(...leftPupil).toFixed(2),
      right_min: Math.min(...rightPupil).toFixed(2),
      left_max: Math.max(...leftPupil).toFixed(2),
      right_max: Math.max(...rightPupil).toFixed(2),
    };
    setMetrics(metrics);

    // Simple diagnosis rule
    const instab = parseFloat(metrics.left_std) + parseFloat(metrics.right_std);
    if (instab > 0.35) {
      setDiagnosis("⚠️ High pupil size fluctuation — Potential Parkinsonian traits");
    } else {
      setDiagnosis("✅ Stable response — No strong Parkinson indicators");
    }
  };

  const getChartData = () => {
    const timestamps = csvData.map(row => row["Timestamp"]);
    const left = csvData.map(row => parseFloat(row["Left Pupil Size (mm)"]));
    const right = csvData.map(row => parseFloat(row["Right Pupil Size (mm)"]));
    return {
      labels: timestamps,
      datasets: [
        {
          label: 'Left Pupil Size (mm)',
          data: left,
          borderColor: '#1B5A72',
          backgroundColor: '#1B5A72',
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'Right Pupil Size (mm)',
          data: right,
          borderColor: '#4ED8C3',
          backgroundColor: '#4ED8C3',
          tension: 0.2,
          pointRadius: 0
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x'
        },
        pan: {
          enabled: true,
          mode: 'x'
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Time' },
        ticks: { color: '#2E4057' }
      },
      y: {
        title: { display: true, text: 'Pupil Size (mm)' },
        ticks: { color: '#2E4057' }
      }
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Segoe UI, sans-serif' }}>
      <h2 style={{ color: '#1B5A72', textAlign: 'center' }}>🧠 Parkinson's Analysis</h2>
      <p style={{ textAlign: 'center' }}>
        Upload a CSV file of pupil tracking data for automated analysis.
      </p>

      <input type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} id="csv-upload" />
      <label htmlFor="csv-upload" style={{
        display: 'block',
        margin: '0 auto',
        textAlign: 'center',
        backgroundColor: '#1B5A72',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '6px',
        width: 'fit-content',
        cursor: 'pointer',
        marginBottom: '20px'
      }}>
        Upload CSV
      </label>

      {filename && (
        <p style={{ textAlign: 'center', fontStyle: 'italic', color: '#555' }}>
          📄 {filename}
        </p>
      )}

      {diagnosis && (
        <div style={{
          backgroundColor: '#D9F1FF',
          padding: '16px',
          borderRadius: '8px',
          color: '#1B5A72',
          fontWeight: 'bold',
          textAlign: 'center',
          margin: '20px auto',
          maxWidth: '600px'
        }}>
          Preliminary Diagnosis: {diagnosis}
        </div>
      )}

      {csvData && (
        <>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '20px'
          }}>
            {[
              { label: 'Left Avg', value: metrics.left_avg },
              { label: 'Right Avg', value: metrics.right_avg },
              { label: 'Left Std Dev', value: metrics.left_std },
              { label: 'Right Std Dev', value: metrics.right_std },
              { label: 'Left Min', value: metrics.left_min },
              { label: 'Right Min', value: metrics.right_min },
              { label: 'Left Max', value: metrics.left_max },
              { label: 'Right Max', value: metrics.right_max },
            ].map((card, i) => (
              <div key={i} style={{
                backgroundColor: '#D9F1FF',
                padding: '12px',
                borderRadius: '8px',
                minWidth: '120px',
                textAlign: 'center',
                color: '#1B5A72'
              }}>
                <div>{card.label}</div>
                <div style={{ fontWeight: 'bold' }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ width: '100%', overflowX: 'auto', marginTop: '30px' }}>
            <Line data={getChartData()} options={chartOptions} />
          </div>
        </>
      )}
    </div>
  );
};

export default ParkinsonAnalysis;
