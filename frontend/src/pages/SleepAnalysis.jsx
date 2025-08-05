// SleepAnalysis.jsx
import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { saveAs } from 'file-saver';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const SleepAnalysis = () => {
  const [sleepData, setSleepData] = useState([]);

useEffect(() => {
  const baseURL = process.env.REACT_APP_API_BASE_URL;
  fetch(`${baseURL}/sleep`)
    .then(response => response.json())
    .then(data => Array.isArray(data) && setSleepData(data))
    .catch(error => console.error('Error fetching sleep data:', error));
}, []);

  const formatMinutes = (text) => {
    const minutes = parseInt(text?.replace('m', '') || 0, 10);
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getTotalMinutes = (field) => {
    return sleepData.reduce((sum, entry) => {
      return sum + parseInt(entry[field]?.replace('m', '') || 0, 10);
    }, 0);
  };

  const getSleepScore = (minutes) => {
    if (minutes >= 480) return '💤 Excellent';
    if (minutes >= 360) return '✅ Good';
    return '⚠️ Poor';
  };

  const exportCSV = () => {
    const headers = ['Date', 'REM', 'Core', 'Deep', 'Total', 'Score'];
    const rows = sleepData.map(entry => [
      formatDate(entry.date),
      entry.rem_sleep,
      entry.core_sleep,
      entry.deep_sleep,
      entry.total_sleep,
      getSleepScore(parseInt(entry.total_sleep?.replace('m', '') || 0))
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'sleep_analysis.csv');
  };

  const totalRem = getTotalMinutes('rem_sleep');
  const totalCore = getTotalMinutes('core_sleep');
  const totalDeep = getTotalMinutes('deep_sleep');
  const totalOverall = getTotalMinutes('total_sleep');

  const chartData = {
    labels: sleepData.map(d => formatDate(d.date)),
    datasets: [
      {
        label: 'REM',
        data: sleepData.map(d => parseInt(d.rem_sleep?.replace('m', '') || 0)),
        backgroundColor: '#4ED8C3'
      },
      {
        label: 'Core',
        data: sleepData.map(d => parseInt(d.core_sleep?.replace('m', '') || 0)),
        backgroundColor: '#3F7F89'
      },
      {
        label: 'Deep',
        data: sleepData.map(d => parseInt(d.deep_sleep?.replace('m', '') || 0)),
        backgroundColor: '#FFC107'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: 'Sleep Stage Duration (minutes per day)',
        color: '#2E4057'
      }
    },
    scales: {
      x: { ticks: { color: '#2E4057' } },
      y: { ticks: { color: '#2E4057' } }
    }
  };

  return (
    <div style={{
      padding: '20px 10px',
      maxWidth: '100%',
      margin: '0 auto',
      fontFamily: 'Segoe UI, sans-serif',
      background: '#FFFFFF',
    }}>
      <h2 style={{
        textAlign: 'center',
        color: '#1B5A72',
        fontSize: 'clamp(1.5rem, 5vw, 2rem)',
        marginBottom: '20px'
      }}>
        Sleep Analysis
      </h2>

      {sleepData.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6c757d' }}>No sleep data available.</p>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            {[
              { label: 'REM', value: totalRem, bg: '#4ED8C3' },
              { label: 'Core', value: totalCore, bg: '#3F7F89' },
              { label: 'Deep', value: totalDeep, bg: '#FFC107' },
              { label: 'Total', value: totalOverall, bg: '#D9F1FF' }
            ].map((card, i) => (
              <div key={i} style={{
                backgroundColor: card.bg,
                padding: '16px',
                borderRadius: '10px',
                minWidth: '120px',
                textAlign: 'center',
                color: '#2E4057',
                flex: '1 0 40%',
                maxWidth: '160px'
              }}>
                <div style={{ fontSize: '0.9rem' }}>{card.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{formatMinutes(`${card.value}m`)}</div>
              </div>
            ))}
          </div>

          <div style={{
            overflowX: 'auto',
            background: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            padding: '20px',
            marginBottom: '30px'
          }}>
            <table style={{
              width: '100%',
              minWidth: '600px',
              borderCollapse: 'collapse',
              fontSize: '0.9rem'
            }}>
              <thead>
                <tr>
                  {['Date', 'REM', 'Core', 'Deep', 'Total', 'Score'].map((col, i) => (
                    <th key={i} style={{
                      padding: '12px',
                      backgroundColor: '#D9F1FF',
                      textAlign: 'left',
                      borderBottom: '2px solid #dee2e6',
                      fontWeight: '600',
                      color: '#2E4057'
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sleepData.map((entry, index) => {
                  const total = parseInt(entry.total_sleep?.replace('m', '') || 0);
                  return (
                    <tr key={index}>
                      <td style={tdStyle}>{formatDate(entry.date)}</td>
                      <td style={tdStyle}>{formatMinutes(entry.rem_sleep)}</td>
                      <td style={tdStyle}>{formatMinutes(entry.core_sleep)}</td>
                      <td style={tdStyle}>{formatMinutes(entry.deep_sleep)}</td>
                      <td style={tdStyle}>{formatMinutes(entry.total_sleep)}</td>
                      <td style={tdStyle}>{getSleepScore(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ width: '100%', overflowX: 'auto', marginTop: '2rem' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>

          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <button
              onClick={exportCSV}
              style={{
                padding: '12px 24px',
                fontSize: '1rem',
                borderRadius: '6px',
                border: 'none',
                background: '#1B5A72',
                color: 'white',
                cursor: 'pointer',
                width: '90%',
                maxWidth: '300px'
              }}
            >
              ⬇️ Download CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #e9ecef',
  color: '#2E4057'
};

export default SleepAnalysis;
