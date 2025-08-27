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
app.use(express.urlencoded({ extended: true }));

// Attach DB pool
app.use((req, _, next) => { req.pool = pool; next(); });

// Static
app.use('/uploads', express.static('uploads'));

app.get('/diag/env', (_req, res) => {
  res.json({
    PGUSER: process.env.PGUSER,
    PGPASSWORD: process.env.PGPASSWORD ? '(set)' : '(missing)',
    PGDATABASE: process.env.PGDATABASE,
    PGHOST: process.env.PGHOST,
    PGPORT: process.env.PGPORT,
    NODE_ENV: process.env.NODE_ENV,
  });
});

// API routes (mount both plain and /api/*)
app.use(['/food', '/api/food'], foodRouter);
app.use(['/queue', '/api/queue'], foodImageQueue);
app.use(['/sleep', '/api/sleep'], sleepRouter);
app.use(['/auth', '/api/auth'], authRouter);
app.use(['/parkinson', '/api/parkinson'], parkinsonAnalyze);
app.use(['/ingest', '/api/ingest'], ingestRouter);

app.get(['/health', '/api/health'], (_req, res) => res.json({ ok: true }));

// Start
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`)
);
