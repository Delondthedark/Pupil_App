// backend/index.js
import express from 'express';
import cors from 'cors';
import pool from './db.js'; // ✅ PostgreSQL pool for sleep
import foodRouter from './routes/food.js'; // Food upload + result endpoints
import foodImageQueue from './routes/foodImageQueue.js'; // Image queue system
import sleepRouter from './routes/sleep.js'; // Sleep analysis routes

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🔌 Attach DB pool to every request (for /api/sleep)
app.use((req, res, next) => {
  req.pool = pool;
  next();
});

// Static file serving
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/food', foodRouter);           // ✅ /upload, /result, /results
app.use('/api/queue', foodImageQueue);      // ✅ /dequeue (for iOS app)
app.use('/api/sleep', sleepRouter);         // ✅ Sleep tracking

// Root route
app.get('/', (req, res) => res.send('👋 Backend running'));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
