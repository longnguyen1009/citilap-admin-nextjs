import schema from './schema.json' with { type: 'json' };
import relations from './relations.json' with { type: 'json' };

export function quote(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('Invalid SQL identifier');
  return `"${name}"`;
}
function split(source) {
  const items = []; let depth = 0; let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')') depth--;
    if (depth < 0) throw new Error('Unbalanced selection');
    if (source[i] === ',' && depth === 0) { items.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (depth) throw new Error('Unbalanced selection');
  items.push(source.slice(start).trim()); return items;
}
export function relationship(table, destination, hint) {
  const matches = relations.filter(item => ((item.from === table && item.to === destination)
    || (item.to === table && item.from === destination)) && (!hint || item.name === hint || item.column === hint));
  if (matches.length !== 1) throw new Error(`Missing or ambiguous relation: ${table} -> ${destination}`);
  const relation = matches[0];
  return relation.from === table ? { local: relation.column, foreign: relation.target, many: false }
    : { local: relation.target, foreign: relation.column, many: true };
}
export function selection(table, fields, alias = table, depth = 0) {
  if (depth > 5) throw new Error('Selection nesting limit exceeded');
  const columns = []; const jsonFields = []; const guards = [];
  const ref = name => `${quote(alias)}.${quote(name)}`;
  for (const item of split(fields)) {
    if (item === '*') {
      if (!schema[table]) throw new Error('Nested view wildcard is unsupported');
      for (const column of schema[table]) columns.push({ name: column.name, sql: ref(column.name), type: column.type });
      continue;
    }
    const nested = /^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s.exec(item);
    if (nested) {
      const [, custom, target, modifier, subfields] = nested;
      const relation = relationship(table, target, modifier === 'inner' ? null : modifier);
      const childAlias = `rel_${depth}_${columns.length}`;
      const child = selection(target, subfields, childAlias, depth + 1);
      const where = `${quote(childAlias)}.${quote(relation.foreign)}=${ref(relation.local)}`;
      const conditions = [where, ...child.guards].join(' AND ');
      const object = `json_object(${child.columns.map(column => `'${column.name}',${jsonValue(column)}`).join(',')})`;
      const sql = relation.many
        ? `(SELECT json_group_array(${object}) FROM ${quote(target)} ${quote(childAlias)} WHERE ${conditions})`
        : `(SELECT ${object} FROM ${quote(target)} ${quote(childAlias)} WHERE ${conditions} LIMIT 1)`;
      const name = custom || target;
      columns.push({ name, sql, type: 'jsonb' }); jsonFields.push(name);
      if (modifier === 'inner') guards.push(`EXISTS(SELECT 1 FROM ${quote(target)} ${quote(childAlias)} WHERE ${conditions})`);
    } else {
      const [custom, name] = item.includes(':') ? item.split(':') : [item, item];
      quote(custom); quote(name);
      const column = schema[table]?.find(column => column.name === name);
      if (schema[table] && !column) throw new Error(`Unknown column ${table}.${name}`);
      columns.push({ name: custom, sql: ref(name), type: column?.type });
    }
  }
  return { columns, jsonFields, guards };
}
function jsonValue(column) {
  if (column.type === 'jsonb') return `json(${column.sql})`;
  if (column.type === 'boolean') return `json(CASE WHEN ${column.sql} IS NULL THEN 'null' WHEN ${column.sql}=1 THEN 'true' ELSE 'false' END)`;
  return column.sql;
}
