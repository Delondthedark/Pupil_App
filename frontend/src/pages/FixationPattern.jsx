import React from 'react';

const FixationPattern = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Fixation & Gaze Shift Analysis</h2>
      <p style={styles.text}>This section will track and visualize gaze fixation patterns and shifts.</p>
      <p style={styles.text}>Data collected here can be used to assess attention and visual scanning behavior.</p>
    </div>
  );
};

const styles = {
  container: {
    fontFamily: "'Helvetica Neue', sans-serif",
    color: '#333',
    padding: '1rem',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1B5A72',
    marginBottom: '1rem',
  },
  text: {
    fontSize: '16px',
    lineHeight: '1.5',
  },
};

export default FixationPattern;
