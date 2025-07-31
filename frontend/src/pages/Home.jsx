import React from 'react';

const Home = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Welcome to Humanity Vision</h2>
      <p style={styles.subtitle}>A cutting-edge tool for analyzing human visual and behavioral patterns.</p>

      <div style={styles.descriptionBox}>
        <p style={styles.description}>
          Humanity Vision is a comprehensive visual health analysis platform designed for research and clinical use.
          It leverages real-time camera input and AI to assess:
        </p>
        <ul style={styles.list}>
          <li><strong>Pupil Size:</strong> Monitor left and right pupil dilation in response to light stimuli.</li>
          <li><strong>Eye Direction:</strong> Detect gaze direction and blinks using facial landmarks.</li>
          <li><strong>Fixation Patterns:</strong> Track and visualize visual fixation and gaze shift behavior.</li>
          <li><strong>Sleep & Nutrition:</strong> Integrate with HealthKit and Passio SDK for holistic health tracking.</li>
        </ul>
        <p style={styles.note}>
          Navigate using the menu above to begin your assessments. All analysis is performed privately on your device or securely in the cloud.
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    textAlign: 'center',
    marginTop: '4rem',
    padding: '0 1rem',
    fontFamily: "'Helvetica Neue', sans-serif",
    color: '#333',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1B5A72',
  },
  subtitle: {
    fontSize: '18px',
    marginTop: '1rem',
    color: '#555',
  },
  descriptionBox: {
    marginTop: '2rem',
    textAlign: 'left',
    maxWidth: '600px',
    marginLeft: 'auto',
    marginRight: 'auto',
    backgroundColor: '#f9f9f9',
    padding: '1.5rem',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  description: {
    fontSize: '16px',
    marginBottom: '1rem',
  },
  list: {
    fontSize: '15px',
    paddingLeft: '1.25rem',
    marginBottom: '1rem',
  },
  note: {
    fontSize: '14px',
    fontStyle: 'italic',
    color: '#666',
  },
};

export default Home;
