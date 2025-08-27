// ESM
import 'dotenv/config';
import pg from 'pg';

const {
  PGUSER,
  PGPASSWORD,
  PGHOST = 'localhost',
  PGDATABASE,
  PGPORT = '5432',
} = process.env;

if (!PGUSER || !PGPASSWORD || !PGDATABASE) {
  console.error('[DB] Missing PG envs. Got:', {
    PGUSER, PGPASSWORD: PGPASSWORD ? '***' : undefined, PGDATABASE, PGHOST, PGPORT
  });
}

export const pool = new pg.Pool({
  user: PGUSER,
  password: String(PGPASSWORD),           // force string
  host: PGHOST,
  database: PGDATABASE,
  port: Number(PGPORT),
  ssl: false,                             // set true if using RDS with SSL
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err);
});
