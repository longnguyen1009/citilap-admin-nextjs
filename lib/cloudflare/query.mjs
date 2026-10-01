import schema from './schema.json' with { type: 'json' };
import { selection, relationship } from './selection.mjs';

const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('Invalid SQL identifier');
  return `"${name}"`;
};
const bindValue = value => typeof value === 'boolean' ? Number(value) : value;
const views = new Set(['cash_account_balances', 'cod_receivable_summaries', 'customer_receivable_summaries',
  'laptop_landed_costs', 'order_sales_operations_summary', 'purchase_batch_summaries', 'unified_inventory']);

/** Read-only D1 query builder. Values are always bound, never interpolated into SQL. */
export class D1ReadQuery {
  constructor(db, table) {
    if (!schema[table] && !views.has(table)) throw new Error(`Unknown table: ${table}`);
    this.db = db; this.table = table; this.fields = '*'; this.conditions = []; this.values = [];
    this.sort = []; this.offset = 0; this.size = null; this.cardinality = null; this.count = false;
  }
  column(name) {
    if (name.includes('.')) {
      const [table, column, extra] = name.split('.');
      if (extra || !schema[table]?.some(item => item.name === column)) throw new Error('Invalid related column');
      const relation = relationship(this.table, table);
      if (relation.many) throw new Error('To-many filters require explicit EXISTS');
      return `(SELECT ${identifier(table)}.${identifier(column)} FROM ${identifier(table)} WHERE ${identifier(table)}.${identifier(relation.foreign)}=${identifier(this.table)}.${identifier(relation.local)} LIMIT 1)`;
    }
    if (schema[this.table] && !schema[this.table].some(column => column.name === name)) throw new Error(`Unknown column: ${name}`);
    return identifier(name);
  }
  select(fields = '*', options = {}) {
    this.selection = fields === '*' && views.has(this.table) ? null : selection(this.table, fields);
    this.fields = this.selection ? this.selection.columns.map(column => `${column.sql} AS ${identifier(column.name)}`).join(',') : '*';
    this.count = options.count === 'exact'; this.head = options.head === true; return this;
  }
  compare(column, operator, value) {
    this.conditions.push(`${this.column(column)} ${operator} ?`); this.values.push(bindValue(value)); return this;
  }
  eq(column, value) { return this.compare(column, '=', value); }
  neq(column, value) { return this.compare(column, '<>', value); }
  gt(column, value) { return this.compare(column, '>', value); }
  gte(column, value) { return this.compare(column, '>=', value); }
  lt(column, value) { return this.compare(column, '<', value); }
  lte(column, value) { return this.compare(column, '<=', value); }
  ilike(column, value) { return this.compare(column, 'LIKE', value); }
  is(column, value) {
    if (value !== null && typeof value !== 'boolean') throw new Error('IS accepts only null or boolean');
    return this.compare(column, 'IS', value);
  }
  in(column, values) {
    if (!Array.isArray(values)) throw new Error('IN requires an array');
    this.conditions.push(values.length ? `${this.column(column)} IN (SELECT value FROM json_each(?))` : '0');
    if (values.length) this.values.push(JSON.stringify(values.map(bindValue)));
    return this;
  }
  not(column, operator, value) {
    if (operator === 'is' && value === null) { this.conditions.push(`${this.column(column)} IS NOT NULL`); return this; }
    if (operator === 'eq') return this.neq(column, value);
    if (operator === 'in' && typeof value === 'string' && /^\([a-z0-9_, -]*\)$/i.test(value)) {
      this.conditions.push(`${this.column(column)} NOT IN (SELECT value FROM json_each(?))`);
      this.values.push(JSON.stringify(value.slice(1, -1).split(',').map(item => item.trim()))); return this;
    }
    throw new Error('Unsupported NOT filter');
  }
  order(column, { ascending = true, nullsFirst = false } = {}) {
    this.sort.push(`${this.column(column)} ${ascending ? 'ASC' : 'DESC'} NULLS ${nullsFirst ? 'FIRST' : 'LAST'}`); return this;
  }
  limit(size) {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid limit');
    this.size = size; return this;
  }
  range(from, to) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) throw new Error('Invalid range');
    this.offset = from; return this.limit(to - from + 1);
  }
  single() { this.cardinality = 'one'; return this; }
  maybeSingle() { this.cardinality = 'optional'; return this; }
  decode(row) {
    const result = { ...row };
    for (const column of schema[this.table] || []) {
      if (result[column.name] === null || result[column.name] === undefined) continue;
      if (column.type === 'boolean') result[column.name] = Boolean(result[column.name]);
      if (column.type === 'jsonb') result[column.name] = JSON.parse(result[column.name]);
    }
    if (this.table === 'laptop_landed_costs' && typeof result.reasons === 'string') result.reasons = JSON.parse(result.reasons);
    for (const name of ['is_active', 'source_unresolved']) {
      if (views.has(this.table) && result[name] !== undefined && result[name] !== null) result[name] = Boolean(result[name]);
    }
    for (const name of this.selection?.jsonFields || []) {
      if (typeof result[name] === 'string') result[name] = JSON.parse(result[name]);
    }
    return result;
  }
  async execute() {
    try {
      const conditions = [...this.conditions, ...(this.selection?.guards || [])];
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      const order = this.sort.length ? ` ORDER BY ${this.sort.join(',')}` : '';
      const limit = this.size === null ? '' : ' LIMIT ? OFFSET ?';
      const params = this.size === null ? this.values : [...this.values, this.size, this.offset];
      const queries = [];
      if (!this.head) queries.push(this.db.prepare(`SELECT ${this.fields} FROM ${identifier(this.table)}${where}${order}${limit}`).bind(...params));
      if (this.count) queries.push(this.db.prepare(`SELECT count(*) AS total FROM ${identifier(this.table)}${where}`).bind(...this.values));
      // One transaction gives rows/count a consistent snapshot.
      const results = queries.length ? await this.db.batch(queries) : [];
      const rows = this.head ? null : results[0].results.map(row => this.decode(row));
      const count = this.count ? results.at(-1).results[0].total : null;
      if (this.cardinality && (rows.length > 1 || (this.cardinality === 'one' && rows.length !== 1))) {
        return { data: null, count, error: { code: 'PGRST116', message: 'Expected a single row' } };
      }
      return { data: this.cardinality ? rows[0] ?? null : rows, count, error: null };
    } catch (error) { return { data: null, count: null, error: { message: error.message } }; }
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
}
