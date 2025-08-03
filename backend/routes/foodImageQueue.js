// backend/routes/foodImageQueue.js
import express from 'express';
const router = express.Router();

let queue = [];
let processed = new Set();

// === POST /api/queue/enqueue ===
router.post('/enqueue', (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'No imageUrl provided' });

  if (!queue.includes(imageUrl)) {
    queue.push(imageUrl);
    console.log('📥 Image enqueued:', imageUrl);
  } else {
    console.log('⚠️ Duplicate enqueue ignored:', imageUrl);
  }

  res.json({ success: true });
});

// === GET /api/queue/dequeue ===
router.get('/dequeue', (req, res) => {
  const next = queue.find(url => !processed.has(url));

  if (next) {
    processed.add(next);
    console.log('📤 Dequeued image for processing:', next);
    return res.json({ imageUrl: next });
  }

  res.status(204).send(); // No content
});

// Optional: clear queue
router.delete('/clear', (req, res) => {
  queue = [];
  processed = new Set();
  console.log('🧹 Queue cleared');
  res.json({ message: 'Queue cleared' });
});

export default router;
