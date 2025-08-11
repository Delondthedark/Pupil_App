// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js'; // ✅ PostgreSQL pool for sleep
import foodRouter from './routes/food.js'; // Food upload + result endpoints
import foodImageQueue from './routes/foodImageQueue.js'; // Image queue system
import sleepRouter from './routes/sleep.js'; // Sleep analysis routes

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Enhanced CORS config to allow frontend domain
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Parse incoming JSON
app.use(express.json({ limit: '50mb' }));

app.use((req, _, next) => {
  if (req.path.startsWith('/sleep')) {
    console.log(`[sleep] ${req.method} ${req.path}`);
  }
  next();
});


// ✅ Attach DB pool to every request (for /api/sleep)
app.use((req, res, next) => {
  req.pool = pool;
  next();
});

// Serve static files (e.g., uploaded images)
app.use('/uploads', express.static('uploads'));

// ✅ API Routes
app.use('/food', foodRouter);           // /upload, /result, /results
app.use('/queue', foodImageQueue);      // /dequeue (iOS food analyzer)
app.use('/sleep', sleepRouter);         // Sleep tracking

// ✅ Root route for health check
//app.get('/', (req, res) => res.send('👋 Backend running'));

// ✅ Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
