import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const uploadDir = path.join('./uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}.${file.originalname.split('.').pop()}`),
});
const upload = multer({ storage });

router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const imageUrl = `https://trying-motors-mb-infected.trycloudflare.com/uploads/${req.file.filename}`;
  console.log('📸 Image enqueued:', imageUrl);

  // Optional enqueue here
  res.json({ message: 'Image uploaded', imageUrl });
});

export default router;
