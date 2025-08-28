// backend/db.js
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: String(process.env.PGUSER || ''),
  password: String(process.env.PGPASSWORD || ''),
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'pupil_app_db',
  port: Number(process.env.PGPORT || 5432),
  // ssl: { rejectUnauthorized: false } // enable only if your PG requires SSL
});

// Boot-time check (great for EC2 visibility)
pool.connect()
  .then(c => { console.log('✅ PG connected'); c.release(); })
  .catch(err => console.error('❌ PG connect failed:', err.message));

export default pool;
