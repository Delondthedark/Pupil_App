import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

if (!process.env.PGPASSWORD) {
  console.error("❌ Missing PGPASSWORD in environment");
}

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  ssl: false
});

// Quick self-test
pool.connect()
  .then(client => {
    console.log("✅ Connected to PostgreSQL:", process.env.PGDATABASE);
    client.release();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err.message);
  });

export default pool;
