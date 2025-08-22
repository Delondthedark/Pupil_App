import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import foodRouter from './routes/food.js';
import foodImageQueue from './routes/foodImageQueue.js';
import sleepRouter from './routes/sleep.js';
import authRouter from './routes/auth.js';
import parkinsonAnalyze from './routes/parkinsonAnalyze.js';
import ingestRouter from './routes/ingest.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '80mb' }));

// Attach DB pool
app.use((req, _, next) => { req.pool = pool; next(); });

// Static
app.use('/uploads', express.static('uploads'));

// API routes (mount both plain and /api/*)
app.use(['/food', '/api/food'], foodRouter);
app.use(['/queue', '/api/queue'], foodImageQueue);
app.use(['/sleep', '/api/sleep'], sleepRouter);
app.use(['/auth', '/api/auth'], authRouter);
app.use(['/parkinson', '/api/parkinson'], parkinsonAnalyze);
app.use(['/ingest', '/api/ingest'], ingestRouter);

// Start
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
);
