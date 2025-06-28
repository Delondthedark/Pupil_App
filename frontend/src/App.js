import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './AppLayout';
import Home from './pages/Home';
import PLRTest from './pages/PLRTest';
import PupilSize from './pages/PupilSize';
import FixationPattern from './pages/FixationPattern';
import SleepAnalysis from './pages/SleepAnalysis';
import FoodAnalysis from './pages/FoodAnalysis';
import EyeDirection from './pages/EyeDirection'; // ✅ New import

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="plr" element={<PLRTest />} />
          <Route path="pupil" element={<PupilSize />} />
          <Route path="fixation" element={<FixationPattern />} />
          <Route path="sleep" element={<SleepAnalysis />} />
          <Route path="food" element={<FoodAnalysis />} />
          <Route path="eye-direction" element={<EyeDirection />} /> {/* ✅ New route */}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
