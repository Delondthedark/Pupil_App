import React, { useEffect, useRef, useState } from 'react';

const EyeDirection = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [processedImg, setProcessedImg] = useState(null);

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
    if (isRunning) {
      interval = setInterval(() => {
        sendFrame();
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const sendFrame = () => {
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
        const res = await fetch(`${process.env.REACT_APP_AI_API_URL}/eye_direction/`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data?.annotated_image) {
          setProcessedImg(data.annotated_image);
        }
      } catch (err) {
        console.error('Failed to send frame:', err);
      }
    }, 'image/jpeg');
  };

  const handleToggle = () => {
    if (isRunning) {
      setIsRunning(false);
      setProcessedImg(null);
    } else {
      setIsRunning(true);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>👁️ Eye Direction Analysis</h2>
      <div style={styles.camera}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ ...styles.video, visibility: 'hidden', position: 'absolute' }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <button onClick={handleToggle} style={styles.button}>
          {isRunning ? 'Stop Eye Direction Analysis' : 'Start Eye Direction Analysis'}
        </button>

        {processedImg && isRunning && (
          <img src={processedImg} alt="Annotated Frame" style={styles.image} />
        )}

        {!isRunning && (
          <div style={styles.placeholder}>Camera ready. Press Start.</div>
        )}
      </div>
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
    marginBottom: '1rem',
  },
  camera: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    maxWidth: '400px',
    height: '300px',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
    borderRadius: '12px',
  },
  image: {
    marginTop: '1rem',
    maxWidth: '400px',
    width: '100%',
    height: 'auto',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  placeholder: {
    marginTop: '1rem',
    width: '100%',
    maxWidth: '400px',
    height: '300px',
    borderRadius: '12px',
    backgroundColor: '#f0f0f0',
    color: '#888',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '16px',
    fontStyle: 'italic',
    border: '1px dashed #ccc',
  },
  button: {
    backgroundColor: '#1B5A72',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    marginTop: '1rem',
  },
};

export default EyeDirection;
