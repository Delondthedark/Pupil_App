import React from 'react';

const PLRTest = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>PLR Test (Pupillary Light Reflex)</h2>
      <p style={styles.text}>This module simulates how the pupil responds to changes in light stimulus.</p>
      <p style={styles.text}>Use this test to observe the constriction and dilation pattern of the pupils.</p>
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
    color: '#007AFF',
    marginBottom: '1rem',
  },
  text: {
    fontSize: '16px',
    lineHeight: '1.5',
  },
};

export default PLRTest;
