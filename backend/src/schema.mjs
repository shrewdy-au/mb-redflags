import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { q, end } from './lib/db.mjs';
import { BACKEND } from './lib/download.mjs';

await q(readFileSync(join(BACKEND, 'sql', 'schema.sql'), 'utf8'));
console.log('schema ok');
await end();
