// backend/routes/sleep.js
import express from 'express';
const router = express.Router();

// POST /api/sleep
router.post('/', async (req, res) => {
  const {
    date,
    remSleep,
    coreSleep,
    deepSleep,
    totalSleep
  } = req.body;

  try {
    const result = await req.pool.query(
      `INSERT INTO sleep (
        date, rem_sleep, core_sleep, deep_sleep, total_sleep
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (date) DO UPDATE SET
        rem_sleep = EXCLUDED.rem_sleep,
        core_sleep = EXCLUDED.core_sleep,
        deep_sleep = EXCLUDED.deep_sleep,
        total_sleep = EXCLUDED.total_sleep
      RETURNING *`,
      [date, remSleep, coreSleep, deepSleep, totalSleep]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Insert Error:', err);
    res.status(500).json({ error: 'Could not add sleep' });
  }
});

// GET /api/sleep
router.get('/', async (req, res) => {
  try {
    const result = await req.pool.query(
      'SELECT * FROM sleep ORDER BY date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Error:', err);
    res.status(500).json({ error: 'Could not fetch sleep records' });
  }
});

export default router;
