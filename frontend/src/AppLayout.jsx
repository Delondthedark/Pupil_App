import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = [
    { label: 'Pupil Size', path: '/pupil' },
    { label: 'Sleep Analysis', path: '/sleep' },
    { label: 'Food Analysis', path: '/food' },
    { label: 'Gaze Pattern', path: '/fixation' },
    { label: 'PLR Test', path: '/plr' },
    { label: 'Eye Direction', path: '/eye-direction' }, // ✅ New tab
  ];

  const handleNavigate = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <h1
          style={styles.headerTitle}
          onClick={() => {
            navigate('/');
            window.location.reload();
          }}
        >
          Humanity Vision
        </h1>
        <div style={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)}>
          <div style={styles.bar}></div>
          <div style={styles.bar}></div>
          <div style={styles.bar}></div>
        </div>
        {menuOpen && (
          <div style={styles.menu}>
            {tabs.map((tab) => (
              <div
                key={tab.path}
                onClick={() => handleNavigate(tab.path)}
                style={{
                  ...styles.menuItem,
                  fontWeight: location.pathname === tab.path ? '600' : '400',
                  color: location.pathname === tab.path ? '#007AFF' : '#333',
                }}
              >
                {tab.label}
              </div>
            ))}
          </div>
        )}
      </header>

      <main style={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
};

const styles = {
  appContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    backgroundColor: '#fdfdfd',
    position: 'relative',
  },
  header: {
    position: 'relative',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #eee',
    backgroundColor: '#fff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: '26px',
    fontWeight: '700',
    color: '#007AFF',
    margin: 0,
    cursor: 'pointer',
    fontFamily: "'Orbitron', 'Avenir', sans-serif",
  },
  hamburger: {
    width: '30px',
    height: '22px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
  },
  bar: {
    height: '4px',
    width: '100%',
    backgroundColor: '#007AFF',
    borderRadius: '2px',
  },
  menu: {
    position: 'absolute',
    top: '60px',
    right: '1rem',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    padding: '0.5rem 1rem',
    zIndex: 1000,
  },
  menuItem: {
    padding: '0.4rem 0',
    fontSize: '16px',
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
  },
};

export default AppLayout;
