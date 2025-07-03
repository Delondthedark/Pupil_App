// backend/index.js
import express from 'express';
import cors from 'cors';
import pool from './db.js'; // ✅ pool now exists
import foodRouter from './routes/food.js';
import foodImageQueue from './routes/foodImageQueue.js';
import sleepRouter from './routes/sleep.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 🔌 Attach DB pool to every request (non-invasive)
app.use((req, res, next) => {
  req.pool = pool;
  next();
});

app.use('/uploads', express.static('uploads'));
app.use('/api/food', foodRouter);
app.use('/api/queue', foodImageQueue);
app.use('/api/sleep', sleepRouter);

app.get('/', (req, res) => res.send('👋 Backend running'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
