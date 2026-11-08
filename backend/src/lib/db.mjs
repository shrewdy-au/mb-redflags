// Shared pg pool. DATABASE_URL defaults to the docker-compose PostGIS.
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';

export const DATABASE_URL = process.env.DATABASE_URL || 'postgres://mbrf:mbrf@127.0.0.1:5433/mbrf';
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8, statement_timeout: 0 });

export const q = (text, params) => pool.query(text, params);
export const one = async (text, params) => (await pool.query(text, params)).rows[0];

/** COPY a readable stream into `table` (text or csv). */
export async function copyInto(table, readable, { format = 'csv', delimiter = ',', header = true, columns } = {}) {
  const client = await pool.connect();
  try {
    const cols = columns ? `(${columns.map((c) => `"${c}"`).join(',')})` : '';
    const sql = `COPY ${table} ${cols} FROM STDIN WITH (FORMAT ${format}, DELIMITER '${delimiter}', HEADER ${header ? 'true' : 'false'}, QUOTE '"', NULL '')`;
    await pipeline(readable, client.query(copyFrom(sql)));
  } finally {
    client.release();
  }
}

/** Run fn inside a transaction on one client. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function end() { await pool.end(); }
