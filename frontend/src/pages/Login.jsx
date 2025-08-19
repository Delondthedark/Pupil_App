// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const baseURL = process.env.REACT_APP_API_BASE_URL;
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${baseURL}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');

      login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <img src="/logo.svg" alt="Humanity Vision Logo" style={styles.logo} />
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>
          {mode === 'login' ? 'Welcome' : 'Create Account'}
        </h2>
        <p style={styles.subtitle}>
          {mode === 'login'
            ? 'Login to access your dashboard'
            : 'Sign up to start using Humanity Vision'}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={submit}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label style={styles.label}>Password</label>
          <input
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading
              ? mode === 'login'
                ? 'Signing in...'
                : 'Creating...'
              : mode === 'login'
              ? 'Login'
              : 'Sign Up'}
          </button>
        </form>

        <div style={styles.switchMode}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            style={styles.link}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fbfd',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '40px',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif"
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px'
  },
  logo: {
    height: '40px',
    objectFit: 'contain'
  },
  title: {
    fontSize: '22px',
    color: '#1B5A72',
    fontWeight: '700',
    margin: 0
  },
  card: {
    backgroundColor: '#fff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center'
  },
  cardTitle: {
    marginBottom: '8px',
    color: '#1B5A72',
    fontWeight: '600',
    fontSize: '20px'
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    textAlign: 'left',
    marginBottom: '6px',
    color: '#333',
    fontSize: '13px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    marginBottom: '14px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    fontSize: '14px'
  },
  button: {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#1B5A72',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '15px'
  },
  error: {
    backgroundColor: '#ffe6e6',
    color: '#cc0000',
    padding: '8px',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '13px'
  },
  switchMode: {
    marginTop: '16px',
    fontSize: '14px',
    color: '#555'
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#1B5A72',
    cursor: 'pointer',
    fontWeight: '600',
    marginLeft: '4px'
  }
};
