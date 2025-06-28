import express from 'express';
import cors from 'cors';
import foodRouter from './routes/food.js';
import foodImageQueue from './routes/foodImageQueue.js';

const app = express();
const PORT = 3001; // ✅ Set to 3001

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use('/api/food', foodRouter);
app.use('/api/queue', foodImageQueue);

app.get('/', (req, res) => res.send('👋 Backend running'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
