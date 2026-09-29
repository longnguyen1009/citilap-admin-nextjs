import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../lib/listScope.js', import.meta.url), 'utf8');
const { parseListScope, monthDateRange } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const parse = (query, now) => parseListScope(new URLSearchParams(query), now);
assert.deepEqual(parse('', new Date('2026-08-31T18:00:00Z')), { all: false, monthKey: '09/2026' });
assert.deepEqual(parse('monthKey=06/2026'), { all: false, monthKey: '06/2026' });
assert.deepEqual(parse('all=true'), { all: true });
for (const query of ['monthKey=13/2026', 'monthKey=', 'all=yes', 'all=true&monthKey=09/2026']) {
  assert.throws(() => parse(query));
}
assert.deepEqual(monthDateRange('12/2026'), { start: '2026-12-01', end: '2027-01-01' });
assert.deepEqual(monthDateRange('02/2028'), { start: '2028-02-01', end: '2028-03-01' });
assert.throws(() => monthDateRange('13/2026'));
console.log('PASS: 10 month scope cases (business timezone, year boundary and leap year)');
