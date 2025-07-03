import React, { useEffect, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const PupilSize = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [processedImg, setProcessedImg] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pupilData, setPupilData] = useState([]);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };
    startCamera();
  }, []);

  useEffect(() => {
    let interval;
    const sendFrameToAI = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');

        try {
          const res = await fetch('https://dates-equity-attempts-metadata.trycloudflare.com/analyze/', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();
          const { left_pupil_size, right_pupil_size, annotated_image } = data;

          setPupilData(prev => [
            ...prev.slice(-30),
            {
              time: new Date().toLocaleTimeString(),
              left: left_pupil_size,
              right: right_pupil_size,
            },
          ]);

          setProcessedImg(annotated_image);
        } catch (err) {
          console.error('Error sending frame:', err);
        }
      }, 'image/jpeg');
    };

    if (isRunning) {
      interval = setInterval(sendFrameToAI, 50);
    }

    return () => clearInterval(interval);
  }, [isRunning]);

  const handleStart = () => setIsRunning(true);
  const handleStop = () => {
    setIsRunning(false);
    setProcessedImg(null);
    setPupilData([]);
  };

  const chartData = {
    labels: pupilData.map(d => d.time),
    datasets: [
      {
        label: 'Left Pupil',
        data: pupilData.map(d => d.left),
        borderColor: '#007aff',
        fill: false,
      },
      {
        label: 'Right Pupil',
        data: pupilData.map(d => d.right),
        borderColor: '#ff2d55',
        fill: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Size (px)' },
      },
      x: {
        title: { display: true, text: 'Time' },
      },
    },
  };

  const styles = {
    container: {
      padding: '1rem',
      fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
      backgroundColor: '#fafafa',
    },
    title: {
      textAlign: 'center',
      fontSize: '24px',
      fontWeight: '600',
      color: '#007AFF',
      marginBottom: '1rem',
    },
    button: {
      marginTop: '1rem',
      backgroundColor: '#007aff',
      color: '#fff',
      border: 'none',
      borderRadius: '8px',
      padding: '0.75rem 1.5rem',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    },
    image: {
      marginTop: '1rem',
      width: '100%',
      maxWidth: '400px',
      height: '300px',
      objectFit: 'cover',
      borderRadius: '12px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    },
    chart: {
      width: '100%',
      maxWidth: '600px',
      marginTop: '2rem',
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Pupil Size Detection</h2>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: '100%',
            maxWidth: '400px',
            height: '300px',
            objectFit: 'cover',
            borderRadius: '12px',
            transform: 'scaleX(-1)',
            display: isRunning ? 'none' : 'block',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button onClick={isRunning ? handleStop : handleStart} style={styles.button}>
          {isRunning ? 'Stop Detection' : 'Start Detection'}
        </button>
        {processedImg && (
          <img src={processedImg} alt="Processed" style={styles.image} />
        )}
        <div style={styles.chart}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

export default PupilSize;
