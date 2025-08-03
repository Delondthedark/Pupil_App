// backend/routes/food.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const uploadDir = path.join('./uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}.${file.originalname.split('.').pop()}`),
});
const upload = multer({ storage });

const foodResults = [];

// POST /api/food/upload
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
  const imageUrl = `${publicUrl}/uploads/${req.file.filename}`;
  console.log('📸 Image uploaded at:', imageUrl);

  res.json({ message: 'Image uploaded', imageUrl });
});

// POST /api/food/result
router.post('/result', (req, res) => {
  const { imageUrl, items, annotatedImage } = req.body;
  if (!imageUrl || !items || !annotatedImage) {
    console.error('❌ Missing fields:', req.body);
    return res.status(400).json({ error: 'Missing imageUrl, items, or annotatedImage' });
  }

  console.log('✅ Received result:', items);

  foodResults.unshift({
    imageUrl,
    items,
    annotatedImage,
    timestamp: Date.now(),
  });

  res.json({ message: 'Result stored successfully' });
});

// GET /api/food/results
router.get('/results', (req, res) => {
  res.json(foodResults);
});

export default router;
