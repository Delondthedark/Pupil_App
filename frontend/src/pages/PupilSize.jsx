import React, { useEffect, useRef, useState } from 'react';

const PupilSize = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workCanvasRef = useRef(null); // offscreen downscale
  const inFlight = useRef(false);

  const [isRunning, setIsRunning] = useState(false);
  const [processedImg, setProcessedImg] = useState(null);
  const [leftSize, setLeftSize] = useState(null);
  const [rightSize, setRightSize] = useState(null);

  // Start camera (mobile-first constraints)
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',                      // front camera on mobile
            width: { ideal: 640 },                   // mobile-friendly
            height: { ideal: 480 },                  // keeps bandwidth down
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera error:', err);
      }
    };
    startCamera();

    // Cleanup tracks on unmount
    return () => {
      const v = videoRef.current;
      const stream = v && v.srcObject;
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Capture loop (3 fps) with in-flight guard
  useEffect(() => {
    let interval;
    if (isRunning) {
      interval = setInterval(() => {
        if (!inFlight.current) sendFrame();
      }, 333); // ~3 FPS
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const sendFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // Draw the current frame to a canvas the same size as video
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Downscale to reduce bandwidth if needed (e.g., max width 480)
    const maxW = 480;
    const scale = Math.min(1, maxW / canvas.width);
    const targetW = Math.round(canvas.width * scale);
    const targetH = Math.round(canvas.height * scale);

    const work = workCanvasRef.current || document.createElement('canvas');
    work.width = targetW;
    work.height = targetH;
    const wctx = work.getContext('2d');
    wctx.drawImage(canvas, 0, 0, targetW, targetH);
    workCanvasRef.current = work;

    inFlight.current = true;
    work.toBlob(
      async (blob) => {
        try {
          if (!blob) {
            inFlight.current = false;
            return;
          }
          const formData = new FormData();
          formData.append('file', blob, 'frame.jpg');

          const response = await fetch(
            `${process.env.REACT_APP_AI_API_URL}/analyze/`,
            { method: 'POST', body: formData }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();
          if (data?.annotated_image) {
            setProcessedImg(data.annotated_image);
            setLeftSize(data.left_pupil_size);
            setRightSize(data.right_pupil_size);
          }
        } catch (err) {
          console.error('Pupil API error:', err);
        } finally {
          inFlight.current = false;
        }
      },
      'image/jpeg',
      0.85 // quality
    );
  };

  const handleToggle = () => {
    if (isRunning) {
      setIsRunning(false);
      setProcessedImg(null);
      setLeftSize(null);
      setRightSize(null);
      inFlight.current = false;
    } else {
      setIsRunning(true);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>👁️ Pupil Size Detection</h2>

      <div style={styles.camera}>
        {/* Hidden live video (for capture only) */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ ...styles.video, visibility: 'hidden', position: 'absolute' }}
        />
        {/* Working canvases (hidden) */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <canvas ref={workCanvasRef} style={{ display: 'none' }} />

        <button onClick={handleToggle} style={styles.button}>
          {isRunning ? 'Stop Detection' : 'Start Detection'}
        </button>

        {processedImg && isRunning && (
          <>
            <img src={processedImg} alt="Pupil Result" style={styles.image} />
            <p style={styles.text}>
              👁️ Left: {leftSize ?? 'N/A'} | Right: {rightSize ?? 'N/A'}
            </p>
          </>
        )}

        {!isRunning && (
          <div style={styles.placeholder}>Camera ready. Press Start.</div>
        )}
      </div>
    </div>
  );
};

const styles = {
  // Page container (centered on desktop, comfortable on mobile)
  container: {
    padding: '1rem',
    textAlign: 'center',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#1B5A72',
    marginBottom: '1rem',
  },
  // Camera card centered; width adapts to mobile, caps on desktop
  camera: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420, // keeps it nicely centered on larger screens
    margin: '0 auto',
  },
  // Hidden live video defaults (kept for parity with EyeDirection)
  video: {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
    borderRadius: '12px',
  },
  image: {
    marginTop: '0.75rem',
    width: '100%',
    height: 'auto',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  text: {
    marginTop: '0.5rem',
    fontSize: '16px',
    fontWeight: 500,
    color: '#1B5A72',
  },
  placeholder: {
    marginTop: '1rem',
    width: '100%',
    height: 300,
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
  padding: '0.75rem 1.25rem',
  border: 'none',
  borderRadius: '12px', // match others
  fontSize: '16px',
  fontWeight: 600,       // make it bolder
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  margin: '1rem auto 0', // centers horizontally
  display: 'block',
  width: '100%',
  maxWidth: 200,         // same as other pages
  textAlign: 'center',
},
};

export default PupilSize;
