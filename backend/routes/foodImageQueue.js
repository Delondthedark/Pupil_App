// backend/foodImageQueue.js
import express from 'express';

const router = express.Router();
const queue = [];
const processed = new Set();
const results = [];

// === POST /api/queue/enqueue ===
router.post('/enqueue', (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) return res.status(400).json({ error: 'No imageUrl provided' });

  if (!queue.includes(imageUrl)) {
    queue.push(imageUrl);
    console.log('📸 Image enqueued:', imageUrl);
  }
  res.json({ success: true });
});

// === GET /api/queue/dequeue ===
router.get('/dequeue', (_, res) => {
  const nextImage = queue.find(url => !processed.has(url));
  if (nextImage) {
    processed.add(nextImage);
    console.log('📥 Dequeued image:', nextImage);
    return res.json({ imageUrl: nextImage });
  }
  res.status(204).send();
});

// === POST /api/queue/result ===
router.post('/result', (req, res) => {
  const { item, annotatedImage } = req.body;
  if (!item || !annotatedImage) {
    return res.status(400).json({ error: 'Missing item or annotatedImage' });
  }
  results.unshift({ item, annotatedImage, timestamp: Date.now() });
  console.log('✅ Result saved:', item);
  res.json({ success: true });
});

// === GET /api/queue/results ===
router.get('/results', (_, res) => {
  res.json(results);
});

export default router;
