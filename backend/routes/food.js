// backend/food.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Create uploads folder if it doesn't exist
const uploadDir = path.join('./uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configure multer for storing uploaded images
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}.${file.originalname.split('.').pop()}`),
});
const upload = multer({ storage });

// In-memory store for processed food results
const foodResults = [];

// === POST /api/food/upload ===
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const imageUrl = `https://probably-common-worse-increase.trycloudflare.com/uploads/${req.file.filename}`;
  console.log('📸 Image enqueued:', imageUrl);

  res.json({ message: 'Image uploaded', imageUrl });
});

// === POST /api/food/result ===
router.post('/result', (req, res) => {
  const { imageUrl, items, annotatedImage } = req.body;

  if (!imageUrl || !items || !annotatedImage) {
    console.error('❌ Missing fields:', req.body);
    return res.status(400).json({ error: 'Missing imageUrl, items, or annotatedImage' });
  }

  console.log('✅ Received result:', items);

  foodResults.push({
    imageUrl,
    items,
    annotatedImage,
    timestamp: Date.now()
  });

  res.json({ message: 'Result stored successfully' });
});

// === GET /api/food/results ===
router.get('/results', (req, res) => {
  res.json(foodResults);
});

export default router;
