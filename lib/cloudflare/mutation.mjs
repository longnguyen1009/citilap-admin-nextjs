import schema from './schema.json' with { type: 'json' };
import { D1ReadQuery } from './query.mjs';
import { quote } from './selection.mjs';

/** Prepared D1 mutations. Callers still own authorization and business transitions. */
export class D1Mutation extends D1ReadQuery {
  constructor(db, table, operation, input, options = {}) {
    super(db, table);
    if (!schema[table]) throw new Error('Cannot write to a view');
    if (!['insert', 'upsert', 'update', 'delete'].includes(operation)) throw new Error('Invalid mutation');
    this.operation = operation; this.input = input; this.options = options; this.returnRows = false;
  }
  select(fields = '*') {
    if (fields.includes('(')) throw new Error('Mutation returning cannot contain relations');
    super.select(fields); this.returnRows = true; return this;
  }
  encode(column, value) {
    const descriptor = schema[this.table].find(item => item.name === column);
    if (!descriptor || descriptor.generated) throw new Error(`Cannot write column: ${column}`);
    if (value === null) return null;
    if (descriptor.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Expected boolean: ${column}`);
      return Number(value);
    }
    if (descriptor.type === 'jsonb') return JSON.stringify(value);
    if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Invalid value: ${column}`);
    return value;
  }
  async execute() {
    try {
      const returning = this.returnRows ? ` RETURNING ${this.fields}` : '';
      const statements = [];
      if (['insert', 'upsert'].includes(this.operation)) {
        const rows = Array.isArray(this.input) ? this.input : [this.input];
        if (!rows.length) return { data: this.returnRows ? [] : null, error: null, count: null };
        for (const row of rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid row');
          const entries = Object.entries(row).filter(([, value]) => value !== undefined);
          if (!entries.length) throw new Error('Empty row');
          const columns = entries.map(([name]) => name);
          const values = entries.map(([name, value]) => this.encode(name, value));
          let sql = `INSERT INTO ${quote(this.table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
          if (this.operation === 'upsert') {
            const conflict = (this.options.onConflict || 'id').split(',').map(name => name.trim());
            conflict.forEach(name => this.column(name));
            const changed = columns.filter(name => !conflict.includes(name));
            sql += ` ON CONFLICT (${conflict.map(quote).join(',')}) `;
            // A no-op update still returns the existing row, matching upsert().select().
            sql += `DO UPDATE SET ${changed.length ? changed.map(name => `${quote(name)}=excluded.${quote(name)}`).join(',') : `${quote(conflict[0])}=excluded.${quote(conflict[0])}`}`;
          }
          statements.push(this.db.prepare(sql + returning).bind(...values));
        }
      } else {
        if (!this.conditions.length) throw new Error('Mutation requires an explicit filter');
        let sql; let values = [];
        if (this.operation === 'delete') sql = `DELETE FROM ${quote(this.table)}`;
        else {
          if (!this.input || Array.isArray(this.input) || typeof this.input !== 'object') throw new Error('Invalid update');
          const entries = Object.entries(this.input).filter(([, value]) => value !== undefined);
          if (!entries.length) throw new Error('Empty update');
          values = entries.map(([name, value]) => this.encode(name, value));
          sql = `UPDATE ${quote(this.table)} SET ${entries.map(([name]) => `${quote(name)}=?`).join(',')}`;
        }
        sql += ` WHERE ${this.conditions.join(' AND ')}`;
        statements.push(this.db.prepare(sql + returning).bind(...values, ...this.values));
      }
      if (this.cardinality) {
        if (!this.returnRows) throw new Error('single() requires select()');
        if (['insert', 'upsert'].includes(this.operation)) {
          if (statements.length !== 1) throw new Error('Single-row mutation requires exactly one input row');
        } else {
          // Validate affected cardinality inside the write transaction so a failed
          // single() cannot commit an accidental multirow update or deletion.
          const condition = this.cardinality === 'one' ? '=1' : '<=1';
          statements.unshift(this.db.prepare(`SELECT CASE WHEN count(*)${condition} THEN 1
            ELSE json('single-row mutation cardinality violation') END AS valid
            FROM ${quote(this.table)} WHERE ${this.conditions.join(' AND ')}`).bind(...this.values));
        }
      }
      const results = await this.db.batch(statements);
      const outputs = this.cardinality && ['update', 'delete'].includes(this.operation) ? results.slice(1) : results;
      const rows = this.returnRows ? outputs.flatMap(result => result.results).map(row => this.decode(row)) : null;
      return { data: this.cardinality ? rows[0] ?? null : rows, count: null, error: null };
    } catch (error) { return { data: null, count: null, error: { message: error.message } }; }
  }
}
