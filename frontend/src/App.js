import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './AppLayout';
import Home from './pages/Home';
import PLRTest from './pages/PLRTest';
import PupilSize from './pages/PupilSize';
import FixationPattern from './pages/FixationPattern';
import SleepAnalysis from './pages/SleepAnalysis';
import FoodAnalysis from './pages/FoodAnalysis';
import EyeDirection from './pages/EyeDirection';
import ParkinsonAnalysis from './pages/ParkinsonAnalysis';
import { AuthProvider } from './auth/AuthContext';
import PrivateRoute from './auth/PrivateRoute';
import Login from './pages/Login';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Login route */}
          <Route path="/login" element={<Login />} />

          {/* Protected app routes */}
          <Route path="/" element={<AppLayout />}>
            {/* Home is the index route (default after login) */}
            <Route
              index
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route path="plr" element={<PrivateRoute><PLRTest /></PrivateRoute>} />
            <Route path="pupil" element={<PrivateRoute><PupilSize /></PrivateRoute>} />
            <Route path="fixation" element={<PrivateRoute><FixationPattern /></PrivateRoute>} />
            <Route path="sleep" element={<PrivateRoute><SleepAnalysis /></PrivateRoute>} />
            <Route path="food" element={<PrivateRoute><FoodAnalysis /></PrivateRoute>} />
            <Route path="eye-direction" element={<PrivateRoute><EyeDirection /></PrivateRoute>} />
            <Route path="parkinson" element={<PrivateRoute><ParkinsonAnalysis /></PrivateRoute>} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
