import React from 'react';

const Home = () => {
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Welcome to Humanity Vision</h2>
      <p style={styles.subtitle}>Navigate using the menu to begin your tests.</p>
    </div>
  );
};

const styles = {
  container: {
    textAlign: 'center',
    marginTop: '5rem',
    fontFamily: "'Helvetica Neue', sans-serif",
    color: '#333',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#1B5A72',
  },
  subtitle: {
    fontSize: '16px',
    marginTop: '1rem',
  },
};

export default Home;
