// backend/db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'myuser',
  host: 'localhost',
  database: 'mydb',
  password: 'your_password',
  port: 5432, // or your actual port
});

export default pool;

