import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = user ? [
    { label: 'Pupil Size', path: '/pupil' },
    { label: 'Sleep Analysis', path: '/sleep' },
    { label: 'Food Analysis', path: '/food' },
    { label: 'Gaze Pattern', path: '/fixation' },
    { label: 'PLR Test', path: '/plr' },
    { label: 'Eye Direction', path: '/eye-direction' },
    { label: 'Parkinson Analysis', path: '/parkinson' },
  ] : [];

  const handleNavigate = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div onClick={() => navigate('/')} style={styles.logoWrapper}>
          <img src="/logo.svg" alt="Humanity Vision Logo" style={styles.logoImage} />
        </div>

        {user && (
          <div style={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)}>
            <div style={styles.bar}></div>
            <div style={styles.bar}></div>
            <div style={styles.bar}></div>
          </div>
        )}

        {menuOpen && (
          <div style={styles.menu}>
            {tabs.map((tab) => (
              <div
                key={tab.path}
                onClick={() => handleNavigate(tab.path)}
                style={{
                  ...styles.menuItem,
                  fontWeight: location.pathname === tab.path ? '600' : '400',
                  color: '#1B5A72',
                }}
              >
                {tab.label}
              </div>
            ))}
            <div onClick={logout} style={{ ...styles.menuItem, color: 'red' }}>
              Log out
            </div>
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
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif", backgroundColor: '#fdfdfd' },
  header: { position: 'relative', padding: '0.5rem 1rem', borderBottom: '1px solid #eee', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logoWrapper: { cursor: 'pointer' },
  logoImage: { height: '36px' },
  hamburger: { width: '30px', height: '22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' },
  bar: { height: '4px', width: '100%', backgroundColor: '#1B5A72', borderRadius: '2px' },
  menu: { position: 'absolute', top: '60px', right: '1rem', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '0.5rem 1rem', zIndex: 1000 },
  menuItem: { padding: '0.4rem 0', fontSize: '16px', cursor: 'pointer' },
  mainContent: { flex: 1, overflowY: 'auto', padding: '1rem', color: '#1B5A72' },
};

export default AppLayout;
