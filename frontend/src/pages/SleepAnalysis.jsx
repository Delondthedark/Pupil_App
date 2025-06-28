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
    fetch('https://running-currency-rendering-ant.trycloudflare.com/api/sleep')
      .then(response => response.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSleepData(data);
        } else {
          console.error("Unexpected response:", data);
        }
      })
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

  const exportCSV = () => {
    const headers = ['Date', 'REM', 'Core', 'Deep', 'Total'];
    const rows = sleepData.map(entry => [
      formatDate(entry.date),
      entry.rem_sleep,
      entry.core_sleep,
      entry.deep_sleep,
      entry.total_sleep
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'sleep_analysis.csv');
  };

  const containerStyle = {
    padding: '40px 20px',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: 'Segoe UI, sans-serif'
  };

  const headingStyle = {
    textAlign: 'center',
    color: '#0d6efd',
    fontSize: '2rem',
    marginBottom: '30px'
  };

  const tableContainerStyle = {
    overflowX: 'auto',
    background: '#ffffff',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    padding: '20px',
    marginBottom: '40px'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.95rem'
  };

  const thStyle = {
    padding: '12px',
    backgroundColor: '#f8f9fa',
    textAlign: 'left',
    borderBottom: '2px solid #dee2e6',
    fontWeight: '600'
  };

  const tdStyle = {
    padding: '12px',
    borderBottom: '1px solid #e9ecef',
    color: '#333'
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
        backgroundColor: 'rgba(0, 123, 255, 0.6)'
      },
      {
        label: 'Core',
        data: sleepData.map(d => parseInt(d.core_sleep?.replace('m', '') || 0)),
        backgroundColor: 'rgba(40, 167, 69, 0.6)'
      },
      {
        label: 'Deep',
        data: sleepData.map(d => parseInt(d.deep_sleep?.replace('m', '') || 0)),
        backgroundColor: 'rgba(255, 193, 7, 0.6)'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top'
      },
      title: {
        display: true,
        text: 'Sleep Stage Duration (minutes per day)'
      }
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>Sleep Analysis</h2>

      {sleepData.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6c757d' }}>No sleep data available.</p>
      ) : (
        <>
          <div style={tableContainerStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>REM</th>
                  <th style={thStyle}>Core</th>
                  <th style={thStyle}>Deep</th>
                  <th style={thStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sleepData.map((entry, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>{formatDate(entry.date)}</td>
                    <td style={tdStyle}>{formatMinutes(entry.rem_sleep)}</td>
                    <td style={tdStyle}>{formatMinutes(entry.core_sleep)}</td>
                    <td style={tdStyle}>{formatMinutes(entry.deep_sleep)}</td>
                    <td style={tdStyle}>{formatMinutes(entry.total_sleep)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f1f1' }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdStyle}>{formatMinutes(`${totalRem}m`)}</td>
                  <td style={tdStyle}>{formatMinutes(`${totalCore}m`)}</td>
                  <td style={tdStyle}>{formatMinutes(`${totalDeep}m`)}</td>
                  <td style={tdStyle}>{formatMinutes(`${totalOverall}m`)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <Bar data={chartData} options={chartOptions} />

          <div style={{ textAlign: 'center', marginTop: '40px' }}>
            <button
              onClick={exportCSV}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#0d6efd',
                color: 'white',
                cursor: 'pointer'
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

export default SleepAnalysis;
