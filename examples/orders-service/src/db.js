import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function insertOrder({ customerId, amountCents, currency }) {
  const { rows } = await pool.query(
    `INSERT INTO orders (customer_id, amount_cents, currency, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [customerId, amountCents, currency],
  );
  return rows[0];
}

export async function getOrder(id) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function updateStatus(id, status, failureReason = null) {
  await pool.query(
    'UPDATE orders SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1',
    [id, status, failureReason],
  );
}

export async function ping() {
  await pool.query('SELECT 1');
}
